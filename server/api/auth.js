import crypto from 'node:crypto';
import { config } from '../config.js';
import { touchUser } from '../services/ledger.js';

/**
 * Проверка initData от Telegram Mini App:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Без этого любой мог бы подделать запрос от чужого имени.
 */
export function validateInitData(initData, botToken, maxAgeSec = 24 * 3600) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;

  try {
    return JSON.parse(params.get('user'));
  } catch {
    return null;
  }
}

export async function auth(req, res, next) {
  const header = req.get('authorization') || '';
  let tgUser = null;
  if (header.startsWith('tma ')) {
    tgUser = validateInitData(header.slice(4), config.botToken);
  } else if (config.devUserId) {
    // режим разработки в обычном браузере
    tgUser = { id: config.devUserId, first_name: 'Тест', username: 'dev_user', allows_write_to_pm: true };
  }
  if (!tgUser) {
    return res.status(401).json({ error: 'Откройте приложение через кнопку «Меню» в боте' });
  }
  req.user = await touchUser(tgUser, { started: tgUser.allows_write_to_pm === true });
  req.isAdmin = config.adminIds.includes(tgUser.id);
  next();
}

export const adminOnly = (req, res, next) =>
  req.isAdmin ? next() : res.status(403).json({ error: 'Только для повара' });
