import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const messageRef = new Schema({ chatId: Number, messageId: Number }, { _id: false });

// Пользователь. Может быть «заготовкой» только с username,
// если повар записала заказ на человека, которого бот ещё не видел.
const userSchema = new Schema(
  {
    tgId: { type: Number, unique: true, sparse: true },
    username: { type: String, lowercase: true, index: true },
    name: String,
    started: { type: Boolean, default: false }, // можно ли писать ему в личку
    pendingScreenshot: { type: { fileId: String, isDoc: Boolean }, default: null },
    pendingAction: { type: { kind: String, orderId: String }, default: null }, // для админа
  },
  { timestamps: true }
);

const dishSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    price: { type: Number, required: true, min: 0 },
    imageUrl: String, // стартовая иллюстрация
    image: { data: Buffer, contentType: String }, // фото, загруженное поваром
    imageVersion: Number,
    available: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const orderSchema = new Schema(
  {
    number: { type: Number, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: [{ _id: false, dish: { type: Schema.Types.ObjectId, ref: 'Dish' }, name: String, price: Number, qty: Number }],
    customRequest: String, // «вне меню» — цену назначает повар
    customPrice: { type: Number, default: null },
    comment: String,
    amount: { type: Number, default: 0 },
    status: { type: String, enum: ['new', 'accepted', 'cancelled'], default: 'new', index: true },
    source: { type: String, enum: ['app', 'admin'], default: 'app' },
    createdBy: Number,
    adminMessages: [messageRef],
  },
  { timestamps: true }
);

orderSchema.pre('save', function () {
  const itemsTotal = this.items.reduce((s, i) => s + i.price * i.qty, 0);
  this.amount = itemsTotal + (this.customPrice || 0);
});

const paymentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: ['screenshot', 'cash'], default: 'screenshot' },
    status: { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'pending', index: true },
    fileId: String, // файл хранится в Telegram, у нас только ссылка
    isDoc: Boolean,
    adminCaption: String,
    adminMessages: [messageRef],
    reviewedBy: Number,
  },
  { timestamps: true }
);

const settingsSchema = new Schema({
  _id: String,
  ordersOpen: { type: Boolean, default: true },
  paymentDetails: { type: String, default: '' },
});

const counterSchema = new Schema({ _id: String, seq: Number });

export const User = model('User', userSchema);
export const Dish = model('Dish', dishSchema);
export const Order = model('Order', orderSchema);
export const Payment = model('Payment', paymentSchema);
export const Settings = model('Settings', settingsSchema);
const Counter = model('Counter', counterSchema);

export async function nextSeq(name) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return c.seq;
}
