import 'dotenv/config';

function required(key) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Не задана переменная окружения ${key}`);
  return value;
}

const isProd = process.env.NODE_ENV === 'production';
const publicUrl = (process.env.PUBLIC_URL || '').trim().replace(/\/$/, '');

export const config = {
  botToken: required('BOT_TOKEN'),
  mongoUri: required('MONGODB_URI'),
  adminIds: required('ADMIN_IDS').split(',').map((s) => Number(s.trim())),
  packPrice: Number(process.env.PACK_PRICE || 40000),
  currency: process.env.CURRENCY || 'сум',
  tzOffset: Number(process.env.TZ_OFFSET_HOURS ?? 5),
  publicUrl,
  usePolling: !publicUrl || process.env.USE_POLLING === 'true',
  port: Number(process.env.PORT || 3000),
  // Самопинг /health, чтобы бесплатный Render не усыплял сервис (0 = выключено)
  keepAliveMinutes: Number(process.env.KEEP_ALIVE_MINUTES || (isProd && publicUrl ? 10 : 0)),
  devUserId: !isProd && process.env.DEV_USER_ID ? Number(process.env.DEV_USER_ID) : null,
};
