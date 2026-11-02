import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useMe } from '../context.js';
import { MainButton, Stepper, Loader, ErrorNote, Empty, Announcements } from '../components.jsx';
import { haptic } from '../tg.js';

export default function Menu({ cart, setCart, onCheckout, goPay }) {
  const { me, fmt } = useMe();
  const [dishes, setDishes] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setError(null);
    api.get('/menu').then(setDishes).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const setQty = (dish, qty) =>
    setCart((c) => {
      const next = { ...c };
      if (qty > 0) next[dish.id] = { dish, qty };
      else delete next[dish.id];
      return next;
    });

  const lines = Object.values(cart);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.qty * l.dish.price, 0);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Меню</h1>
        {me.debt > 0 && <button className="debt-pill" onClick={goPay}>Долг {fmt(me.debt)}</button>}
      </header>

      <Announcements items={me.announcements} />
      {!me.ordersOpen && <div className="notice">На сегодня заказы уже не принимаются, но можно заказать на завтра или другой день.</div>}
      <ErrorNote error={error} onRetry={load} />
      {!dishes && !error && <Loader />}
      {dishes && !dishes.length && <Empty title="Меню пока пустое">Повар ещё не добавила блюда на сегодня.</Empty>}

      {dishes && (
        <div className="dish-grid">
          {dishes.map((d) => {
            const qty = cart[d.id]?.qty || 0;
            return (
              <article key={d.id} className={`dish${qty ? ' in-cart' : ''}`}>
                <div className="dish-img">
                  {d.image ? <img src={d.image} alt="" loading="lazy" /> : <div className="dish-ph" />}
                  <span className="price-tag">{fmt(d.price)}</span>
                </div>
                <div className="dish-body">
                  <h3>{d.name}</h3>
                  {d.description && <p>{d.description}</p>}
                  {qty ? (
                    <Stepper value={qty} onChange={(v) => setQty(d, v)} />
                  ) : (
                    <button className="btn btn-soft btn-block"
                      onClick={() => { haptic.tap(); setQty(d, 1); }}>
                      Добавить
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          <button className="custom-tile" onClick={() => onCheckout(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>
            <strong>Хочу не из меню</strong>
            <span>Опишите блюдо и порцию, цену назовёт повар</span>
          </button>
        </div>
      )}

      <MainButton visible={count > 0} text={`Корзина: ${count} шт. — ${fmt(total)}`} onClick={() => onCheckout(false)} />
    </div>
  );
}
