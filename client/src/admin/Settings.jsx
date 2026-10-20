import { useState } from 'react';
import { api } from '../api.js';
import { useMe } from '../context.js';
import { Switch } from '../components.jsx';
import { haptic, showAlert } from '../tg.js';

export default function Settings() {
  const { me, refreshMe } = useMe();
  const [details, setDetails] = useState(me.paymentDetails);
  const [saving, setSaving] = useState(false);

  const save = async (patch) => {
    setSaving(true);
    try {
      await api.patch('/admin/settings', patch);
      await refreshMe();
      haptic.ok();
    } catch (e) {
      showAlert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="card">
        <Switch checked={me.ordersOpen} onChange={(v) => save({ ordersOpen: v })}
          label={me.ordersOpen ? 'Приём заказов открыт' : 'Приём заказов закрыт'} />
        <p className="hint">Закройте, когда уже начали готовить. Меню останется видно, но заказать будет нельзя.</p>
      </section>
      <section className="card">
        <label className="field">
          <span className="field-label">Реквизиты для оплаты</span>
          <textarea rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)}
            placeholder={'Uzcard 8600 1234 5678 9012\nИмя Фамилия'} />
          <span className="hint">Их увидят все на вкладке «Оплата». Номер карты копируется одной кнопкой.</span>
        </label>
        <button className="btn btn-primary btn-block" disabled={saving || details === me.paymentDetails}
          onClick={() => save({ paymentDetails: details })}>Сохранить реквизиты</button>
      </section>
    </>
  );
}
