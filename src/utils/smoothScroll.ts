/**
 * 自定义平滑滚动（兼容 Tauri WebView2，不依赖 CSS scroll-behavior）。
 * 使用 easeInOutCubic 在 ~200ms 内完成滚动动画。
 */

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 追踪每个滚动容器的活跃动画 ID，新动画自动取消旧动画 */
const activeAnimations = new WeakMap<HTMLElement, number>();

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
 * @param duration 动画时长 ms（默认 200）
 */
export function smoothScrollTo(
  element: HTMLElement,
  top: number,
  duration = 200,
): void {
  // 取消该容器上正在进行的动画，防止多个动画竞争
  cancelAnimation(element);

  const start = element.scrollTop;
  const delta = top - start;
  if (Math.abs(delta) < 1) return;

  const startTime = performance.now();

  function step(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeInOutCubic(progress);
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
 * 平滑滚动到指定元素
 * @param element 目标元素
 * @param container 滚动容器（默认向上查找最近的 scrollable parent）
 * @param block 'start' | 'center'（默认 'start'）
 * @param duration 动画时长 ms（默认 200）
 */
export function smoothScrollToElement(
  element: HTMLElement,
  container?: HTMLElement | null,
  block: 'start' | 'center' = 'start',
  duration = 200,
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
    targetTop = scroller.scrollTop + (elRect.top - scrollerRect.top);
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
