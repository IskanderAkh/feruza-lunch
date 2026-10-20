import mongoose from 'mongoose';
import { InlineKeyboard, InputFile } from 'grammy';
import { Payment } from '../models/index.js';
import { fmt, displayName, UserError } from '../helpers.js';
import { tgApi, notifyUser, toAdmins, editAdminMessages } from './notify.js';
import { balance } from './ledger.js';

/**
 * Скриншот оплаты → повару в личку с кнопками.
 * file: { fileId, isDoc } — если пришёл боту в Telegram,
 *       { buffer, filename, mimetype } — если загружен из Mini App.
 * Сам файл хранится на серверах Telegram, в базе только его file_id.
 */
export async function createPayment(user, amount, file) {
  if (!(amount > 0)) throw new UserError('Укажите сумму оплаты');
  const p = await Payment.create({ user: user._id, amount, method: 'screenshot' });
  const debt = await balance(user._id);
  p.adminCaption =
    `💸 Оплата\n${displayName(user)}\nСумма: ${fmt(amount)}\nДолг до подтверждения: ${fmt(debt)}` +
    (amount > debt ? '\n⚠️ Сумма больше долга' : '');
  const opts = {
    caption: p.adminCaption,
    reply_markup: new InlineKeyboard().text('✅ Подтвердить', `ok:${p._id}`).text('❌ Отклонить', `no:${p._id}`),
  };

  let fileId = file.fileId;
  const isDoc = file.fileId ? !!file.isDoc : !file.mimetype.startsWith('image/');
  const sent = await toAdmins(async (chatId) => {
    const media = fileId ?? new InputFile(file.buffer, file.filename);
    const msg = isDoc
      ? await tgApi().sendDocument(chatId, media, opts)
      : await tgApi().sendPhoto(chatId, media, opts);
    // после первой загрузки переиспользуем file_id
    fileId ??= isDoc ? msg.document.file_id : msg.photo.at(-1).file_id;
    return msg;
  });

  if (!sent.length) {
    await p.deleteOne();
    throw new UserError('Не удалось передать скриншот повару. Попробуйте ещё раз позже.', 502);
  }
  Object.assign(p, { fileId, isDoc, adminMessages: sent.map(({ chatId, messageId }) => ({ chatId, messageId })) });
  await p.save();
  return p;
}

export async function reviewPayment(id, status, reviewerId) {
  if (!mongoose.isValidObjectId(id)) throw new UserError('Оплата не найдена', 404);
  const p = await Payment.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { status, reviewedBy: reviewerId },
    { new: true }
  ).populate('user');
  if (!p) return null; // уже обработана

  const mark = status === 'confirmed' ? '✅ Подтверждено' : '❌ Отклонено';
  await editAdminMessages(p.adminMessages, (chatId, messageId) =>
    tgApi().editMessageCaption(chatId, messageId, { caption: `${p.adminCaption}\n\n${mark}` }));

  const left = await balance(p.user._id);
  await notifyUser(p.user, status === 'confirmed'
    ? `✅ Оплата ${fmt(p.amount)} подтверждена. ` + (left > 0 ? `Осталось: ${fmt(left)}` : 'Долгов нет, спасибо!')
    : `❌ Оплата ${fmt(p.amount)} не подтверждена. Пожалуйста, свяжитесь с поваром.`);
  return p;
}

export async function cashPayment(user, amount, reviewerId) {
  if (!(amount > 0)) throw new UserError('Нет суммы для оплаты');
  await Payment.create({ user: user._id, amount, method: 'cash', status: 'confirmed', reviewedBy: reviewerId });
  const left = await balance(user._id);
  await notifyUser(user, `✅ Оплата ${fmt(amount)} получена. ` + (left > 0 ? `Осталось: ${fmt(left)}` : 'Долгов нет, спасибо!'));
  return left;
}
