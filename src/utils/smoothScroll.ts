/**
 * 自定义平滑滚动（兼容 Tauri WebView2，不依赖 CSS scroll-behavior）。
 * 使用 easeOutQuart 在 ~300ms 内完成丝滑滚动动画，并遵循 prefers-reduced-motion。
 */

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** 追踪每个滚动容器的活跃动画 ID，新动画自动取消旧动画 */
const activeAnimations = new WeakMap<HTMLElement, number>();
const activeHighlightTimers = new WeakMap<HTMLElement, number>();

function cancelAnimation(element: HTMLElement): void {
  const id = activeAnimations.get(element);
  if (id != null) {
    cancelAnimationFrame(id);
    activeAnimations.delete(element);
  }
}

/**
 * 平滑滚动到指定位置
 * @param element 滚动容器
 * @param top 目标 scrollTop
 * @param duration 动画时长 ms（默认 320）
 */
export function smoothScrollTo(
  element: HTMLElement,
  top: number,
  duration = 320,
): void {
  // 取消该容器上正在进行的动画，防止多个动画竞争
  cancelAnimation(element);

  const start = element.scrollTop;
  const delta = top - start;
  if (Math.abs(delta) < 1) return;

  if (prefersReducedMotion() || duration <= 0) {
    element.scrollTop = top;
    return;
  }

  // 根据滚动距离自适应微调时长（短距轻快，长距舒缓）
  const adaptiveDuration = Math.min(480, Math.max(220, duration + Math.abs(delta) * 0.08));
  const startTime = performance.now();

  function step(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / adaptiveDuration, 1);
    const eased = easeOutQuart(progress);
    element.scrollTop = start + delta * eased;

    if (progress < 1) {
      const id = requestAnimationFrame(step);
      activeAnimations.set(element, id);
    } else {
      activeAnimations.delete(element);
    }
  }

  const id = requestAnimationFrame(step);
  activeAnimations.set(element, id);
}

/**
 * 给刚跳转到的章节标题触发一次柔和的落点脉冲动效，让跳转有清晰的视觉锚定反馈。
 */
export function flashHeadingAnchor(element: HTMLElement): void {
  const prevTimer = activeHighlightTimers.get(element);
  if (prevTimer != null) {
    window.clearTimeout(prevTimer);
  }
  element.classList.remove('heading-jump-highlight');
  // 强制重排以允许连续点击同一标题时重新播放动画
  void element.offsetWidth;
  element.classList.add('heading-jump-highlight');

  const timer = window.setTimeout(() => {
    element.classList.remove('heading-jump-highlight');
    activeHighlightTimers.delete(element);
  }, 1100);
  activeHighlightTimers.set(element, timer);
}

/**
 * 平滑滚动到指定元素
 * @param element 目标元素
 * @param container 滚动容器（默认向上查找最近的 scrollable parent）
 * @param block 'start' | 'center'（默认 'start'）
 * @param duration 动画时长 ms（默认 320）
 */
export function smoothScrollToElement(
  element: HTMLElement,
  container?: HTMLElement | null,
  block: 'start' | 'center' = 'start',
  duration = 320,
): void {
  const scroller = container ?? findScrollParent(element);
  if (!scroller) return;

  const elRect = element.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();

  let targetTop: number;
  if (block === 'center') {
    targetTop =
      scroller.scrollTop +
      (elRect.top - scrollerRect.top) -
      scrollerRect.height / 2 +
      elRect.height / 2;
  } else {
    // 顶部留出 20px 呼吸间距，避免标题紧贴标题栏边缘
    targetTop = scroller.scrollTop + (elRect.top - scrollerRect.top) - 20;
  }

  smoothScrollTo(scroller, Math.max(0, targetTop), duration);
}

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let parent = el.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return parent;
    parent = parent.parentElement;
  }
  return null;
}
