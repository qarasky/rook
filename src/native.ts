// Makes the webview behave like a desktop app instead of a web page.

const editable = (t: EventTarget | null) =>
  t instanceof Element && t.closest("input, textarea, [contenteditable='true']") !== null;

export function installNativeBehavior() {
  // No browser context menu (Back, Reload, Inspect...). Text fields keep theirs for copy/paste.
  window.addEventListener("contextmenu", (e) => {
    if (!editable(e.target)) e.preventDefault();
  });

  // Dropping a file on the window must not navigate to it; nothing is draggable either.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());
  window.addEventListener("dragstart", (e) => {
    if (!editable(e.target)) e.preventDefault();
  });

  // No page zoom from Ctrl+wheel or Ctrl +/-/0.
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && ["+", "-", "=", "0"].includes(key)) e.preventDefault();
    // Page-level shortcuts that make no sense in an app. Reload stays available in dev for HMR.
    if (mod && ["p", "u", "s"].includes(key)) e.preventDefault();
    if (!import.meta.env.DEV && ((mod && key === "r") || key === "f5")) e.preventDefault();
  });
}
