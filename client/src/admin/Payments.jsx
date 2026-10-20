import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useMe, when } from '../context.js';
import { Loader, Empty, Badge, ErrorNote } from '../components.jsx';
import { haptic, showAlert } from '../tg.js';

export default function Payments() {
  const { fmt } = useMe();
  const [status, setStatus] = useState('pending');
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(null);

  const load = () => {
    setError(null);
    setList(null);
    api.get(`/admin/payments?status=${status}`).then(setList).catch((e) => setError(e.message));
  };
  useEffect(load, [status]);

  const review = async (p, action) => {
    try {
      await api.post(`/admin/payments/${p.id}/${action}`);
      haptic.ok();
      setList((l) => status === 'pending'
        ? l.filter((x) => x.id !== p.id)
        : l.map((x) => (x.id === p.id ? { ...x, status: action === 'confirm' ? 'confirmed' : 'rejected' } : x)));
    } catch (e) {
      haptic.error();
      showAlert(e.message);
      load();
    }
  };

  return (
    <>
      <div className="toggle">
        <button className={status === 'pending' ? 'active' : ''} onClick={() => setStatus('pending')}>На проверке</button>
        <button className={status === 'all' ? 'active' : ''} onClick={() => setStatus('all')}>Все</button>
      </div>
      <ErrorNote error={error} onRetry={load} />
      {!list && !error && <Loader />}
      {list && !list.length && <Empty title="Новых оплат нет">Скриншоты появятся здесь, бот тоже пришлёт уведомление.</Empty>}

      <ul className="list">
        {list?.map((p) => (
          <li key={p.id} className="pay-card">
            {p.method === 'cash' ? <div className="thumb thumb-cash">Наличные</div> : <Thumb payment={p} onOpen={setZoom} />}
            <div className="grow">
              <strong>{p.user?.name || `@${p.user?.username}`}</strong>
              <span className="pay-amount num">{fmt(p.amount)}</span>
              <span className="hint">Долг: {fmt(p.debt)}{p.amount > p.debt && p.status === 'pending' ? ' — сумма больше долга' : ''}</span>
              <span className="hint">{when(p.createdAt)}</span>
              {p.status === 'pending' ? (
                <div className="actions">
                  <button className="btn btn-danger-soft" onClick={() => review(p, 'reject')}>Отклонить</button>
                  <button className="btn btn-primary" onClick={() => review(p, 'confirm')}>Подтвердить</button>
                </div>
              ) : <Badge status={p.status} />}
            </div>
          </li>
        ))}
      </ul>

      {zoom && (
        <button className="lightbox" onClick={() => setZoom(null)} aria-label="Закрыть">
          <img src={zoom} alt="Скриншот оплаты" />
        </button>
      )}
    </>
  );
}

// Скриншот грузим с авторизацией и показываем через blob-ссылку
function Thumb({ payment, onOpen }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (payment.isDoc) return;
    let objectUrl;
    api.blob(`/admin/payments/${payment.id}/file`)
      .then((b) => { objectUrl = URL.createObjectURL(b); setUrl(objectUrl); })
      .catch(() => setFailed(true));
    return () => objectUrl && URL.revokeObjectURL(objectUrl);
  }, [payment.id, payment.isDoc]);

  if (payment.isDoc) return <div className="thumb">PDF<br /><small>в чате с ботом</small></div>;
  if (failed) return <div className="thumb">Нет фото</div>;
  if (!url) return <div className="thumb shimmer" />;
  return <button className="thumb" onClick={() => onOpen(url)}><img src={url} alt="Скриншот оплаты" /></button>;
}
