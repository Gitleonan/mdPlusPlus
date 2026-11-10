/**
 * 宽表格的横向滚动条。
 *
 * 贴在表格最上方（表头之上）；表格竖向滚动时吸在内容区顶部，
 * 不用再翻到表格底部去找原生滚动条。
 */

const MIN_THUMB = 48;

/** 给横向滚动容器挂一条同步滚动条（插在容器前面的 .table-block 里） */
export function attachTableScrollbar(scroll: HTMLElement): void {
  if (scroll.dataset.mdHscroll === 'true') return;
  scroll.dataset.mdHscroll = 'true';

  const strip = document.createElement('div');
  strip.className = 'table-hscroll';
  strip.setAttribute('aria-hidden', 'true');
  const thumb = document.createElement('div');
  thumb.className = 'table-hscroll-thumb';
  strip.appendChild(thumb);
  scroll.before(strip);

  let frame = 0;

  const update = () => {
    frame = 0;
    const overflow = scroll.scrollWidth - scroll.clientWidth;
    if (overflow <= 1) {
      strip.classList.add('is-hidden');
      return;
    }
    strip.classList.remove('is-hidden');

    const track = strip.clientWidth;
    if (!track) return;
    const thumbWidth = Math.max(MIN_THUMB, track * (scroll.clientWidth / scroll.scrollWidth));
    thumb.style.width = `${Math.round(thumbWidth)}px`;
    thumb.style.transform = `translateX(${Math.round((scroll.scrollLeft / overflow) * (track - thumbWidth))}px)`;
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  scroll.addEventListener('scroll', schedule, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(schedule).observe(scroll);

  // 点击轨道：直接跳到对应位置
  strip.addEventListener('pointerdown', (e) => {
    if (e.target === thumb) return;
    e.preventDefault();
    const rect = strip.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    scroll.scrollLeft = ratio * (scroll.scrollWidth - scroll.clientWidth);
    schedule();
  });

  // 拖动滑块
  thumb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startScroll = scroll.scrollLeft;
    const range = Math.max(1, scroll.scrollWidth - scroll.clientWidth);
    const dragRange = Math.max(1, strip.clientWidth - thumb.getBoundingClientRect().width);
    document.body.classList.add('is-hscroll-dragging');

    const onMove = (move: PointerEvent) => {
      scroll.scrollLeft = startScroll + ((move.clientX - startX) / dragRange) * range;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      document.body.classList.remove('is-hscroll-dragging');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  });

  // 滚轮在滚动条上直接横滚
  strip.addEventListener('wheel', (e) => {
    e.preventDefault();
    scroll.scrollLeft += e.deltaY + e.deltaX;
  }, { passive: false });

  update();
}
