import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { UpdateInfo } from "../api";
import { Copy, Download, Loader2, Minus, Square, X } from "./icons";

export function RookMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.25} viewBox="256 192 512 640" aria-hidden="true">
      <path
        d="M312 230 L412 230 L412 290 L462 290 L462 230 L562 230 L562 290 L612 290 L612 230 L712 230 L712 380 L672 410 L690 700 L740 740 L740 800 L284 800 L284 740 L334 700 L352 410 L312 380 Z"
        fill="#F3F1E9"
      />
      <path
        d="M512 380 L712 380 L672 410 L690 700 L740 740 L740 800 L512 800 Z"
        fill="var(--accent)"
      />
    </svg>
  );
}

export function TitleBar({
  subtitle,
  update,
  updating,
  onUpdate,
}: {
  subtitle?: string;
  update?: UpdateInfo | null;
  updating?: boolean;
  onUpdate?: () => void;
}) {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const sync = () => win.isMaximized().then(setMaximized).catch(() => {});
    sync();
    const un = win.onResized(sync);
    return () => {
      un.then((f) => f());
    };
  }, [win]);

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="brand" data-tauri-drag-region>
        <span className="brand-mark" data-tauri-drag-region>
          <RookMark size={16} />
        </span>
        <span className="brand-name" data-tauri-drag-region>
          Rook
        </span>
      </div>
      <div className="crumb" data-tauri-drag-region>
        {subtitle}
      </div>
      {update && (
        <button className="update-btn" disabled={updating} onClick={onUpdate} title="A new version is available">
          {updating ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
          {updating ? "Updating…" : `Update ${update.version}`}
        </button>
      )}
      <div className="wbtns">
        <button className="ghost" title="Minimize" onClick={() => win.minimize()}>
          <Minus size={14} />
        </button>
        <button
          className="ghost"
          title={maximized ? "Restore" : "Maximize"}
          onClick={() => win.toggleMaximize()}
        >
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button className="ghost close" title="Close" onClick={() => win.close()}>
          <X size={15} />
        </button>
      </div>
    </header>
  );
}
