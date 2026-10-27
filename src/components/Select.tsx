import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "./icons";
import { ease } from "./motion";

export interface SelectOption {
  value: string;
  label: string;
  /** Rendered after a separator and never shown as the current value. */
  action?: boolean;
  icon?: ReactNode;
}

/** Custom select: the native one can't be themed (its popup renders white). */
export function Select(props: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  icon?: ReactNode;
  title?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { value, options, onChange, icon, title, disabled, className } = props;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value && !o.action);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [open]);

  const openList = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (o: SelectOption) => {
    setOpen(false);
    onChange(o.value);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") setActive((a) => Math.min(options.length - 1, a + 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
    else if (e.key === "Enter") pick(options[active]);
    else return;
    e.preventDefault();
  };

  const firstAction = options.findIndex((o) => o.action);

  return (
    <div className={"select " + (className ?? "")} ref={box} onKeyDown={onKey}>
      <button
        className="select-trigger"
        title={title}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openList())}
      >
        {icon}
        <span className="select-label">{current?.label ?? value}</span>
        <ChevronDown size={14} className="muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="select-list"
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={ease}
          >
          {options.map((o, i) => (
            <div key={o.value}>
              {i === firstAction && <div className="select-sep" />}
              <div
                role="option"
                aria-selected={o.value === value && !o.action}
                className={"select-opt" + (i === active ? " active" : "")}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
              >
                {o.icon}
                <span className="select-label">{o.label}</span>
                {o.value === value && !o.action && <Check size={14} />}
              </div>
            </div>
          ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
