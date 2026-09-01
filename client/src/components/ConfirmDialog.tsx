import { Modal } from "./Modal";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  danger,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-slate-600 whitespace-pre-line">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel} disabled={loading}>
          Cancelar
        </button>
        <button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={loading}>
          {loading ? "Aguarde..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
