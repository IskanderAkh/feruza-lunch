import { InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { User, Order, Payment } from '../models/index.js';
import { fmt } from '../helpers.js';
import { notifyUser } from './notify.js';

const fullName = (from) => [from.first_name, from.last_name].filter(Boolean).join(' ');

// Сохраняет/обновляет пользователя Telegram. Если повар раньше записала
// заказ на его @username, «заготовка» привязывается к реальному аккаунту.
export async function touchUser(from, { started = false } = {}) {
  if (!from || from.is_bot) return null;
  const set = { name: fullName(from) };
  if (from.username) set.username = from.username.toLowerCase();
  if (started) set.started = true;

  let user = await User.findOneAndUpdate({ tgId: from.id }, { $set: set }, { new: true });
  if (user) return user;

  if (set.username) {
    user = await User.findOneAndUpdate(
      { username: set.username, tgId: null },
      { $set: { ...set, tgId: from.id } },
      { new: true }
    );
    if (user) return user;
  }

  try {
    return await User.create({ tgId: from.id, ...set });
  } catch (e) {
    if (e.code === 11000) return User.findOne({ tgId: from.id });
    throw e;
  }
}

export async function findOrCreateByUsername(raw) {
  const username = raw.replace(/^@/, '').toLowerCase();
  return (await User.findOne({ username })) || User.create({ username });
}

const ACTIVE_ORDER = { status: { $ne: 'cancelled' } };

async function sumBy(Model, match) {
  return Model.aggregate([
    { $match: match },
    { $group: { _id: '$user', total: { $sum: '$amount' } } },
  ]);
}

// Долг = все неотменённые заказы − подтверждённые оплаты
export async function balance(userId) {
  const [[o], [p]] = await Promise.all([
    sumBy(Order, { user: userId, ...ACTIVE_ORDER }),
    sumBy(Payment, { user: userId, status: 'confirmed' }),
  ]);
  return (o?.total || 0) - (p?.total || 0);
}

export async function debtors() {
  const [orders, pays] = await Promise.all([
    sumBy(Order, ACTIVE_ORDER),
    sumBy(Payment, { status: 'confirmed' }),
  ]);
  const map = new Map();
  for (const o of orders) map.set(String(o._id), o.total);
  for (const p of pays) map.set(String(p._id), (map.get(String(p._id)) || 0) - p.total);

  const ids = [...map].filter(([, v]) => v > 0).map(([k]) => k);
  const users = await User.find({ _id: { $in: ids } });
  return users
    .map((user) => ({ user, debt: map.get(String(user._id)) }))
    .sort((a, b) => b.debt - a.debt);
}

export async function remindDebtors() {
  const kb = config.publicUrl
    ? new InlineKeyboard().webApp('💸 Оплатить', `${config.publicUrl}/#pay`)
    : undefined;
  let sent = 0;
  const failed = [];
  for (const { user, debt } of await debtors()) {
    const ok = await notifyUser(user,
      `🔔 Напоминание: за обеды нужно оплатить ${fmt(debt)}.\nОтправьте скриншот перевода через меню или прямо сюда.`,
      { reply_markup: kb });
    ok ? sent++ : failed.push(user);
    await new Promise((r) => setTimeout(r, 50)); // не упираться в лимиты Telegram
  }
  return { sent, failed };
}
