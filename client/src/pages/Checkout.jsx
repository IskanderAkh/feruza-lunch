import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useMe } from '../context.js';
import { MainButton, BackButton, Stepper, ErrorNote } from '../components.jsx';
import { haptic } from '../tg.js';

export default function Checkout({ cart, setCart, focusCustom, onBack, onDone }) {
  const { fmt } = useMe();
  const [custom, setCustom] = useState('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const customRef = useRef(null);

  useEffect(() => { if (focusCustom) customRef.current?.focus(); }, [focusCustom]);

  const lines = Object.values(cart);
  const total = lines.reduce((s, l) => s + l.qty * l.dish.price, 0);
  const hasCustom = custom.trim().length > 0;
  const empty = !lines.length && !hasCustom;

  const setQty = (dish, qty) =>
    setCart((c) => {
      const next = { ...c };
      if (qty > 0) next[dish.id] = { dish, qty };
      else delete next[dish.id];
      return next;
    });

  async function submit() {
    if (empty || sending) return;
    setSending(true);
    setError(null);
    try {
      const { order } = await api.post('/orders', {
        items: lines.map((l) => ({ dishId: l.dish.id, qty: l.qty })),
        customRequest: custom,
        comment,
      });
      haptic.ok();
      onDone(order);
    } catch (e) {
      haptic.error();
      setError(e.message);
      setSending(false);
    }
  }

  return (
    <div className="page">
      <BackButton onClick={onBack} />
      <header className="page-head"><h1>Ваш заказ</h1></header>

      {lines.length > 0 && (
        <ul className="list">
          {lines.map(({ dish, qty }) => (
            <li key={dish.id} className="cart-row">
              {dish.image && <img src={dish.image} alt="" />}
              <div className="grow">
                <strong>{dish.name}</strong>
                <span className="hint num">{fmt(dish.price * qty)}</span>
              </div>
              <Stepper value={qty} onChange={(v) => setQty(dish, v)} />
            </li>
          ))}
        </ul>
      )}

      <section className="card">
        <label className="field">
          <span className="field-label">Не из меню</span>
          <textarea ref={customRef} rows={2} maxLength={300} value={custom} onChange={(e) => setCustom(e.target.value)}
            placeholder="Например: шашлык из баранины, 2 порции" />
          <span className="hint">Цену назовёт повар, бот пришлёт её сообщением.</span>
        </label>
        <label className="field">
          <span className="field-label">Комментарий</span>
          <input maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Без лука, острее и т. п." />
        </label>
      </section>

      <div className="total-row">
        <span>Итого</span>
        <strong className="num">{fmt(total)}{hasCustom ? ' + блюдо не из меню' : ''}</strong>
      </div>

      <ErrorNote error={error} />
      <MainButton
        text={total > 0 ? `Заказать — ${fmt(total)}` : 'Отправить заказ'}
        disabled={empty} loading={sending} onClick={submit}
      />
    </div>
  );
}
