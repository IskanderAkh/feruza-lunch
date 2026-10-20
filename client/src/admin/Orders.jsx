import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useMe, when, plural } from '../context.js';
import { Loader, Empty, Badge, ErrorNote } from '../components.jsx';
import { haptic, showAlert } from '../tg.js';

export default function Orders() {
  const { fmt } = useMe();
  const [scope, setScope] = useState('today');
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setError(null);
    setOrders(null);
    api.get(`/admin/orders?scope=${scope}`).then(setOrders).catch((e) => setError(e.message));
  };
  useEffect(load, [scope]);

  const replace = (o) => setOrders((list) => list.map((x) => (x.id === o.id ? { ...x, ...o, user: x.user } : x)));

  // Что готовить: сколько каких блюд в неотменённых заказах
  const summary = useMemo(() => {
    if (!orders) return null;
    const active = orders.filter((o) => o.status !== 'cancelled');
    const dishes = new Map();
    for (const o of active) for (const i of o.items) dishes.set(i.name, (dishes.get(i.name) || 0) + i.qty);
    return {
      count: active.length,
      total: active.reduce((s, o) => s + o.amount, 0),
      dishes: [...dishes].sort((a, b) => b[1] - a[1]),
      custom: active.filter((o) => o.customRequest).length,
      fresh: active.filter((o) => o.status === 'new').length,
    };
  }, [orders]);

  const acceptAll = async () => {
    const fresh = orders.filter((o) => o.status === 'new');
    for (const o of fresh) replace(await api.post(`/admin/orders/${o.id}/accept`));
    haptic.ok();
  };

  return (
    <>
      <div className="toggle">
        <button className={scope === 'today' ? 'active' : ''} onClick={() => setScope('today')}>Сегодня</button>
        <button className={scope === 'open' ? 'active' : ''} onClick={() => setScope('open')}>Требуют внимания</button>
      </div>

      <ErrorNote error={error} onRetry={load} />
      {!orders && !error && <Loader />}

      {summary && scope === 'today' && summary.count > 0 && (
        <section className="card cook">
          <div className="cook-head">
            <span>{plural(summary.count, ['заказ', 'заказа', 'заказов'])}</span>
            <strong className="num">{fmt(summary.total)}</strong>
          </div>
          <ul className="cook-list">
            {summary.dishes.map(([name, qty]) => (
              <li key={name}><span>{name}</span><b className="num">{qty}</b></li>
            ))}
            {summary.custom > 0 && <li><span>Не из меню</span><b className="num">{summary.custom}</b></li>}
          </ul>
          {summary.fresh > 1 && (
            <button className="btn btn-soft btn-block" onClick={acceptAll}>Принять все новые ({summary.fresh})</button>
          )}
        </section>
      )}

      {orders && !orders.length && (
        <Empty title={scope === 'today' ? 'Сегодня заказов пока нет' : 'Всё обработано'}>
          {scope === 'today' ? 'Новые заказы появятся здесь, а бот пришлёт уведомление.' : 'Нет новых заказов и блюд без цены.'}
        </Empty>
      )}

      <ul className="list">
        {orders?.map((o) => <OrderCard key={o.id} order={o} onChange={replace} fmt={fmt} />)}
      </ul>
    </>
  );
}

function OrderCard({ order: o, onChange, fmt }) {
  const [price, setPrice] = useState(o.customPrice ? String(o.customPrice) : '');
  const [busy, setBusy] = useState(false);

  const act = async (path, body) => {
    setBusy(true);
    try {
      onChange(await api.post(`/admin/orders/${o.id}/${path}`, body));
      haptic.ok();
    } catch (e) {
      haptic.error();
      showAlert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`order${o.status === 'cancelled' ? ' muted' : ''}`}>
      <div className="order-head">
        <strong>#{o.number} {o.user?.name || `@${o.user?.username}`}</strong>
        <Badge status={o.status} />
      </div>
      <span className="hint">{o.user?.username ? `@${o.user.username}, ` : ''}{when(o.createdAt)}</span>
      <ul className="order-lines">
        {o.items.map((i, k) => <li key={k}>{i.name}{i.qty > 1 ? ` ×${i.qty}` : ''} <span className="hint num">{fmt(i.price * i.qty)}</span></li>)}
      </ul>

      {o.customRequest && (
        <div className="custom-box">
          <span className="field-label">Не из меню</span>
          <p>{o.customRequest}</p>
          {o.status !== 'cancelled' && (
            <div className="inline-form">
              <input inputMode="numeric" className="num" placeholder="Цена" value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d ]/g, ''))} />
              <button className="btn btn-soft" disabled={busy || !price} onClick={() => act('price', { price })}>
                {o.customPrice != null ? 'Изменить' : 'Указать цену'}
              </button>
            </div>
          )}
        </div>
      )}
      {o.comment && <p className="comment">💬 {o.comment}</p>}

      <div className="order-foot">
        <strong className="num">{fmt(o.amount)}</strong>
        {o.status !== 'cancelled' && (
          <div className="actions">
            <button className="btn btn-danger-soft" disabled={busy} onClick={() => act('cancel')}>Отменить</button>
            {o.status === 'new' && <button className="btn btn-primary" disabled={busy} onClick={() => act('accept')}>Принять</button>}
          </div>
        )}
      </div>
    </li>
  );
}
