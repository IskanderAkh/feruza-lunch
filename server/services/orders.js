import mongoose from 'mongoose';
import { InlineKeyboard } from 'grammy';
import { Dish, Order, nextSeq } from '../models/index.js';
import { config } from '../config.js';
import { fmt, displayName, UserError, localDate, formatDay, dayLabel, MAX_DAYS_AHEAD } from '../helpers.js';
import { tgApi, notifyUser, toAdmins, editAdminMessages } from './notify.js';
import { balance } from './ledger.js';

const STATUS = { new: '🆕 новый', accepted: '✅ принят', cancelled: '❌ отменён' };

export function orderLines(o) {
  const lines = o.items.map((i) => `• ${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''} — ${fmt(i.price * i.qty)}`);
  if (o.customRequest) {
    lines.push(`• Вне меню: ${o.customRequest} — ${o.customPrice != null ? fmt(o.customPrice) : 'цену укажет повар'}`);
  }
  return lines;
}

const priceMissing = (o) => o.customRequest && o.customPrice == null;

// Предзаказ — заказ не на тот день, когда его сделали
const isPreorder = (o) => o.forDate && o.forDate !== localDate(0, o.createdAt ?? Date.now());
const forText = (o) => (isPreorder(o) ? ` на ${dayLabel(o.forDate)}` : '');

// Дата из Mini App. Пусто = сегодня.
export function parseForDate(value) {
  if (value == null || value === '') return localDate();
  const date = String(value);
  // 2026-02-31 Date «молча» превращает в 3 марта — сверяем обратно
  const d = new Date(`${date}T00:00:00Z`);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(date);
  if (!valid) throw new UserError('Неверная дата заказа');
  if (date < localDate()) throw new UserError('Нельзя заказать на прошедший день');
  if (date > localDate(MAX_DAYS_AHEAD)) throw new UserError(`Заказать можно не больше чем на ${MAX_DAYS_AHEAD} дней вперёд`);
  return date;
}

// Старые заказы были без даты — проставляем день создания
export async function migrateOrderDates() {
  const off = Math.round(config.tzOffset * 60);
  const pad = (n) => String(n).padStart(2, '0');
  const tz = `${off < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  await Order.updateMany({ forDate: null }, [
    { $set: { forDate: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } } } },
  ]);
}

function adminText(o, user) {
  return [
    `Заказ #${o.number}: ${STATUS[o.status]}`,
    displayName(user),
    ...(isPreorder(o) ? [`📅 Предзаказ на ${formatDay(o.forDate)}`] : []),
    '',
    ...orderLines(o),
    ...(o.comment ? ['', `💬 ${o.comment}`] : []),
    '',
    `Итого: ${fmt(o.amount)}${priceMissing(o) ? ' + блюдо вне меню' : ''}`,
  ].join('\n');
}

function adminKeyboard(o) {
  if (o.status === 'cancelled') return undefined;
  const kb = new InlineKeyboard();
  if (priceMissing(o)) kb.text('💰 Указать цену', `op:${o._id}`).row();
  if (o.status === 'new') kb.text('✅ Принять', `oa:${o._id}`).text('❌ Отменить', `oc:${o._id}`);
  return kb.inline_keyboard.flat().length ? kb : undefined;
}

async function refreshAdmin(o) {
  if (!o.populated('user')) await o.populate('user');
  await editAdminMessages(o.adminMessages, (chatId, messageId) =>
    tgApi().editMessageText(chatId, messageId, adminText(o, o.user), { reply_markup: adminKeyboard(o) }));
}

async function getOrder(id) {
  if (!mongoose.isValidObjectId(id)) throw new UserError('Заказ не найден', 404);
  const o = await Order.findById(id).populate('user');
  if (!o) throw new UserError('Заказ не найден', 404);
  return o;
}

// Заказ из Mini App. Цены берутся только из базы, клиенту не доверяем.
export async function createOrder(user, { items = [], customRequest = '', comment = '', forDate = localDate() }) {
  const wanted = (Array.isArray(items) ? items : []).filter(
    (i) => i && mongoose.isValidObjectId(i.dishId) && Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 20
  );
  const dishes = await Dish.find({ _id: { $in: wanted.map((i) => i.dishId) }, available: true }).select('-image.data');
  const byId = new Map(dishes.map((d) => [String(d._id), d]));
  if (wanted.some((i) => !byId.has(String(i.dishId)))) {
    throw new UserError('Часть блюд уже закончилась. Обновите меню и проверьте корзину.');
  }

  const order = new Order({
    user: user._id,
    items: wanted.map((i) => {
      const d = byId.get(String(i.dishId));
      return { dish: d._id, name: d.name, price: d.price, qty: i.qty };
    }),
    customRequest: String(customRequest).trim().slice(0, 300) || undefined,
    comment: String(comment).trim().slice(0, 300) || undefined,
    forDate,
    source: 'app',
  });
  if (!order.items.length && !order.customRequest) throw new UserError('Корзина пуста');

  order.number = await nextSeq('order');
  await order.save();

  const sent = await toAdmins((chatId) =>
    tgApi().sendMessage(chatId, adminText(order, user), { reply_markup: adminKeyboard(order) }));
  order.adminMessages = sent.map(({ chatId, messageId }) => ({ chatId, messageId }));
  await order.save();
  return order;
}

// Заказ, записанный поваром командой (/pack, /custom) — сразу принят
export async function createAdminOrder(user, { items = [], customRequest, customPrice = null }, adminId) {
  const order = new Order({
    user: user._id, items, customRequest, customPrice,
    status: 'accepted', source: 'admin', createdBy: adminId, forDate: localDate(),
    number: await nextSeq('order'),
  });
  await order.save();
  const debt = await balance(user._id);
  await notifyUser(user, `🍱 Записан заказ #${order.number}:\n${orderLines(order).join('\n')}\nК оплате всего: ${fmt(debt)}`);
  return { order, debt };
}

export async function acceptOrder(id) {
  const o = await getOrder(id);
  if (o.status !== 'new') return o;
  o.status = 'accepted';
  await o.save();
  const debt = await balance(o.user._id);
  await notifyUser(o.user,
    `✅ Заказ #${o.number}${forText(o)} принят!\n${orderLines(o).join('\n')}\n\nК оплате всего: ${fmt(debt)}` +
    (priceMissing(o) ? '\nЦену блюда вне меню повар сообщит отдельно.' : ''));
  await refreshAdmin(o);
  return o;
}

export async function cancelOrder(id) {
  const o = await getOrder(id);
  if (o.status === 'cancelled') return o;
  o.status = 'cancelled';
  await o.save();
  await notifyUser(o.user, `❌ Заказ #${o.number}${forText(o)} отменён. Если это ошибка — напишите повару.`);
  await refreshAdmin(o);
  return o;
}

export async function setCustomPrice(id, price) {
  const o = await getOrder(id);
  if (!o.customRequest) throw new UserError('В этом заказе нет блюда вне меню');
  if (!(price > 0)) throw new UserError('Укажите цену больше нуля');
  o.customPrice = price;
  await o.save();
  const debt = await balance(o.user._id);
  await notifyUser(o.user,
    `💰 Цена блюда вне меню (заказ #${o.number}):\n${o.customRequest} — ${fmt(price)}\n\nСумма заказа: ${fmt(o.amount)}\nК оплате всего: ${fmt(debt)}`);
  await refreshAdmin(o);
  return o;
}
