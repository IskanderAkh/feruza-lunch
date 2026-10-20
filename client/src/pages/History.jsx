import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useMe, when } from '../context.js';
import { Loader, Empty, Badge, ErrorNote } from '../components.jsx';

export default function History() {
  const { fmt } = useMe();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = () => { setError(null); api.get('/my').then(setData).catch((e) => setError(e.message)); };
  useEffect(load, []);

  if (error) return <div className="page"><ErrorNote error={error} onRetry={load} /></div>;
  if (!data) return <div className="page"><Loader /></div>;

  return (
    <div className="page">
      <header className="page-head"><h1>Мои заказы</h1></header>
      {!data.orders.length && <Empty title="Заказов пока нет">Выберите блюда на вкладке «Меню».</Empty>}
      <ul className="list">
        {data.orders.map((o) => (
          <li key={o.id} className="order">
            <div className="order-head">
              <strong>Заказ #{o.number}</strong>
              <Badge status={o.status} />
            </div>
            <ul className="order-lines">
              {o.items.map((i, k) => <li key={k}>{i.name}{i.qty > 1 ? ` ×${i.qty}` : ''}</li>)}
              {o.customRequest && (
                <li>{o.customRequest} <span className="hint">({o.customPrice != null ? fmt(o.customPrice) : 'цену укажет повар'})</span></li>
              )}
            </ul>
            <div className="order-foot">
              <span className="hint">{when(o.createdAt)}</span>
              <strong className="num">{fmt(o.amount)}</strong>
            </div>
          </li>
        ))}
      </ul>

      {data.payments.length > 0 && (
        <>
          <h2 className="section-title">Оплаты</h2>
          <ul className="list">
            {data.payments.map((p) => (
              <li key={p.id} className="row">
                <div className="grow">
                  <strong className="num">{fmt(p.amount)}</strong>
                  <span className="hint">{p.method === 'cash' ? 'наличными, ' : ''}{when(p.createdAt)}</span>
                </div>
                <Badge status={p.status} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
