import { ConfirmDialog } from './ConfirmDialog';
import { useDiscardConfirmStore } from '../../stores/discardConfirmStore';

/** 全局未保存修改确认：由 store 的异步操作发起，避免依赖 WebView 原生 confirm。 */
export function DiscardConfirmDialog() {
  const request = useDiscardConfirmStore((s) => s.request);
  const resolve = useDiscardConfirmStore((s) => s.resolve);

  return (
    <ConfirmDialog
      open={request !== null}
      title={request?.title ?? ''}
      message={request?.message ?? ''}
      confirmText={request?.confirmText}
      danger
      onConfirm={() => resolve(true)}
      onClose={() => resolve(false)}
    />
  );
}
