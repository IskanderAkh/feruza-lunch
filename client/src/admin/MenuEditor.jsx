import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useMe, resizeImage } from '../context.js';
import { Loader, Switch, ErrorNote } from '../components.jsx';
import { haptic, showAlert, showConfirm } from '../tg.js';

export default function MenuEditor() {
  const { fmt } = useMe();
  const [dishes, setDishes] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // id | 'new' | null

  const load = () => { setError(null); api.get('/admin/dishes').then(setDishes).catch((e) => setError(e.message)); };
  useEffect(load, []);

  const upsert = (d) => setDishes((l) => (l.some((x) => x.id === d.id) ? l.map((x) => (x.id === d.id ? d : x)) : [...l, d]));

  const toggle = async (d, available) => {
    upsert({ ...d, available });
    try { upsert(await api.patch(`/admin/dishes/${d.id}`, { available })); }
    catch (e) { upsert(d); showAlert(e.message); }
  };

  if (error) return <ErrorNote error={error} onRetry={load} />;
  if (!dishes) return <Loader />;

  return (
    <>
      <p className="hint pad">Выключенные блюда не видны в меню. Удобно, когда что-то закончилось.</p>
      <ul className="list">
        {dishes.map((d) => (
          <li key={d.id} className="dish-row-wrap">
            <div className="dish-row">
              <button className="dish-row-main" onClick={() => setEditing(editing === d.id ? null : d.id)}>
                {d.image ? <img src={d.image} alt="" /> : <span className="dish-ph small" />}
                <span className="grow">
                  <strong>{d.name}</strong>
                  <span className="hint num">{fmt(d.price)}</span>
                </span>
              </button>
              <Switch checked={d.available} onChange={(v) => toggle(d, v)} />
            </div>
            {editing === d.id && (
              <DishForm dish={d} onSaved={(x) => { upsert(x); setEditing(null); }}
                onDeleted={() => { setDishes((l) => l.filter((x) => x.id !== d.id)); setEditing(null); }} />
            )}
          </li>
        ))}
      </ul>
      {editing === 'new' ? (
        <section className="card"><DishForm onSaved={(x) => { upsert(x); setEditing(null); }} onCancel={() => setEditing(null)} /></section>
      ) : (
        <button className="btn btn-soft btn-block" onClick={() => setEditing('new')}>Добавить блюдо</button>
      )}
    </>
  );
}

function DishForm({ dish, onSaved, onDeleted, onCancel }) {
  const [name, setName] = useState(dish?.name || '');
  const [description, setDescription] = useState(dish?.description || '');
  const [price, setPrice] = useState(dish ? String(dish.price) : '40000');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const body = { name, description, price };
      let saved = dish ? await api.patch(`/admin/dishes/${dish.id}`, body) : await api.post('/admin/dishes', body);
      if (photo) {
        const form = new FormData();
        form.append('file', await resizeImage(photo), 'dish.jpg');
        saved = await api.upload(`/admin/dishes/${saved.id}/image`, form);
      }
      haptic.ok();
      onSaved(saved);
    } catch (e) {
      haptic.error();
      showAlert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await showConfirm(`Удалить «${dish.name}» из меню? Старые заказы останутся.`))) return;
    await api.del(`/admin/dishes/${dish.id}`);
    onDeleted();
  }

  return (
    <div className="dish-form">
      <label className="field"><span className="field-label">Название</span>
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Плов" /></label>
      <label className="field"><span className="field-label">Что входит</span>
        <input value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder="Плов, ачичук, лепёшка" /></label>
      <label className="field"><span className="field-label">Цена</span>
        <input inputMode="numeric" className="num" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d ]/g, ''))} /></label>
      <label className="btn btn-soft btn-block file-btn">
        <input type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
        {photo ? `Фото: ${photo.name}` : dish?.image ? 'Заменить фото' : 'Добавить фото'}
      </label>
      <div className="actions">
        {dish ? <button className="btn btn-danger-soft" onClick={remove}>Удалить</button>
          : <button className="btn btn-ghost" onClick={onCancel}>Отмена</button>}
        <button className="btn btn-primary" disabled={busy || !name.trim() || !price} onClick={save}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
