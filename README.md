# Обеды: Telegram-бот + Mini App

Участники открывают в боте кнопку **«Меню»**, выбирают блюда, заказывают и тут же
отправляют скриншот оплаты. Повар получает заказы и скриншоты в личку с кнопками
и управляет всем из вкладки **«Повар»** в том же Mini App.

**Стек:** MongoDB (Mongoose) · Express 5 · React 18 + Vite · Node.js · grammY

```
server/
  index.js            точка входа: Express, webhook/polling, раздача client/dist
  config.js           переменные окружения
  models/             User, Dish, Order, Payment, Settings
  services/           бизнес-логика: заказы, оплаты, долги, меню
  bot/                команды и кнопки бота
  api/                REST API для Mini App + проверка подписи Telegram
client/
  src/pages/          меню, корзина, оплата, история
  src/admin/          панель повара
  public/dishes/      стартовые иллюстрации блюд
```

## Как это работает

- **Меню.** При первом запуске создаётся 6 блюд по `PACK_PRICE` (40 000). Повар меняет названия,
  цены и фото во вкладке «Повар → Меню». Фото хранится в MongoDB, сжатое до ~100 КБ.
- **Заказ не из меню.** Человек описывает блюдо и порцию, повар назначает цену
  кнопкой «Указать цену» в боте или в панели. Бот присылает цену заказчику.
- **Оплата.** Скриншот из Mini App (или прямо в чат с ботом) уходит повару в личку
  с кнопками ✅/❌. Сам файл хранится на серверах Telegram, в базе только его `file_id`.
- **Долг** = неотменённые заказы − подтверждённые оплаты.
- **Безопасность.** Каждый запрос Mini App подписан Telegram (`initData`), сервер проверяет подпись.
  Цены всегда берутся из базы, а не от клиента.
- Старые команды (`/pack`, `/custom`, `/paid`, `/debts`, `/remind`, `/report`) по-прежнему работают.

## Подготовка

1. **Бот:** @BotFather → `/newbot` → токен.
2. **Ваш Telegram ID:** @userinfobot. Повар обязательно должна нажать «Старт» у бота,
   иначе бот не сможет присылать ей заказы и скриншоты.
3. **База:** MongoDB Atlas → бесплатный кластер M0 → строка подключения.
4. `cp .env.example .env` и заполнить.

## Локальный запуск

### Вариант А: в обычном браузере (быстро, для разработки интерфейса)

В `.env` укажите `DEV_USER_ID` = ваш Telegram ID (и его же в `ADMIN_IDS`, чтобы видеть вкладку «Повар").
`PUBLIC_URL` оставьте пустым: бот будет работать в режиме polling.

```bash
npm install
npm --prefix client install
npm run dev            # сервер и бот на :3000
npm run dev:client     # в соседнем терминале: Vite на :5173
```
Откройте http://localhost:5173. Без Telegram используется тестовый пользователь из `DEV_USER_ID`.

> **Почему в `client/package.json` есть `overrides`.** Vite обычно запускает `esbuild.exe`,
> а на рабочих ПК с Windows антивирус или политика безопасности часто это блокирует
> (ошибка `spawnSync ...esbuild.exe UNKNOWN`). Поэтому esbuild и Rollup подменены
> wasm-версиями: они работают внутри Node, без отдельных `.exe`. Сборка чуть медленнее
> (~7 секунд вместо ~2), зато работает везде. Если на вашем ПК блокировки нет,
> блок `overrides` можно удалить.

### Вариант Б: настоящий Mini App в Telegram

Telegram открывает Mini App только по HTTPS, поэтому нужен туннель.

```bash
npm run build                               # собрать React в client/dist
npx cloudflared tunnel --url http://localhost:3000
# или: ngrok http 3000
```
Скопируйте выданный адрес `https://....trycloudflare.com` в `PUBLIC_URL` в `.env` и запустите `npm run dev`.
Бот сам поставит webhook и кнопку «Меню». Откройте чат с ботом в Telegram.

После изменений в `client/` снова выполните `npm run build`.

## Деплой на Render

1. Залить проект на GitHub (`.env` в `.gitignore`).
2. Render → New → Web Service:
   - Build: `npm install && npm run build`
   - Start: `npm start`
3. Environment: `BOT_TOKEN`, `MONGODB_URI`, `ADMIN_IDS`, `PACK_PRICE`, `CURRENCY`, `TZ_OFFSET_HOURS`,
   `NODE_ENV=production`, `PUBLIC_URL=https://<имя>.onrender.com`.

Бесплатный инстанс засыпает через 15 минут без входящих запросов. Чтобы этого не было, сервер сам
пингует `PUBLIC_URL/health` каждые 10 минут (`KEEP_ALIVE_MINUTES`, `0` — выключить).
Самопинг не разбудит уже уснувший сервис, поэтому для надёжности можно дополнительно
настроить внешний пинг `GET /health` через cron-job.org или UptimeRobot.

## В группе

Отправьте в группу `/pay` от имени повара и закрепите. Это кнопка, ведущая в бота.
(Telegram не разрешает открывать Mini App кнопкой прямо из группы.)
