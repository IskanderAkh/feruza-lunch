import { Dish } from '../models/index.js';
import { config } from '../config.js';

export const dishDto = (d) => ({
  id: d._id,
  name: d.name,
  description: d.description,
  price: d.price,
  available: d.available,
  sort: d.sort,
  image: d.imageVersion ? `/api/dishes/${d._id}/image?v=${d.imageVersion}` : d.imageUrl || null,
});

export const listDishes = (onlyAvailable) =>
  Dish.find(onlyAvailable ? { available: true } : {}).select('-image.data').sort({ sort: 1, createdAt: 1 });

// Стартовое меню при первом запуске. Повар потом правит его в админке.
const DEFAULT_MENU = [
  ['Плов', 'Плов, ачичук, лепёшка', 'plov'],
  ['Лагман', 'Лагман, салат, лепёшка', 'lagman'],
  ['Манты', '5 мант со сметаной, салат', 'manty'],
  ['Шурпа', 'Шурпа, самса, лепёшка', 'shurpa'],
  ['Шашлык', '3 шампура, маринованный лук, лепёшка', 'shashlik'],
  ['Самса', '3 самсы и чай', 'samsa'],
];

export async function ensureSeed() {
  if (await Dish.estimatedDocumentCount()) return;
  await Dish.insertMany(DEFAULT_MENU.map(([name, description, img], sort) => ({
    name, description, price: config.packPrice, imageUrl: `/dishes/${img}.svg`, sort,
  })));
  console.log('Создано стартовое меню');
}
