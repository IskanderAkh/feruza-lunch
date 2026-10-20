import { Composer, InputFile, InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { Order, Payment } from '../models/index.js';
import { touchUser, findOrCreateByUsername, balance, debtors, remindDebtors } from '../services/ledger.js';
import { createAdminOrder, acceptOrder, cancelOrder, setCustomPrice } from '../services/orders.js';
import { reviewPayment, cashPayment } from '../services/payments.js';
import { fmt, parseAmount, displayName, replyLong, UserError } from '../helpers.js';

export const isAdmin = (ctx) => config.adminIds.includes(ctx.from?.id);

export const admin = new Composer();
const a = admin.filter(isAdmin);

const USAGE = {
  pack:
    `Пакет за ${fmt(config.packPrice)}:\n` +
    '/pack @user — один пакет\n/pack @user 2 — два пакета\n' +
    '/pack @ali @vali 2 @sami — сразу нескольким\nили ответом на сообщение: /pack',
  custom: 'Заказ вне меню:\n/custom @user 55000 шашлык\nили ответом на сообщение: /custom 55000 шашлык',
  paid: 'Оплата наличными:\n/paid @user 40000\n/paid @user — закрыть весь долг\nили ответом на сообщение: /paid 40000',
};

async function replyTarget(ctx) {
  const r = ctx.message?.reply_to_message;
  if (!r || !r.from || r.from.is_bot || r.forum_topic_created) return null;
  return touchUser(r.from);
}

async function singleTarget(ctx, text) {
  const mention = text.match(/@\w+/);
  return mention ? findOrCreateByUsername(mention[0]) : replyTarget(ctx);
}

const toQty = (t) => {
  const n = parseInt(String(t ?? '').replace(/^[x×х]/i, ''), 10);
  return n > 0 && n <= 50 ? n : null;
};

// Заказы, которые по-старому пишут в группе

a.command('pack', async (ctx) => {
  const tokens = (ctx.match || '').split(/\s+/).filter(Boolean);
  let targets = [];
  if (!tokens.some((t) => t.startsWith('@'))) {
    const user = await replyTarget(ctx);
    if (user) targets = [{ user, qty: toQty(tokens[0]) ?? 1 }];
  } else {
    for (const t of tokens) {
      if (t.startsWith('@')) targets.push({ username: t, qty: 1 });
      else if (targets.length && toQty(t)) targets.at(-1).qty = toQty(t);
    }
    for (const t of targets) t.user = await findOrCreateByUsername(t.username);
  }
  if (!targets.length) return ctx.reply(USAGE.pack);

  const lines = [];
  for (const { user, qty } of targets) {
    const { debt } = await createAdminOrder(user, { items: [{ name: 'Пакет', price: config.packPrice, qty }] }, ctx.from.id);
    lines.push(`• ${displayName(user)}: пакет${qty > 1 ? ` ×${qty}` : ''} (долг ${fmt(debt)})`);
  }
  await ctx.reply('✅ Записал:\n' + lines.join('\n'));
});

a.command('custom', async (ctx) => {
  const text = ctx.match || '';
  const user = await singleTarget(ctx, text);
  const rest = text.replace(/@\w+/g, ' ');
  const amt = parseAmount(rest);
  if (!user || !amt) return ctx.reply(USAGE.custom);
  const note = rest.replace(amt.raw, ' ').replace(/\s+/g, ' ').trim() || 'заказ вне меню';
  const { debt } = await createAdminOrder(user, { customRequest: note, customPrice: amt.value }, ctx.from.id);
  await ctx.reply(`✅ ${displayName(user)}: ${note} — ${fmt(amt.value)} (долг ${fmt(debt)})`);
});

a.command('paid', async (ctx) => {
  const text = ctx.match || '';
  const user = await singleTarget(ctx, text);
  if (!user) return ctx.reply(USAGE.paid);
  const amount = parseAmount(text.replace(/@\w+/g, ' '))?.value ?? (await balance(user._id));
  if (amount <= 0) return ctx.reply(`У ${displayName(user)} нет долга.`);
  const left = await cashPayment(user, amount, ctx.from.id);
  await ctx.reply(`✅ ${displayName(user)} оплатил ${fmt(amount)}. Остаток: ${fmt(left)}`);
});

a.command('undo', async (ctx) => {
  const last = await Order.findOne({ createdBy: ctx.from.id, source: 'admin', status: { $ne: 'cancelled' } })
    .sort({ createdAt: -1 }).populate('user');
  if (!last) return ctx.reply('Нечего отменять.');
  last.status = 'cancelled';
  await last.save();
  await ctx.reply(`↩️ Отменён заказ #${last.number}: ${displayName(last.user)}, ${fmt(last.amount)}`);
});

a.command('debts', async (ctx) => {
  const list = await debtors();
  if (!list.length) return ctx.reply('Должников нет 🎉');
  const total = list.reduce((s, d) => s + d.debt, 0);
  let text = `📋 Должники (${list.length}):\n\n` +
    list.map(({ user, debt }) => `${user.started ? '' : '⚠️ '}${displayName(user)} — ${fmt(debt)}`).join('\n') +
    `\n\nИтого: ${fmt(total)}`;
  if (list.some((d) => !d.user.started)) text += '\n⚠️ — не запускали бота, напоминание не дойдёт';
  await replyLong(ctx, text);
});

a.command('remind', async (ctx) => {
  const { sent, failed } = await remindDebtors();
  let text = `Напоминания отправлены: ${sent}`;
  if (failed.length) text += `\nНе дошли (${failed.length}): ${failed.map(displayName).join(', ')}`;
  await replyLong(ctx, text);
});

a.command('report', async (ctx) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const date = (d) => d.toISOString().slice(0, 16).replace('T', ' ');
  const rows = [['Дата', 'Тип', '№', 'Имя', 'Username', 'Состав', 'Сумма', 'Статус']];
  const orderStatus = { new: 'новый', accepted: 'принят', cancelled: 'отменён' };
  for (const o of await Order.find().populate('user').sort({ createdAt: 1 })) {
    const what = [...o.items.map((i) => `${i.name} ×${i.qty}`), o.customRequest].filter(Boolean).join(', ');
    rows.push([date(o.createdAt), 'Заказ', o.number, o.user?.name, o.user?.username, what, o.amount, orderStatus[o.status]]);
  }
  const payStatus = { pending: 'ждёт проверки', confirmed: 'подтверждена', rejected: 'отклонена' };
  for (const p of await Payment.find().populate('user').sort({ createdAt: 1 })) {
    rows.push([date(p.createdAt), p.method === 'cash' ? 'Оплата наличными' : 'Оплата', '', p.user?.name,
      p.user?.username, '', p.amount, payStatus[p.status]]);
  }
  const csv = '\ufeff' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
  await ctx.replyWithDocument(new InputFile(Buffer.from(csv, 'utf8'), `report_${new Date().toISOString().slice(0, 10)}.csv`));
});

// Кнопка для группы: inline-кнопки Mini App в группах не работают,
// поэтому ведём в личку бота, где есть кнопка «Меню».
a.command('pay', async (ctx) => {
  const kb = new InlineKeyboard().url('🍽 Заказать и оплатить', `https://t.me/${ctx.me.username}?start=menu`);
  await ctx.reply('Заказы и оплата теперь через бота 🙌\nНажмите кнопку, потом «Меню» внизу чата.', { reply_markup: kb });
});

a.command('help', (ctx) => ctx.reply([USAGE.pack, USAGE.custom, USAGE.paid,
  '/undo — отменить последнюю запись\n/debts — должники\n/remind — напомнить всем\n' +
  '/report — выгрузка в Excel\n/pay — кнопка заказа для группы\n\nВсё остальное — в Mini App: кнопка «Меню».'].join('\n\n')));

// Кнопки под скриншотами оплаты
a.callbackQuery(/^(ok|no):(\w+)$/, async (ctx) => {
  const [, action, id] = ctx.match;
  const p = await reviewPayment(id, action === 'ok' ? 'confirmed' : 'rejected', ctx.from.id);
  await ctx.answerCallbackQuery(p ? undefined : { text: 'Уже обработано' });
});

// Кнопки под заказами
a.callbackQuery(/^(oa|oc):(\w+)$/, async (ctx) => {
  const [, action, id] = ctx.match;
  action === 'oa' ? await acceptOrder(id) : await cancelOrder(id);
  await ctx.answerCallbackQuery();
});

a.callbackQuery(/^op:(\w+)$/, async (ctx) => {
  const order = await Order.findById(ctx.match[1]);
  if (!order?.customRequest) return ctx.answerCallbackQuery({ text: 'Заказ не найден' });
  ctx.dbUser.pendingAction = { kind: 'price', orderId: String(order._id) };
  await ctx.dbUser.save();
  await ctx.answerCallbackQuery();
  await ctx.api.sendMessage(ctx.from.id,
    `Цена для «${order.customRequest}» (заказ #${order.number})? Напишите числом.`,
    { reply_markup: { force_reply: true, input_field_placeholder: 'Например, 55000' } });
});

// Ответ повара с ценой
a.chatType('private').on('message:text', async (ctx, next) => {
  const pa = ctx.dbUser?.pendingAction;
  if (!pa) return next();
  if (ctx.message.text.startsWith('/')) {
    ctx.dbUser.pendingAction = null;
    await ctx.dbUser.save();
    return next();
  }
  const amt = parseAmount(ctx.message.text);
  if (!amt) return ctx.reply('Напишите цену числом, например 55000.');
  ctx.dbUser.pendingAction = null;
  await ctx.dbUser.save();
  try {
    const o = await setCustomPrice(pa.orderId, amt.value);
    await ctx.reply(`✅ Заказ #${o.number}: ${o.customRequest} — ${fmt(amt.value)}. Итого ${fmt(o.amount)}`);
  } catch (e) {
    if (e instanceof UserError) return ctx.reply(e.message);
    throw e;
  }
});
