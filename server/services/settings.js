import { Settings } from '../models/index.js';

export const getSettings = () =>
  Settings.findOneAndUpdate({ _id: 'main' }, {}, { upsert: true, new: true, setDefaultsOnInsert: true });

export function updateSettings(patch) {
  const $set = {};
  if (typeof patch.ordersOpen === 'boolean') $set.ordersOpen = patch.ordersOpen;
  if (typeof patch.paymentDetails === 'string') $set.paymentDetails = patch.paymentDetails.slice(0, 500);
  return Settings.findOneAndUpdate({ _id: 'main' }, { $set }, { upsert: true, new: true, setDefaultsOnInsert: true });
}
