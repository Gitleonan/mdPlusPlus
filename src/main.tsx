import React, { Component, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'katex/dist/katex.min.css';
import './styles/themes.css';
import './styles/prose.css';
import './styles/index.css';

// 屏蔽右键菜单 — 调试模式下放行（允许审查元素）
let debugMode = localStorage.getItem('mdpp.debug') === 'true';
document.addEventListener('contextmenu', (e) => {
  if (!debugMode) e.preventDefault();
});
// 暴露给 AboutModal 调用
(window as unknown as Record<string, unknown>).__toggleDebug = (on: boolean) => {
  debugMode = on;
  localStorage.setItem('mdpp.debug', String(on));
};

// --- 全局错误捕获 ---
window.addEventListener('error', (e) => {
  console.error('[GLOBAL ERROR]', e.error ?? e.message);
  const el = document.getElementById('global-error');
  if (el) {
    el.textContent = `[GLOBAL ERROR] ${e.error?.stack ?? e.error ?? e.message}`;
    el.style.display = 'block';
  }
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[UNHANDLED REJECTION]', e.reason);
  const el = document.getElementById('global-error');
  if (el) {
    el.textContent = `[UNHANDLED REJECTION] ${e.reason?.stack ?? e.reason}`;
    el.style.display = 'block';
  }
});

// --- React Error Boundary ---
interface ErrorBoundaryState { error: Error | null }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[REACT ERROR BOUNDARY]', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 40,
          fontFamily: 'monospace',
          color: '#dc2626',
          background: '#1b1b1f',
          minHeight: '100vh',
          whiteSpace: 'pre-wrap',
          fontSize: 14,
          lineHeight: 1.6,
        }}>
          <h2 style={{ color: '#f87171' }}>💥 React 渲染崩溃</h2>
          <p><strong>{this.state.error.message}</strong></p>
          <pre style={{ color: '#94a3b8' }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// 错误提示 DOM 节点（全局错误用）
const globalErrorEl = document.createElement('pre');
globalErrorEl.id = 'global-error';
globalErrorEl.style.cssText =
  'display:none;position:fixed;inset:0;z-index:99999;background:#1b1b1f;color:#dc2626;padding:40px;font-family:monospace;font-size:14px;white-space:pre-wrap;line-height:1.6;overflow:auto;';
document.body.appendChild(globalErrorEl);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
