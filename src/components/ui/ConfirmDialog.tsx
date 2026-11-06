import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, title, message, confirmText = '确定', danger, onConfirm, onClose } = props;
  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="confirm-title"
      cardClassName="confirm-modal"
    >
      <div className="confirm-modal-inner">
        <h3 id="confirm-title">{title}</h3>
        <p>{message}</p>
        <div className="confirm-modal-actions">
          <button type="button" className="confirm-btn" onClick={onClose} data-autofocus={danger ? true : undefined}>
            取消
          </button>
          <button type="button" className={danger ? 'confirm-btn primary danger' : 'confirm-btn primary'} data-autofocus={!danger ? true : undefined} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
