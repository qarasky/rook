import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { api, type Commit, type CommitDetail } from "../api";
import { errMsg, relTime, splitPath } from "../lib";
import { Dialog, type DialogSpec } from "./Dialog";
import { DiffView } from "./DiffView";
import { GitCommitHorizontal, Redo2, Undo2 } from "./icons";

export function HistoryView({
  path,
  active,
  onError,
  onChanged,
}: {
  path: string;
  /** The tab stays mounted while hidden, so state survives switching; polling pauses. */
  active: boolean;
  onError: (m: string) => void;
  onChanged: () => void;
}) {
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<{ key: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const last = useRef("");
  const bodyRef = useRef<HTMLPreElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  const load = useCallback(
    async (quiet = false) => {
      try {
        const c = await api.commitLog(path);
        const key = JSON.stringify(c);
        if (key === last.current) return;
        last.current = key;
        setCommits(c);
      } catch (e) {
        if (!quiet) onError(errMsg(e));
      }
    },
    [path, onError],
  );

  useEffect(() => {
    last.current = "";
    setCommits(null);
    setHash(null);
  }, [path]);

  useEffect(() => {
    if (!active) return;
    load();
    const t = setInterval(() => !document.hidden && load(true), 2000);
    return () => clearInterval(t);
  }, [active, load]);

  useEffect(() => {
    if (commits && commits.length > 0 && !commits.some((c) => c.hash === hash))
      setHash(commits[0].hash);
  }, [commits, hash]);

  useEffect(() => {
    setExpanded(false);
    setDetail(null);
    setFile(null);
    setDiffData(null);
    if (!hash) return;
    api
      .commitDetail(path, hash)
      .then((d) => {
        setDetail(d);
        setFile(d.files[0]?.path ?? null);
      })
      .catch((e) => onError(errMsg(e)));
  }, [path, hash, onError]);

  useEffect(() => {
    if (!hash || !file) return setDiffData(null);
    const key = `${hash}|${file}`;
    let stale = false;
    api
      .commitFileDiff(path, hash, file)
      .then((text) => !stale && setDiffData({ key, text }))
      .catch((e) => !stale && setDiffData({ key, text: errMsg(e) }));
    return () => {
      stale = true;
    };
  }, [path, hash, file]);

  // The description is cut to a few lines until expanded; only offer the toggle if it is cut.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || expanded) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [detail?.body, expanded]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
      last.current = "";
      load();
      onChanged();
    }
  };

  if (!commits) return <div className="empty">Loading…</div>;
  if (commits.length === 0)
    return (
      <div className="empty">
        <GitCommitHorizontal size={28} />
        <p>No commits yet</p>
      </div>
    );

  const current = commits.find((c) => c.hash === hash);
  const isHead = current?.hash === commits[0].hash;

  return (
    <div className="split">
      <section className="pane list-pane">
        <div className="scroll">
          {commits.map((c) => (
            <div
              key={c.hash}
              className={"row" + (c.hash === hash ? " selected" : "")}
              onClick={() => setHash(c.hash)}
            >
              <div className="row-main">
                <div className="row-title">{c.subject}</div>
                <div className="row-sub">
                  <span className="mono">{c.short}</span> · {c.author} · {relTime(c.date)}
                </div>
              </div>
              {c.unpushed && <span className="pill">Unpushed</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="detail">
        {current && (
          <div className="detail-in">
            <div className="meta">
              <h2>{current.subject}</h2>
              <div className="muted small">
                <span className="mono">{current.hash.slice(0, 12)}</span> · {current.author} ·{" "}
                {new Date(current.date).toLocaleString()}
              </div>
              {detail?.body && (
                <>
                  <pre ref={bodyRef} className={"body" + (expanded ? "" : " clamp")}>
                    {detail.body}
                  </pre>
                  {(clamped || expanded) && (
                    <button className="ghost link" onClick={() => setExpanded((e) => !e)}>
                      {expanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </>
              )}
              {current.unpushed && (
                <div className="row-actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      setDialog({
                        title: "Revert this commit?",
                        message: `Adds a new commit that reverses "${current.subject}".`,
                        confirmLabel: "Revert",
                        onConfirm: () => act(() => api.revertCommit(path, current.hash)),
                      })
                    }
                  >
                    <Undo2 size={14} /> Revert commit
                  </button>
                  {isHead && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        setDialog({
                          title: "Undo this commit?",
                          message: "The commit is removed and its changes go back to staged.",
                          confirmLabel: "Undo",
                          onConfirm: () => act(() => api.undoCommit(path)),
                        })
                      }
                    >
                      <Redo2 size={14} /> Undo commit
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="split inner">
              <div className="pane files-pane">
                <div className="group-head">
                  <span>{detail?.files.length ?? 0} changed files</span>
                </div>
                <div className="scroll">
                  {detail?.files.map((f) => {
                    const [dir, name] = splitPath(f.path);
                    return (
                      <div
                        key={f.path}
                        className={"file" + (f.path === file ? " selected" : "")}
                        onClick={() => setFile(f.path)}
                        title={f.path}
                      >
                        <span className={"st st-" + f.status}>{f.status}</span>
                        <span className="fname">
                          <span className="muted">{dir}</span>
                          {name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="diff">
                <div className="scroll">
                  {diffData && diffData.key === `${hash}|${file}` && <DiffView text={diffData.text} />}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
      <AnimatePresence>
        {dialog && <Dialog spec={dialog} onClose={() => setDialog(null)} />}
      </AnimatePresence>
    </div>
  );
}
