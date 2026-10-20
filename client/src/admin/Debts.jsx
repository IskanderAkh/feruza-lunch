import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useMe, plural } from '../context.js';
import { Loader, Empty, ErrorNote } from '../components.jsx';
import { haptic, showAlert, showConfirm } from '../tg.js';

export default function Debts() {
  const { fmt } = useMe();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [reminding, setReminding] = useState(false);

  const load = () => { setError(null); api.get('/admin/debts').then(setList).catch((e) => setError(e.message)); };
  useEffect(load, []);

  const total = list?.reduce((s, d) => s + d.debt, 0) || 0;
  const unreachable = list?.filter((d) => !d.started).length || 0;

  const remind = async () => {
    if (!(await showConfirm(`Отправить напоминание? Получат: ${plural(list.length - unreachable, ['человек', 'человека', 'человек'])}.`))) return;
    setReminding(true);
    try {
      const r = await api.post('/admin/remind');
      haptic.ok();
      showAlert(`Отправлено: ${r.sent}` + (r.failed ? `\nНе дошло: ${r.failed} (не запускали бота)` : ''));
    } catch (e) {
      showAlert(e.message);
    } finally {
      setReminding(false);
    }
  };

  const cash = async (d) => {
    if (!(await showConfirm(`${d.name || '@' + d.username} заплатил наличными ${fmt(d.debt)}?`))) return;
    try {
      await api.post(`/admin/debts/${d.userId}/cash`, {});
      haptic.ok();
      setList((l) => l.filter((x) => x.userId !== d.userId));
    } catch (e) {
      showAlert(e.message);
    }
  };

  if (error) return <ErrorNote error={error} onRetry={load} />;
  if (!list) return <Loader />;
  if (!list.length) return <Empty title="Должников нет">Все оплатили, можно отдыхать.</Empty>;

  return (
    <>
      <section className="debt-hero small">
        <span>Должны {plural(list.length, ['человек', 'человека', 'человек'])}</span>
        <strong className="num">{fmt(total)}</strong>
        <button className="btn btn-primary" disabled={reminding} onClick={remind}>
          {reminding ? 'Отправляю…' : 'Напомнить всем'}
        </button>
      </section>
      {unreachable > 0 && (
        <p className="hint pad">Значок ⚠️ — человек не запускал бота, напоминание ему не дойдёт.</p>
      )}
      <ul className="list">
        {list.map((d) => (
          <li key={d.userId} className="row">
            <div className="grow">
              <strong>{d.started ? '' : '⚠️ '}{d.name || `@${d.username}`}</strong>
              {d.username && d.name && <span className="hint">@{d.username}</span>}
            </div>
            <span className="num debt-num">{fmt(d.debt)}</span>
            <button className="btn btn-soft btn-small" onClick={() => cash(d)}>Наличные</button>
          </li>
        ))}
      </ul>
    </>
  );
}
