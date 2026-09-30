/**
 * The dialog shell.
 *
 * Every modal in the game is the same card with a close button; callers supply
 * the contents. `className` lets a dialog tint its own frame (the bluff and quit
 * dialogs use warmer borders) without needing a separate component.
 */
export function Modal({
  children,
  onClose,
  className = "",
}: {
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className={["modal-card", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {children}
      </section>
    </div>
  );
}
