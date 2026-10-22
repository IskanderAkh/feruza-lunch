import { useState } from 'react';
import Orders from './Orders.jsx';
import Payments from './Payments.jsx';
import Debts from './Debts.jsx';
import MenuEditor from './MenuEditor.jsx';
import Settings from './Settings.jsx';
import News from './News.jsx';

const SECTIONS = [
  ['orders', 'Заказы', Orders],
  ['payments', 'Оплаты', Payments],
  ['debts', 'Долги', Debts],
  ['menu', 'Меню', MenuEditor],
  ['news', 'Объявления', News],
  ['settings', 'Настройки', Settings],
];

export default function Admin() {
  const [section, setSection] = useState('orders');
  const Current = SECTIONS.find(([id]) => id === section)[2];
  return (
    <div className="page">
      <nav className="segments" aria-label="Разделы">
        {SECTIONS.map(([id, label]) => (
          <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>{label}</button>
        ))}
      </nav>
      <Current />
    </div>
  );
}
