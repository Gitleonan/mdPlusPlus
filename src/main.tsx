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
// 细节进 console;用户可见层只在页面尚未挂载时显示一行人话(挂载后由 ErrorBoundary/Toast 接管)
window.addEventListener('error', (e) => {
  console.error('[GLOBAL ERROR]', e.error ?? e.message);
  const el = document.getElementById('global-error');
  if (el && document.getElementById('root')?.childElementCount === 0) {
    el.textContent = 'md++ 启动遇到问题,请重启应用;问题持续请到 GitHub 反馈。';
    el.style.display = 'block';
  }
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[UNHANDLED REJECTION]', e.reason);
  const el = document.getElementById('global-error');
  if (el && document.getElementById('root')?.childElementCount === 0) {
    el.textContent = 'md++ 启动遇到问题,请重启应用;问题持续请到 GitHub 反馈。';
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
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0c0f14',
          fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
        }}>
          <div style={{
            maxWidth: 480,
            padding: '40px 32px',
            textAlign: 'center',
          }}>
            <h2 style={{ color: '#e4e7ec', fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>
              md++ 遇到了问题
            </h2>
            <p style={{ color: '#8b93a5', fontSize: 14, lineHeight: 1.7, margin: '0 0 24px' }}>
              界面渲染时出现异常,你的文件没有受到影响。<br />
              重启应用通常可以解决;问题持续请到 GitHub 反馈。
            </p>
            <button
              onClick={() => { this.setState({ error: null }); }}
              style={{
                padding: '8px 28px',
                borderRadius: 999,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              重试
            </button>
            <p style={{ color: '#5a6172', fontSize: 11, marginTop: 24, wordBreak: 'break-all' }}>
              {this.state.error.message}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// 错误提示 DOM 节点（全局错误用）
const globalErrorEl = document.createElement('div');
globalErrorEl.id = 'global-error';
globalErrorEl.style.cssText =
  'display:none;position:fixed;inset:0;z-index:99999;background:#0c0f14;color:#8b93a5;padding:40px;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif;font-size:14px;line-height:1.7;overflow:auto;';
document.body.appendChild(globalErrorEl);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
