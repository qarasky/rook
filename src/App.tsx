import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, type Config, type UpdateInfo } from "./api";
import { errMsg } from "./lib";
import { Dialog, type DialogSpec } from "./components/Dialog";
import { ease, spring } from "./components/motion";
import { RepoView } from "./components/RepoView";
import { Sidebar } from "./components/Sidebar";
import { RookMark, TitleBar } from "./components/TitleBar";
import "./App.css";

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const [dialog, setDialog] = useState<DialogSpec | null>(null);

  const onError = useCallback((m: string) => setError(m), []);

  useEffect(() => {
    api.getConfig().then(setConfig).catch((e) => setError(errMsg(e)));
  }, []);

  // Look for a new release shortly after start and then hourly. Failures (offline, no release
  // yet) are not worth showing.
  useEffect(() => {
    const check = () => api.checkUpdate().then(setUpdate).catch(() => {});
    const first = setTimeout(check, 3000);
    const every = setInterval(check, 60 * 60 * 1000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);

  const askUpdate = () => {
    if (!update) return;
    setDialog(
      update.canInstall
        ? {
            title: `Update to ${update.version}?`,
            message: update.notes ?? "Rook downloads the update and restarts.",
            confirmLabel: "Install and restart",
            onConfirm: () => {
              setUpdating(true);
              api.installUpdate().catch((e) => {
                setError(errMsg(e));
                setUpdating(false);
              });
            },
          }
        : {
            title: `Version ${update.version} is available`,
            message: "This installation can't update itself. Get the new version from the releases page.",
            confirmLabel: "Open releases",
            onConfirm: () => openUrl("https://github.com/qarasky/rook/releases/latest"),
          },
    );
  };

  // Errors dismiss themselves after a while; clicking dismisses them sooner.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 10000);
    return () => clearTimeout(t);
  }, [error]);

  if (!config)
    return (
      <div className="shell">
        <TitleBar />
        <div className="empty">{error || "Loading…"}</div>
      </div>
    );

  const current = config.localRepos.find((r) => r.path === selected);

  return (
    <MotionConfig reducedMotion="user">
    <div className="shell">
      <TitleBar subtitle={current?.remote ?? current?.name} update={update} updating={updating} onUpdate={askUpdate} />
      <div className="app">
        <Sidebar
          config={config}
          selected={selected}
          onSelect={setSelected}
          onConfig={setConfig}
          onError={onError}
        />
        {selected ? (
          <RepoView key={selected} path={selected} onError={onError} />
        ) : (
          <main className="main">
            <motion.div
              className="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring}
            >
              <RookMark size={40} />
              <p>Select or clone a repository</p>
            </motion.div>
          </main>
        )}
        <AnimatePresence>
          {dialog && <Dialog spec={dialog} onClose={() => setDialog(null)} />}
        </AnimatePresence>
        <AnimatePresence>
          {error && (
            <motion.div
              key={error}
              className="toast"
              onClick={() => setError("")}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={ease}
            >
              <pre>{error}</pre>
              <small>Click to dismiss</small>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
    </MotionConfig>
  );
}
