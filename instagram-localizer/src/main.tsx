import React from 'react';
import ReactDOM from 'react-dom/client';
import AccountGate from './components/AccountGate';
import './index.css';
import { applyTheme, loadTheme } from './lib/theme';

// 화면이 그려지기 전에 테마를 먼저 적용해서, 켤 때 색이 번쩍 바뀌지 않게 해요.
applyTheme(loadTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AccountGate />
  </React.StrictMode>,
);
