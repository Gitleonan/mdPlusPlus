import { create } from 'zustand';

interface DiscardConfirmRequest {
  id: number;
  title: string;
  message: string;
  confirmText: string;
}

interface DiscardConfirmState {
  request: DiscardConfirmRequest | null;
  ask: (title: string, message: string, confirmText?: string) => Promise<boolean>;
  resolve: (confirmed: boolean) => void;
}

let seq = 0;
let pendingResolve: ((confirmed: boolean) => void) | null = null;

/**
 * 统一的"未保存修改"异步确认。
 * WebView 中原生 window.confirm 会被直接放行,不能作为数据丢失的最后一道门。
 */
export const useDiscardConfirmStore = create<DiscardConfirmState>((set) => ({
  request: null,

  ask(title, message, confirmText = '放弃修改') {
    // 确认框是模态的;正常不会有并发请求。若有,前一个按取消处理,避免悬挂 Promise。
    pendingResolve?.(false);
    return new Promise<boolean>((resolvePromise) => {
      pendingResolve = resolvePromise;
      set({ request: { id: ++seq, title, message, confirmText } });
    });
  },

  resolve(confirmed) {
    const resolvePromise = pendingResolve;
    pendingResolve = null;
    set({ request: null });
    resolvePromise?.(confirmed);
  },
}));

/** 供测试隔离未完成的确认 Promise（生产代码无需调用） */
export function resetDiscardConfirmForTests(): void {
  pendingResolve?.(false);
  pendingResolve = null;
  useDiscardConfirmStore.setState({ request: null });
}
