import { create } from 'zustand';

export type ToastType = 'info' | 'error' | 'success';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, type?: ToastType) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
const AUTO_DISMISS_MS = 3600;

/** 轻量全局提示:保存失败/导入反馈/禁用操作说明 */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push(message, type = 'info') {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
