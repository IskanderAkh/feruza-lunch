import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { MeContext, makeFmt } from './context.js';
import { Loader } from './components.jsx';
import Menu from './pages/Menu.jsx';
import Checkout from './pages/Checkout.jsx';
import Pay from './pages/Pay.jsx';
import History from './pages/History.jsx';
import Admin from './admin/Admin.jsx';

const Icon = {
  menu: <path d="M4 13a8 8 0 0 1 16 0zM3 16h18M9 6.5V5h6v1.5" />,
  pay: <><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10.5h18M7 15h4" /></>,
  history: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  admin: <><path d="M5 20V10l7-5 7 5v10z" /><path d="M10 20v-5h4v5" /></>,
};

export default function App() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(() => (['menu', 'pay', 'history', 'admin'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'menu'));
  const [cart, setCart] = useState({}); // { dishId: { dish, qty } }
  const [checkout, setCheckout] = useState(null); // null | { focusCustom }
  const [lastOrder, setLastOrder] = useState(null);

  const refreshMe = useCallback(() => api.get('/me').then(setMe).catch((e) => setError(e.message)), []);
  useEffect(() => { refreshMe(); }, [refreshMe]);

  const ctx = useMemo(() => me && { me, refreshMe, fmt: makeFmt(me.currency) }, [me, refreshMe]);

  const go = (t) => {
    setCheckout(null);
    setLastOrder(null);
    setTab(t);
    history.replaceState(null, '', `#${t}`);
    window.scrollTo(0, 0);
  };

  if (error) {
    return (
      <div className="fatal">
        <p className="empty-title">Не получилось открыть меню</p>
        <p className="hint">{error}</p>
        <button className="btn btn-primary" onClick={() => { setError(null); refreshMe(); }}>Попробовать снова</button>
      </div>
    );
  }
  if (!ctx) return <div className="fatal"><Loader /></div>;

  let screen;
  if (tab === 'menu' && lastOrder) {
    screen = <OrderSent order={lastOrder} onPay={() => go('pay')} onMenu={() => setLastOrder(null)} />;
  } else if (tab === 'menu' && checkout) {
    screen = (
      <Checkout
        cart={cart} setCart={setCart} focusCustom={checkout.focusCustom}
        onBack={() => setCheckout(null)}
        onDone={(order) => { setCart({}); setCheckout(null); setLastOrder(order); refreshMe(); }}
      />
    );
  } else if (tab === 'menu') {
    screen = <Menu cart={cart} setCart={setCart} onCheckout={(focusCustom) => setCheckout({ focusCustom })} goPay={() => go('pay')} />;
  } else if (tab === 'pay') screen = <Pay />;
  else if (tab === 'history') screen = <History />;
  else if (tab === 'admin' && me.isAdmin) screen = <Admin />;

  const tabs = [['menu', 'Меню'], ['pay', 'Оплата'], ['history', 'Мои заказы'], ...(me.isAdmin ? [['admin', 'Повар']] : [])];

  return (
    <MeContext.Provider value={ctx}>
      <main className="app">{screen}</main>
      <nav className="tabbar">
        {tabs.map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{Icon[id]}</svg>
            <span>{label}</span>
            {id === 'pay' && me.debt > 0 && <i className="dot" aria-label="есть долг" />}
          </button>
        ))}
      </nav>
    </MeContext.Provider>
  );
}

function OrderSent({ order, onPay, onMenu }) {
  return (
    <section className="sent">
      <div className="sent-mark" aria-hidden="true">✓</div>
      <h1>Заказ #{order.number} отправлен</h1>
      <p className="hint">Когда повар примет заказ, бот пришлёт сообщение.
        {order.customRequest ? ' Цену блюда не из меню она сообщит отдельно.' : ''}</p>
      <div className="stack">
        <button className="btn btn-primary btn-block" onClick={onPay}>Перейти к оплате</button>
        <button className="btn btn-ghost btn-block" onClick={onMenu}>Вернуться в меню</button>
      </div>
    </section>
  );
}
