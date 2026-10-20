import { config } from '../config.js';

let _api = null;
export const setApi = (api) => { _api = api; };
export const tgApi = () => _api;

export async function notifyUser(user, text, other) {
  if (!_api || !user?.tgId || !user.started) return false;
  try {
    await _api.sendMessage(user.tgId, text, other);
    return true;
  } catch {
    return false;
  }
}

// Отправляет сообщение каждому админу. Возвращает [{ chatId, messageId, message }]
export async function toAdmins(send) {
  const sent = [];
  for (const chatId of config.adminIds) {
    try {
      const message = await send(chatId);
      sent.push({ chatId, messageId: message.message_id, message });
    } catch (e) {
      console.error(`Не удалось отправить админу ${chatId}:`, e.description || e.message);
    }
  }
  return sent;
}

export async function editAdminMessages(refs, edit) {
  for (const m of refs || []) {
    try {
      await edit(m.chatId, m.messageId);
    } catch {
      // сообщение удалено или не изменилось — не важно
    }
  }
}
