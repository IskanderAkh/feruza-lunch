import { Composer, InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { Order } from '../models/index.js';
import { balance } from '../services/ledger.js';
import { createPayment } from '../services/payments.js';
import { fmt, parseAmount, UserError } from '../helpers.js';

export const user = new Composer();
const pm = user.chatType('private');

const appKeyboard = () =>
  config.publicUrl ? new InlineKeyboard().webApp('🍽 Открыть меню', config.publicUrl) : undefined;

async function balanceText(u) {
  const debt = await balance(u._id);
  const orders = await Order.find({ user: u._id, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).limit(5);
  let text = debt > 0 ? `К оплате: ${fmt(debt)}` : 'Долгов нет 👍';
  if (orders.length) {
    text += '\n\nПоследние заказы:\n' + orders
      .map((o) => `• #${o.number}, ${o.createdAt.toLocaleDateString('ru-RU')} — ${fmt(o.amount)}`)
      .join('\n');
  }
  return text;
}

pm.command('start', async (ctx) => {
  await ctx.reply(
    'Привет! Здесь можно заказать обед и отправить оплату.\n\n' +
    'Откройте меню кнопкой ниже. Скриншот оплаты можно прислать и прямо в этот чат.\n\n' +
    (await balanceText(ctx.dbUser)),
    { reply_markup: appKeyboard() }
  );
});

pm.command('balance', async (ctx) => ctx.reply(await balanceText(ctx.dbUser), { reply_markup: appKeyboard() }));

async function pay(ctx, u, amount, file) {
  try {
    await createPayment(u, amount, file);
    await ctx.reply(`Спасибо! Оплата ${fmt(amount)} отправлена на проверку. Я сообщу, когда её подтвердят.`);
  } catch (e) {
    if (e instanceof UserError) return ctx.reply(e.message);
    throw e;
  }
}

// Скриншот или PDF-чек прямо в чат с ботом
pm.on(['message:photo', 'message:document'], async (ctx) => {
  const m = ctx.message;
  let file;
  if (m.photo) file = { fileId: m.photo.at(-1).file_id, isDoc: false };
  else if (/^image\/|\/pdf$/.test(m.document.mime_type || '')) file = { fileId: m.document.file_id, isDoc: true };
  else return ctx.reply('Пришлите, пожалуйста, скриншот или PDF-чек.');

  const u = ctx.dbUser;
  const amt = parseAmount(m.caption);
  if (amt) return pay(ctx, u, amt.value, file);

  u.pendingScreenshot = file;
  await u.save();
  const debt = await balance(u._id);
  const kb = debt > 0 ? new InlineKeyboard().text(`Весь долг: ${fmt(debt)}`, 'payall') : undefined;
  await ctx.reply('Какую сумму вы оплатили? Напишите числом' + (debt > 0 ? ' или нажмите кнопку.' : '.'), { reply_markup: kb });
});

pm.on('message:text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  const u = ctx.dbUser;
  if (!u.pendingScreenshot?.fileId) {
    return ctx.reply('Заказать еду и отправить оплату можно через меню 👇', { reply_markup: appKeyboard() });
  }
  const amt = parseAmount(ctx.message.text);
  if (!amt) return ctx.reply('Не понял сумму. Напишите число, например 40000.');
  const file = u.pendingScreenshot;
  u.pendingScreenshot = null;
  await u.save();
  await pay(ctx, u, amt.value, file);
});

user.callbackQuery('payall', async (ctx) => {
  await ctx.answerCallbackQuery();
  const u = ctx.dbUser;
  if (!u.pendingScreenshot?.fileId) return ctx.editMessageText('Этот скриншот уже отправлен.');
  const debt = await balance(u._id);
  if (debt <= 0) return ctx.editMessageText('У вас нет долга. Напишите сумму числом.');
  const file = u.pendingScreenshot;
  u.pendingScreenshot = null;
  await u.save();
  await ctx.editMessageReplyMarkup();
  await pay(ctx, u, debt, file);
});
