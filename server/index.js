import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';
import { webhookCallback } from 'grammy';
import { config } from './config.js';
import { createBot, setupBot } from './bot/index.js';
import { setApi } from './services/notify.js';
import { ensureSeed } from './services/dishes.js';
import { migrateOrderDates } from './services/orders.js';
import { api } from './api/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await mongoose.connect(config.mongoUri);
console.log('MongoDB подключена');
await ensureSeed();
await migrateOrderDates();

const bot = createBot();
await bot.init();
setApi(bot.api);
await setupBot(bot);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.get('/health', (_req, res) => res.send('ok'));
app.use('/api', api);

const secret = crypto.createHash('sha256').update(config.botToken).digest('hex').slice(0, 32);
if (!config.usePolling) {
  app.post('/webhook', webhookCallback(bot, 'express', { secretToken: secret }));
}

// Собранный React Mini App
const dist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) =>
    req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(path.join(dist, 'index.html')) : next());
} else {
  console.log('client/dist не найден — запустите «npm run build» или dev-сервер Vite');
}

// Ошибки API → понятный JSON
app.use((err, _req, res, _next) => {
  let status = err.status || 500;
  if (err.name === 'CastError') status = 400;
  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 400;
    err.message = 'Файл слишком большой, максимум 10 МБ';
  }
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Ошибка сервера, попробуйте ещё раз' : err.message });
});

app.listen(config.port, () => console.log(`Сервер: http://localhost:${config.port}`));

// Render (free) засыпает через 15 минут без входящих запросов — пингуем себя через публичный адрес
if (config.keepAliveMinutes > 0 && config.publicUrl) {
  setInterval(() => {
    fetch(`${config.publicUrl}/health`, { signal: AbortSignal.timeout(30_000) })
      .catch((err) => console.error('Keep-alive пинг не удался:', err.message));
  }, config.keepAliveMinutes * 60_000);
  console.log(`Keep-alive: пинг ${config.publicUrl}/health каждые ${config.keepAliveMinutes} мин`);
}

if (config.usePolling) {
  await bot.api.deleteWebhook();
  bot.start({
    allowed_updates: ['message', 'callback_query'],
    onStart: (me) => console.log(`@${me.username} запущен (polling)`),
  });
} else {
  await bot.api.setWebhook(`${config.publicUrl}/webhook`, {
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
  });
  console.log(`Webhook: ${config.publicUrl}/webhook`);
  console.log(`Mini App: ${config.publicUrl}`);
}
