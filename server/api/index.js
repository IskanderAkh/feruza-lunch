import { Router } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Announcement, Dish, Order, Payment, User } from '../models/index.js';
import { auth, adminOnly } from './auth.js';
import { balance, debtors, remindDebtors } from '../services/ledger.js';
import { createOrder, acceptOrder, cancelOrder, setCustomPrice, parseForDate } from '../services/orders.js';
import {
  announcementDto, activeAnnouncements, createAnnouncement, setAnnouncementActive,
} from '../services/announcements.js';
import { createPayment, reviewPayment, cashPayment } from '../services/payments.js';
import { dishDto, listDishes } from '../services/dishes.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { tgApi } from '../services/notify.js';
import { parseAmount, localDate, MAX_DAYS_AHEAD, UserError } from '../helpers.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const orderDto = (o) => ({
  id: o._id, number: o.number, status: o.status, items: o.items,
  customRequest: o.customRequest, customPrice: o.customPrice, comment: o.comment,
  amount: o.amount, forDate: o.forDate, createdAt: o.createdAt,
  user: o.user?.name !== undefined ? { id: o.user._id, name: o.user.name, username: o.user.username } : undefined,
});

const paymentDto = (p) => ({
  id: p._id, amount: p.amount, status: p.status, method: p.method, isDoc: p.isDoc, createdAt: p.createdAt,
  user: p.user?.name !== undefined ? { id: p.user._id, name: p.user.name, username: p.user.username } : undefined,
});

export const api = Router();

// Фото блюда — без авторизации, чтобы работал обычный <img>
api.get('/dishes/:id/image', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(404);
  const d = await Dish.findById(req.params.id).select('image');
  if (!d?.image?.data) return res.sendStatus(404);
  res.set('Content-Type', d.image.contentType || 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(d.image.data);
});

api.use(auth);

// ---------- Участники ----------

api.get('/me', async (req, res) => {
  const [s, news] = await Promise.all([getSettings(), activeAnnouncements()]);
  res.json({
    name: req.user.name,
    isAdmin: req.isAdmin,
    debt: await balance(req.user._id),
    currency: config.currency,
    ordersOpen: s.ordersOpen,
    paymentDetails: s.paymentDetails,
    today: localDate(),
    maxDaysAhead: MAX_DAYS_AHEAD,
    announcements: news.map(announcementDto),
  });
});

api.get('/menu', async (_req, res) => {
  res.json((await listDishes(true)).map(dishDto));
});

api.post('/orders', async (req, res) => {
  const s = await getSettings();
  const forDate = parseForDate(req.body?.forDate);
  // «Закрыто» — только на сегодня: повар уже готовит, а на другие дни заказывать можно
  if (!s.ordersOpen && !req.isAdmin && forDate === localDate()) {
    throw new UserError('Приём заказов на сегодня закрыт. Выберите другой день.');
  }
  const order = await createOrder(req.user, { ...req.body, forDate });
  res.json({ order: orderDto(order), debt: await balance(req.user._id) });
});

api.get('/my', async (req, res) => {
  const [orders, payments, debt] = await Promise.all([
    Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30),
    Payment.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30),
    balance(req.user._id),
  ]);
  res.json({ debt, orders: orders.map(orderDto), payments: payments.map(paymentDto) });
});

api.post('/payments', upload.single('file'), async (req, res) => {
  const f = req.file;
  if (!f) throw new UserError('Прикрепите скриншот оплаты');
  if (!/^image\/|\/pdf$/.test(f.mimetype)) throw new UserError('Нужна картинка или PDF-чек');
  const amount = parseAmount(req.body.amount)?.value;
  if (!amount) throw new UserError('Укажите сумму оплаты');
  await createPayment(req.user, amount, {
    buffer: f.buffer, filename: f.originalname || 'payment.jpg', mimetype: f.mimetype,
  });
  res.json({ ok: true, debt: await balance(req.user._id) });
});

// ---------- Повар ----------

const adm = Router();
api.use('/admin', adminOnly, adm);

adm.get('/orders', async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : localDate();
  const filter = req.query.scope === 'open'
    ? { $or: [{ status: 'new' }, { status: 'accepted', customRequest: { $ne: null }, customPrice: null }] }
    : { forDate: date };
  const sort = req.query.scope === 'open' ? { forDate: 1, createdAt: -1 } : { createdAt: -1 };
  const orders = await Order.find(filter).populate('user').sort(sort).limit(300);
  res.json(orders.map(orderDto));
});

// Дни с заказами начиная с сегодня — для переключателя дат у повара
adm.get('/orders/days', async (_req, res) => {
  const days = await Order.aggregate([
    { $match: { forDate: { $gte: localDate() }, status: { $ne: 'cancelled' } } },
    { $group: { _id: '$forDate', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  res.json(days.map((d) => ({ date: d._id, count: d.count })));
});

adm.post('/orders/:id/accept', async (req, res) => res.json(orderDto(await acceptOrder(req.params.id))));
adm.post('/orders/:id/cancel', async (req, res) => res.json(orderDto(await cancelOrder(req.params.id))));
adm.post('/orders/:id/price', async (req, res) => {
  const price = parseAmount(req.body?.price)?.value;
  if (!price) throw new UserError('Укажите цену');
  res.json(orderDto(await setCustomPrice(req.params.id, price)));
});

adm.get('/payments', async (req, res) => {
  const filter = req.query.status === 'all' ? {} : { status: 'pending' };
  const list = await Payment.find(filter).populate('user').sort({ createdAt: -1 }).limit(100);
  res.json(await Promise.all(list.map(async (p) => ({ ...paymentDto(p), debt: await balance(p.user._id) }))));
});

for (const [action, status] of [['confirm', 'confirmed'], ['reject', 'rejected']]) {
  adm.post(`/payments/:id/${action}`, async (req, res) => {
    const p = await reviewPayment(req.params.id, status, req.user.tgId);
    if (!p) throw new UserError('Эта оплата уже обработана');
    res.json({ ok: true });
  });
}

// Скриншот оплаты: берём с серверов Telegram по file_id
adm.get('/payments/:id/file', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(404);
  const p = await Payment.findById(req.params.id);
  if (!p?.fileId) return res.sendStatus(404);
  const file = await tgApi().getFile(p.fileId);
  const r = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`);
  if (!r.ok) return res.sendStatus(502);
  const ext = file.file_path.split('.').pop().toLowerCase();
  res.set('Content-Type', ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg');
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(Buffer.from(await r.arrayBuffer()));
});

adm.get('/debts', async (_req, res) => {
  const list = await debtors();
  res.json(list.map(({ user, debt }) => ({
    userId: user._id, name: user.name, username: user.username, started: user.started, debt,
  })));
});

adm.post('/debts/:userId/cash', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) throw new UserError('Не найден', 404);
  const user = await User.findById(req.params.userId);
  if (!user) throw new UserError('Не найден', 404);
  const amount = parseAmount(req.body?.amount)?.value ?? (await balance(user._id));
  res.json({ debt: await cashPayment(user, amount, req.user.tgId) });
});

adm.post('/remind', async (_req, res) => {
  const { sent, failed } = await remindDebtors();
  res.json({ sent, failed: failed.length });
});

// Меню
const dishFields = (body) => {
  const out = {};
  if (typeof body.name === 'string') out.name = body.name.trim().slice(0, 80);
  if (typeof body.description === 'string') out.description = body.description.trim().slice(0, 200);
  if (body.price !== undefined) {
    const price = parseAmount(body.price)?.value;
    if (!price) throw new UserError('Укажите цену');
    out.price = price;
  }
  if (typeof body.available === 'boolean') out.available = body.available;
  if (Number.isFinite(body.sort)) out.sort = body.sort;
  return out;
};

adm.get('/dishes', async (_req, res) => res.json((await listDishes(false)).map(dishDto)));

adm.post('/dishes', async (req, res) => {
  const fields = dishFields(req.body || {});
  if (!fields.name) throw new UserError('Укажите название');
  if (!fields.price) throw new UserError('Укажите цену');
  const last = await Dish.findOne().sort({ sort: -1 });
  const d = await Dish.create({ ...fields, sort: (last?.sort ?? 0) + 1 });
  res.json(dishDto(d));
});

adm.patch('/dishes/:id', async (req, res) => {
  const d = await Dish.findByIdAndUpdate(req.params.id, { $set: dishFields(req.body || {}) }, { new: true })
    .select('-image.data');
  if (!d) throw new UserError('Блюдо не найдено', 404);
  res.json(dishDto(d));
});

adm.delete('/dishes/:id', async (req, res) => {
  await Dish.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

adm.post('/dishes/:id/image', upload.single('file'), async (req, res) => {
  const f = req.file;
  if (!f || !f.mimetype.startsWith('image/')) throw new UserError('Нужна картинка');
  if (f.size > 2 * 1024 * 1024) throw new UserError('Фото слишком большое, максимум 2 МБ');
  const d = await Dish.findByIdAndUpdate(
    req.params.id,
    { $set: { image: { data: f.buffer, contentType: f.mimetype }, imageVersion: Date.now() } },
    { new: true }
  ).select('-image.data');
  if (!d) throw new UserError('Блюдо не найдено', 404);
  res.json(dishDto(d));
});

// Объявления
adm.get('/announcements', async (_req, res) => {
  const list = await Announcement.find().sort({ createdAt: -1 }).limit(50);
  res.json(list.map(announcementDto));
});

adm.post('/announcements', async (req, res) => {
  const a = await createAnnouncement(req.body?.text, { send: req.body?.send === true, adminId: req.user.tgId });
  res.json(announcementDto(a));
});

adm.patch('/announcements/:id', async (req, res) => {
  if (typeof req.body?.active !== 'boolean') throw new UserError('Нечего менять');
  res.json(announcementDto(await setAnnouncementActive(req.params.id, req.body.active)));
});

adm.delete('/announcements/:id', async (req, res) => {
  if (mongoose.isValidObjectId(req.params.id)) await Announcement.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// Настройки
adm.patch('/settings', async (req, res) => {
  const s = await updateSettings(req.body || {});
  res.json({ ordersOpen: s.ordersOpen, paymentDetails: s.paymentDetails });
});
