import { useEffect, useRef, useState } from 'react';
import { tg, inTelegram, haptic } from './tg.js';
import { dayLabel } from './context.js';

const LAPIS = '#1F4E9C';

// Большая кнопка внизу экрана. В Telegram — нативная MainButton, в браузере — обычная.
export function MainButton({ text, onClick, disabled = false, loading = false, visible = true }) {
  const cb = useRef(onClick);
  cb.current = onClick;

  useEffect(() => {
    if (!inTelegram) return;
    const handler = () => cb.current?.();
    tg.MainButton.onClick(handler);
    return () => {
      tg.MainButton.offClick(handler);
      tg.MainButton.hideProgress();
      tg.MainButton.hide();
    };
  }, []);

  useEffect(() => {
    if (!inTelegram) return;
    tg.MainButton.setParams({
      text, color: LAPIS, text_color: '#FFFFFF', is_active: !disabled && !loading, is_visible: visible,
    });
    loading ? tg.MainButton.showProgress(false) : tg.MainButton.hideProgress();
  }, [text, disabled, loading, visible]);

  if (inTelegram || !visible) return null;
  return (
    <div className="mb-fallback">
      <button className="btn btn-primary btn-block" disabled={disabled || loading} onClick={onClick}>
        {loading ? 'Отправляю…' : text}
      </button>
    </div>
  );
}

export function BackButton({ onClick }) {
  const cb = useRef(onClick);
  cb.current = onClick;
  useEffect(() => {
    if (!inTelegram) return;
    const handler = () => cb.current?.();
    tg.BackButton.onClick(handler);
    tg.BackButton.show();
    return () => {
      tg.BackButton.offClick(handler);
      tg.BackButton.hide();
    };
  }, []);
  if (inTelegram) return null;
  return <button className="back-link" onClick={onClick}>‹ Назад</button>;
}

export function Stepper({ value, onChange, min = 0, max = 20 }) {
  const set = (v) => {
    haptic.tap();
    onChange(Math.max(min, Math.min(max, v)));
  };
  return (
    <div className="stepper">
      <button aria-label="Меньше" onClick={() => set(value - 1)}>−</button>
      <span aria-live="polite">{value}</span>
      <button aria-label="Больше" disabled={value >= max} onClick={() => set(value + 1)}>+</button>
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true" />
      {label && <span className="switch-label">{label}</span>}
    </label>
  );
}

export const Loader = () => <div className="loader" role="status" aria-label="Загрузка" />;

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p className="hint">{children}</p>}
    </div>
  );
}

const STATUS = {
  new: ['Новый', 'warn'], accepted: ['Принят', 'ok'], cancelled: ['Отменён', 'bad'],
  pending: ['На проверке', 'warn'], confirmed: ['Подтверждена', 'ok'], rejected: ['Отклонена', 'bad'],
};
export function Badge({ status }) {
  const [text, tone] = STATUS[status] || [status, 'warn'];
  return <span className={`badge badge-${tone}`}>{text}</span>;
}

// Объявления повара вверху меню. Закрытые запоминаем в браузере.
const HIDDEN_KEY = 'hiddenAnnouncements';
const readHidden = () => {
  try { return JSON.parse(localStorage.getItem(HIDDEN_KEY)) || []; } catch { return []; }
};

export function Announcements({ items }) {
  const [hidden, setHidden] = useState(readHidden);
  const visible = items.filter((a) => !hidden.includes(a.id));
  if (!visible.length) return null;

  const hide = (id) => {
    // храним только актуальные id, чтобы список не рос бесконечно
    const next = [...hidden, id].filter((h) => items.some((a) => a.id === h));
    setHidden(next);
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* приватный режим */ }
  };

  return visible.map((a) => (
    <div key={a.id} className="announce" role="status">
      <span className="announce-icon" aria-hidden="true">📢</span>
      <p>{a.text}</p>
      <button className="announce-close" aria-label="Скрыть объявление" onClick={() => hide(a.id)}>×</button>
    </div>
  ));
}

// Выбор дня заказа: горизонтальная лента
export function DayPicker({ days, value, onChange, today, disabled = [], counts }) {
  return (
    <div className="days" role="radiogroup" aria-label="День">
      {days.map((d) => (
        <button key={d} role="radio" aria-checked={value === d} className={value === d ? 'active' : ''}
          disabled={disabled.includes(d)} onClick={() => { haptic.tap(); onChange(d); }}>
          {dayLabel(d, today)}
          {counts?.[d] > 0 && <b className="num">{counts[d]}</b>}
        </button>
      ))}
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="notice notice-bad" role="alert">
      {error}
      {onRetry && <button className="link" onClick={onRetry}>Повторить</button>}
    </div>
  );
}
