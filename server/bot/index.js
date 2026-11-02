import { Bot } from 'grammy';
import { config } from '../config.js';
import { touchUser } from '../services/ledger.js';
import { admin } from './admin.js';
import { user } from './user.js';

export function createBot() {
  const bot = new Bot(config.botToken);

  // Запоминаем каждого, кто пишет (в т.ч. в группе), чтобы знать, кто стоит за @username
  bot.use(async (ctx, next) => {
    if (ctx.from && !ctx.from.is_bot) {
      ctx.dbUser = await touchUser(ctx.from, { started: ctx.chat?.type === 'private' });
    }
    await next();
  });

  bot.use(admin);
  bot.use(user);
  bot.catch((err) => console.error('Ошибка бота:', err.error));
  return bot;
}

export async function setupBot(bot) {
  await bot.api.setMyCommands(
    [{ command: 'start', description: 'Меню и мой долг' }, { command: 'balance', description: 'Мой долг' }],
    { scope: { type: 'all_private_chats' } }
  );

  const adminCommands = [
    { command: 'debts', description: 'Должники' },
    { command: 'remind', description: 'Напомнить должникам' },
    { command: 'report', description: 'Выгрузка в Excel' },
    { command: 'pack', description: 'Пакет: /pack @user [кол-во]' },
    { command: 'custom', description: 'Вне меню: /custom @user сумма описание' },
    { command: 'paid', description: 'Наличные: /paid @user [сумма]' },
    { command: 'undo', description: 'Отменить последнюю запись' },
    { command: 'announce', description: 'Объявление всем: /announce текст' },
    { command: 'help', description: 'Справка' },
  ];
  for (const id of config.adminIds) {
    await bot.api.setMyCommands(adminCommands, { scope: { type: 'chat', chat_id: id } }).catch(() => {});
  }

  // Кнопка «Меню» слева от поля ввода в личке с ботом
  if (config.publicUrl) {
    await bot.api.setChatMenuButton({
      menu_button: { type: 'web_app', text: 'Меню', web_app: { url: config.publicUrl } },
    });
  }
}
