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

// Начало текущих суток в часовом поясе повара
export function startOfToday() {
  const off = config.tzOffset * 3_600_000;
  const local = Date.now() + off;
  return new Date(local - (local % 86_400_000) - off);
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
