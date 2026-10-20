// Обёртка над Telegram WebApp SDK. Вне Telegram (в браузере) всё работает через запасные варианты.
export const tg = window.Telegram?.WebApp;
export const initData = tg?.initData || '';
export const inTelegram = Boolean(initData);

export function setupTelegram() {
  const applyTheme = () => {
    const scheme = inTelegram ? tg.colorScheme : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = scheme;
  };
  applyTheme();
  if (!inTelegram) return;
  tg.ready();
  tg.expand();
  tg.onEvent('themeChanged', applyTheme);
}

const safe = (fn) => { try { fn(); } catch { /* старый клиент Telegram */ } };
export const haptic = {
  tap: () => safe(() => tg?.HapticFeedback?.impactOccurred('light')),
  ok: () => safe(() => tg?.HapticFeedback?.notificationOccurred('success')),
  error: () => safe(() => tg?.HapticFeedback?.notificationOccurred('error')),
};

export const showAlert = (msg) =>
  new Promise((resolve) => (inTelegram ? tg.showAlert(msg, resolve) : (window.alert(msg), resolve())));

export const showConfirm = (msg) =>
  new Promise((resolve) => (inTelegram ? tg.showConfirm(msg, resolve) : resolve(window.confirm(msg))));
