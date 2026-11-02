import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useMe, when } from '../context.js';
import { Loader, Empty, ErrorNote, Switch } from '../components.jsx';
import { haptic, showAlert, showConfirm } from '../tg.js';

export default function News() {
  const { refreshMe } = useMe();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError(null);
    api.get('/admin/announcements').then(setList).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      haptic.ok();
      refreshMe();
    } catch (e) {
      haptic.error();
      showAlert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const publish = () => run(async () => {
    if (send && !(await showConfirm('Отправить объявление всем в Telegram?'))) return;
    const a = await api.post('/admin/announcements', { text, send });
    setList((l) => [a, ...(l || [])]);
    setText('');
    if (send) showAlert(`Отправлено: ${a.sentTo}`);
  });

  const toggle = (a) => run(async () => {
    const next = await api.patch(`/admin/announcements/${a.id}`, { active: !a.active });
    setList((l) => l.map((x) => (x.id === a.id ? next : x)));
  });

  const remove = (a) => run(async () => {
    if (!(await showConfirm('Удалить объявление?'))) return;
    await api.del(`/admin/announcements/${a.id}`);
    setList((l) => l.filter((x) => x.id !== a.id));
  });

  return (
    <>
      <section className="card">
        <label className="field">
          <span className="field-label">Новое объявление</span>
          <textarea rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Например: в пятницу обедов не будет, закажите заранее 🙏" />
          <span className="hint">Появится вверху меню у всех.</span>
        </label>
        <Switch checked={send} onChange={setSend} label="Отправить всем в Telegram" />
        <button className="btn btn-primary btn-block" disabled={busy || !text.trim()} onClick={publish}>
          {busy ? 'Публикую…' : 'Опубликовать'}
        </button>
      </section>

      <ErrorNote error={error} onRetry={load} />
      {!list && !error && <Loader />}
      {list && !list.length && <Empty title="Объявлений пока нет">Здесь будут все опубликованные объявления.</Empty>}

      <ul className="list">
        {list?.map((a) => (
          <li key={a.id} className={`order${a.active ? '' : ' muted'}`}>
            <p className="announce-text">{a.text}</p>
            <span className="hint">
              {when(a.createdAt)}{a.sentTo > 0 ? `, отправлено ${a.sentTo}` : ''}{a.active ? '' : ', скрыто'}
            </span>
            <div className="actions">
              <button className="btn btn-danger-soft" disabled={busy} onClick={() => remove(a)}>Удалить</button>
              <button className="btn btn-soft" disabled={busy} onClick={() => toggle(a)}>
                {a.active ? 'Скрыть из меню' : 'Показать снова'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
