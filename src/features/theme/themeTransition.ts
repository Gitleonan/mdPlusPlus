/**
 * 全局视图过渡：整页交叉淡化。
 *
 * 优先用 View Transitions（WebView2 / 新版 WKWebView），
 * 旧 WebView 降级为颜色属性过渡；用户要求减少动效时直接切换。
 */

const FALLBACK_CLASS = 'theme-transitioning';
const VT_CLASS = 'view-transitioning';
const FALLBACK_MS = 320;

export function withViewTransition(update: () => void, durationMs = 320): void {
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    update();
    return;
  }

  const root = document.documentElement;

  // 旧 WebView 没有该 API，用 typeof 兜住
  if (typeof document.startViewTransition === 'function') {
    root.style.setProperty('--vt-duration', `${durationMs}ms`);
    const cleanup = () => root.classList.remove(VT_CLASS);
    try {
      // 在旧快照之后、新快照之前冻结逐元素 transition：
      // 否则长文档里成百上千个节点同时起动画，新快照还会拍到尚未走完的中间色。
      const vt = document.startViewTransition(() => {
        root.classList.add(VT_CLASS);
        update();
      });
      vt.finished.then(cleanup, cleanup);
    } catch {
      cleanup();
      update();
    }
    return;
  }

  // ponytail: 旧 WebView 的整树颜色过渡，文档极大时仍可用但更耗重绘；
  // 若将来要优化，可收窄到 .app-shell 与 .md-content 两棵子树。
  root.classList.add(FALLBACK_CLASS);
  update();
  window.setTimeout(() => root.classList.remove(FALLBACK_CLASS), FALLBACK_MS + 60);
}

/** 主题切换：慢一点，让整页换色不显得突兀 */
export function withThemeTransition(update: () => void): void {
  withViewTransition(update, 500);
}
