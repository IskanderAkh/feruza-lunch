import { createContext, useContext } from 'react';

export const MeContext = createContext(null);
export const useMe = () => useContext(MeContext);

export const makeFmt = (currency) => (n) =>
  `${String(Math.round(n ?? 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')}\u00a0${currency}`;

export function when(date) {
  const d = new Date(date);
  const today = new Date();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `сегодня, ${time}`;
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
}

// Уменьшаем фото перед загрузкой, чтобы меню грузилось быстро
export async function resizeImage(file, max = 1000) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
}

// plural(3, ['заказ', 'заказа', 'заказов']) → «3 заказа»
export function plural(n, [one, few, many]) {
  const m10 = n % 10, m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${n} ${word}`;
}
