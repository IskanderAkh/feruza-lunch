import { config } from './config.js';

export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const fmt = (n) =>
  `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${config.currency}`;

// Понимает: 40000, 40 000, 40.000, 40к, 40k, 40 тыс
const AMOUNT_RE = /(\d{1,3}(?:[ .\u00a0]\d{3})+|\d+)\s*(к|k|тыс\.?)?(?![\wа-яё])/i;

export function parseAmount(text) {
  const m = AMOUNT_RE.exec(String(text ?? ''));
  if (!m) return null;
  const value = parseInt(m[1].replace(/\D/g, ''), 10) * (m[2] ? 1000 : 1);
  return value > 0 ? { value, raw: m[0] } : null;
}

export const displayName = (u) =>
  u?.name ? `${u.name}${u.username ? ` (@${u.username})` : ''}` : `@${u?.username ?? '?'}`;

// На сколько дней вперёд можно заказать
export const MAX_DAYS_AHEAD = 14;

// Дата «YYYY-MM-DD» в часовом поясе повара, со сдвигом в днях
export function localDate(addDays = 0, from = Date.now()) {
  return new Date(new Date(from).getTime() + config.tzOffset * 3_600_000 + addDays * 86_400_000)
    .toISOString().slice(0, 10);
}

// «пт, 24 окт.»
export const formatDay = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function dayLabel(date) {
  if (date === localDate()) return 'сегодня';
  if (date === localDate(1)) return 'завтра';
  return formatDay(date);
}

// Telegram ограничивает сообщение 4096 символами
export async function replyLong(ctx, text) {
  let chunk = '';
  for (const line of text.split('\n')) {
    if ((chunk + line).length > 3900) {
      await ctx.reply(chunk);
      chunk = '';
    }
    chunk += line + '\n';
  }
  if (chunk.trim()) await ctx.reply(chunk);
}
