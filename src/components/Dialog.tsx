import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ease, spring } from "./motion";

export interface DialogSpec {
  title: string;
  message?: string;
  input?: boolean;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (value: string) => void;
}

export function Dialog({ spec, onClose }: { spec: DialogSpec; onClose: () => void }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const submit = () => {
    if (spec.input && !value.trim()) return;
    onClose();
    spec.onConfirm(value.trim());
  };

  return (
    <motion.div
      className="backdrop"
      onMouseDown={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={ease}
    >
      <motion.div
        className="dialog"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4 }}
        transition={spring}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      >
        <h3>{spec.title}</h3>
        {spec.message && <p className="muted">{spec.message}</p>}
        {spec.input && (
          <input spellCheck={false} autoComplete="off" className="field" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        )}
        <div className="actions">
          <button className="lg" onClick={onClose}>
            Cancel
          </button>
          <button
            className={"lg " + (spec.danger ? "danger" : "primary")}
            autoFocus={!spec.input}
            onClick={submit}
          >
            {spec.confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
