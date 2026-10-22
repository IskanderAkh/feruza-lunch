import mongoose from 'mongoose';
import { InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { Announcement, User } from '../models/index.js';
import { UserError } from '../helpers.js';
import { notifyUser } from './notify.js';

export const announcementDto = (a) => ({
  id: a._id, text: a.text, active: a.active, sentTo: a.sentTo, createdAt: a.createdAt,
});

// Показываются вверху меню, самые свежие сверху
export const activeAnnouncements = () => Announcement.find({ active: true }).sort({ createdAt: -1 }).limit(5);

// Рассылка в личку всем, кто запускал бота
async function broadcast(text) {
  const kb = config.publicUrl ? new InlineKeyboard().webApp('🍽 Открыть меню', config.publicUrl) : undefined;
  let sent = 0;
  for (const user of await User.find({ started: true, tgId: { $ne: null } })) {
    if (await notifyUser(user, `📢 ${text}`, { reply_markup: kb })) sent++;
    await new Promise((r) => setTimeout(r, 50)); // не упираться в лимиты Telegram
  }
  return sent;
}

export async function createAnnouncement(text, { send = false, adminId } = {}) {
  text = String(text ?? '').trim().slice(0, 1000);
  if (!text) throw new UserError('Напишите текст объявления');
  const a = await Announcement.create({ text, createdBy: adminId });
  if (send) {
    a.sentTo = await broadcast(text);
    await a.save();
  }
  return a;
}

export async function setAnnouncementActive(id, active) {
  if (!mongoose.isValidObjectId(id)) throw new UserError('Объявление не найдено', 404);
  const a = await Announcement.findByIdAndUpdate(id, { $set: { active } }, { new: true });
  if (!a) throw new UserError('Объявление не найдено', 404);
  return a;
}
