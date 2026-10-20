import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useMe, when } from '../context.js';
import { MainButton, ErrorNote } from '../components.jsx';
import { haptic } from '../tg.js';

export default function Pay() {
  const { me, fmt, refreshMe } = useMe();
  const [amount, setAmount] = useState(me.debt > 0 ? String(me.debt) : '');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState([]);
  const [copied, setCopied] = useState(false);

  const loadPending = () => api.get('/my').then((d) => setPending(d.payments.filter((p) => p.status === 'pending'))).catch(() => {});
  useEffect(() => { loadPending(); }, []);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Номер карты копируем без пробелов, остальной текст — как есть
  const copyDetails = async () => {
    const card = me.paymentDetails.match(/\d[\d ]{14,22}\d/);
    const text = card ? card[0].replace(/\s/g, '') : me.paymentDetails;
    try {
      await navigator.clipboard.writeText(text);
      haptic.ok();
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Не удалось скопировать. Выделите номер вручную.');
    }
  };

  const digits = amount.replace(/\D/g, '');
  const canSend = file && Number(digits) > 0;

  async function submit() {
    if (!canSend || sending) return;
    setSending(true);
    setError(null);
    const form = new FormData();
    form.append('file', file);
    form.append('amount', digits);
    try {
      await api.upload('/payments', form);
      haptic.ok();
      setSent(true);
      setFile(null);
      refreshMe();
      loadPending();
    } catch (e) {
      haptic.error();
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page">
      <section className="debt-hero">
        <span>{me.debt > 0 ? 'К оплате' : 'Долгов нет'}</span>
        <strong className="num">{fmt(Math.max(me.debt, 0))}</strong>
      </section>

      {sent && (
        <div className="notice notice-ok" role="status">
          Скриншот отправлен повару. Когда она подтвердит оплату, бот пришлёт сообщение.
          <button className="link" onClick={() => setSent(false)}>Отправить ещё</button>
        </div>
      )}

      {!sent && (
        <>
          {me.paymentDetails && (
            <section className="card details">
              <div className="grow">
                <span className="field-label">Куда переводить</span>
                <p className="details-text">{me.paymentDetails}</p>
              </div>
              <button className="btn btn-soft" onClick={copyDetails}>{copied ? 'Скопировано' : 'Копировать'}</button>
            </section>
          )}

          <section className="card">
            <label className="field">
              <span className="field-label">Сколько перевели</span>
              <input inputMode="numeric" className="num" value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d ]/g, ''))} placeholder="40 000" />
            </label>

            <label className={`upload${file ? ' has-file' : ''}`}>
              <input type="file" accept="image/*,application/pdf" hidden
                onChange={(e) => { setFile(e.target.files?.[0] || null); setError(null); }} />
              {preview ? (
                <img src={preview} alt="Скриншот оплаты" />
              ) : file ? (
                <span className="upload-name">📄 {file.name}</span>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 14l2.5-3 2.5 3 2-2 3 3" /></svg>
                  <strong>Прикрепить скриншот</strong>
                  <span className="hint">Фото экрана из банковского приложения или PDF-чек</span>
                </>
              )}
              {file && <span className="upload-change">Заменить</span>}
            </label>
          </section>
          <ErrorNote error={error} />
        </>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="section-title">На проверке у повара</h2>
          <ul className="list">
            {pending.map((p) => (
              <li key={p.id} className="row">
                <span className="num">{fmt(p.amount)}</span>
                <span className="hint">{when(p.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MainButton visible={!sent} text="Отправить оплату" disabled={!canSend} loading={sending} onClick={submit} />
    </div>
  );
}
