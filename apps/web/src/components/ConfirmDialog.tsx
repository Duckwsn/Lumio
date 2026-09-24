import { useEffect, useRef, useState } from "react";

type Props = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  nested?: boolean;
};

export function ConfirmDialog({ title, description, confirmLabel, onConfirm, onClose, nested = false }: Props) {
  const dialog = useRef<HTMLElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLElement>("[data-dialog-cancel]")?.focus();
    return () => previous?.focus();
  }, []);

  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try { await onConfirm(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir. Tente novamente."); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.stopPropagation(); if (!busy) onClose(); return; }
    if (event.key !== "Tab" || !dialog.current) return;
    const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return <div className={nested ? "nested-dialog-backdrop" : "dialog-backdrop"} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialog} className={`${nested ? "nested-dialog" : "dialog"} confirm-dialog`} role="alertdialog" aria-modal="true" aria-label={title} aria-describedby="confirm-description" onKeyDown={onKeyDown}>
      <h2>{title}</h2><p id="confirm-description">{description}</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="dialog-actions"><button type="button" data-dialog-cancel className="quiet-button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="danger-action" disabled={busy} onClick={() => void confirm()}>{busy ? "Aguarde…" : confirmLabel}</button></div>
    </section>
  </div>;
}
