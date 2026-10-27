import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api, type Branches, type FileChange, type RepoStatus } from "../api";
import { errMsg, splitPath } from "../lib";
import { Dialog, type DialogSpec } from "./Dialog";
import { DiffView } from "./DiffView";
import { HistoryView } from "./HistoryView";
import {
  ArrowDown,
  ArrowUp,
  Code,
  FileDiff,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "./icons";
import { ease } from "./motion";
import { Select } from "./Select";

const NEW_BRANCH = "__new";
const label = (c: string) => ({ "?": "U" })[c] ?? c;

// Owns the text fields so typing doesn't re-render (and re-measure) the whole file list.
function CommitBox(props: {
  hasChanges: boolean;
  stagedCount: number;
  branch: string;
  busy: boolean;
  committing: boolean;
  onCommit: (message: string) => Promise<boolean>;
}) {
  const { hasChanges, stagedCount, branch, busy, committing, onCommit } = props;
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const message = description.trim() ? `${summary.trim()}\n\n${description.trim()}` : summary.trim();

  return (
    <div className="commit-box">
      <input
        className="field"
        placeholder="Summary (required)"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      <textarea
        className="field"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <button
        className="lg primary"
        disabled={summary.trim() === "" || !hasChanges || busy}
        onClick={async () => {
          if (await onCommit(message)) {
            setSummary("");
            setDescription("");
          }
        }}
      >
        {committing && <Loader2 size={14} className="spin" />}
        {stagedCount === 0 ? "Commit all" : `Commit ${stagedCount} staged`} to <b>{branch}</b>
      </button>
    </div>
  );
}

export function RepoView({ path, onError }: { path: string; onError: (m: string) => void }) {
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [branches, setBranches] = useState<Branches | null>(null);
  const [sel, setSel] = useState<{ file: FileChange; staged: boolean } | null>(null);
  const [diffData, setDiffData] = useState<{ key: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; file: FileChange; staged: boolean } | null>(null);
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [tab, setTab] = useState<"changes" | "history">("changes");
  const last = useRef("");

  // Only touches state when something changed, so polling doesn't cause flicker.
  const refresh = useCallback(
    async (quiet = false) => {
      try {
        const [s, b] = await Promise.all([api.status(path), api.branches(path)]);
        const key = JSON.stringify([s, b]);
        if (key === last.current) return;
        last.current = key;
        setStatus(s);
        setBranches(b);
      } catch (e) {
        if (!quiet) onError(errMsg(e));
      }
    },
    [path, onError],
  );

  // Pick up changes made outside the app (editor, terminal).
  useEffect(() => {
    const poll = () => !document.hidden && refresh(true);
    const t = setInterval(poll, 2000);
    window.addEventListener("focus", poll);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", poll);
    };
  }, [refresh]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("click", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);

  useEffect(() => {
    if (sel && status && !status.files.some((f) => f.path === sel.file.path)) setSel(null);
  }, [status, sel]);

  useEffect(() => {
    last.current = "";
    setMenu(null);
    setStatus(null);
    setSel(null);
    setDiffData(null);
    setInfo("");
    refresh();
  }, [path, refresh]);

  // The diff is stored with the file it belongs to, so the previous file's diff never flashes
  // while the next one loads.
  const selKey = sel ? `${sel.file.path}|${sel.staged}` : "";
  useEffect(() => {
    if (!sel) return setDiffData(null);
    let stale = false;
    api
      .diff(path, sel.file.path, sel.staged, sel.file.worktree === "?")
      .then((text) => !stale && setDiffData({ key: selKey, text }))
      .catch((e) => !stale && setDiffData({ key: selKey, text: errMsg(e) }));
    return () => {
      stale = true;
    };
  }, [sel, selKey, path, status]);

  // Resolves to whether the action succeeded.
  const act = async (name: string, fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(name);
    setInfo("");
    try {
      const r = await fn();
      if (typeof r === "string" && r.trim()) setInfo(r.trim());
      return true;
    } catch (e) {
      onError(errMsg(e));
      return false;
    } finally {
      setBusy(null);
      refresh();
    }
  };

  if (!status || !branches)
    return <main className="main" />;

  const staged = status.files.filter((f) => f.index !== "." && f.index !== "?");
  const unstaged = status.files.filter((f) => f.worktree !== ".");

  const askDiscard = (f: FileChange) =>
    setDialog({
      title: "Discard changes?",
      message: `${f.worktree === "?" ? "This permanently deletes" : "This permanently reverts"} ${f.path}. It can't be undone.`,
      confirmLabel: "Discard",
      danger: true,
      onConfirm: () =>
        act("discard", () => api.discard(path, f.path, f.worktree === "?", f.index === "A")),
    });

  const row = (f: FileChange, isStaged: boolean) => {
    const [dir, name] = splitPath(f.path);
    const st = label(isStaged ? f.index : f.worktree);
    return (
      <motion.div
        key={(isStaged ? "s:" : "u:") + f.path}
        layout="position"
        transition={ease}
        className={"file" + (sel?.file.path === f.path && sel.staged === isStaged ? " selected" : "")}
        title={f.path}
        onClick={() => setSel({ file: f, staged: isStaged })}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, file: f, staged: isStaged });
        }}
      >
        <input
          type="checkbox"
          checked={isStaged}
          onClick={(e) => e.stopPropagation()}
          onChange={() =>
            act("stage", () => (isStaged ? api.unstage(path, [f.path]) : api.stage(path, [f.path])))
          }
        />
        <span className="fname">
          <span className="muted">{dir}</span>
          {name}
        </span>
        <span className={"st st-" + st}>{st}</span>
      </motion.div>
    );
  };

  return (
    <main className="main">
      <div className="bar">
        <Select
          title="Branch"
          icon={<GitBranch size={14} />}
          value={branches.current}
          disabled={busy !== null}
          options={[
            ...branches.local.map((b) => ({ value: b, label: b })),
            { value: NEW_BRANCH, label: "New branch…", action: true, icon: <Plus size={14} /> },
          ]}
          onChange={(v) => {
            if (v === NEW_BRANCH)
              setDialog({
                title: "New branch",
                message: `Created from ${branches.current}`,
                input: true,
                confirmLabel: "Create",
                onConfirm: (n) => act("branch", () => api.checkout(path, n, true)),
              });
            else act("branch", () => api.checkout(path, v, false));
          }}
        />
        <span className="chip" title={status.upstream ?? "No upstream branch"}>
          {status.upstream ? (
            <>
              <ArrowUp size={12} />
              {status.ahead}
              <ArrowDown size={12} />
              {status.behind}
            </>
          ) : (
            "No upstream"
          )}
        </span>
        <span className="spacer" />
        <button title="Open in VSCodium" onClick={() => api.openInVscodium(path).catch((e) => onError(errMsg(e)))}>
          <Code size={14} /> VSCodium
        </button>
        <button disabled={busy !== null} onClick={() => act("fetch", () => api.fetch(path))}>
          <RefreshCw size={14} className={busy === "fetch" ? "spin" : ""} /> Fetch
        </button>
        <button disabled={busy !== null || !status.upstream} onClick={() => act("pull", () => api.pull(path))}>
          {busy === "pull" ? <Loader2 size={14} className="spin" /> : <ArrowDown size={14} />}
          Pull{status.behind ? ` ${status.behind}` : ""}
        </button>
        <button
          className="primary"
          disabled={busy !== null || (status.upstream !== null && status.ahead === 0)}
          onClick={() => act("push", () => api.push(path))}
        >
          {busy === "push" ? <Loader2 size={14} className="spin" /> : <ArrowUp size={14} />}
          Push{status.ahead ? ` ${status.ahead}` : ""}
        </button>
      </div>

      <div className="tabs">
        <button className={tab === "changes" ? "active" : ""} onClick={() => setTab("changes")}>
          Changes{status.files.length > 0 && <span className="count">{status.files.length}</span>}
          <span className="tab-line" />
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          History
          <span className="tab-line" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {info && (
          <motion.div
            className="info-wrap"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={ease}
          >
            <pre className="info">{info}</pre>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="tabpane" hidden={tab !== "history"}>
        <HistoryView path={path} active={tab === "history"} onError={onError} onChanged={() => refresh(true)} />
      </div>

      <div className="split" hidden={tab !== "changes"}>
        <section className="pane list-pane">
          <div className="scroll">
            {status.files.length === 0 && (
              <p key="clean" className="muted pad small">Working tree clean. Nothing to commit.</p>
            )}
            {staged.length > 0 && (
              <motion.div key="staged-head" layout="position" transition={ease} className="group-head">
                <span>Staged · {staged.length}</span>
                <button className="ghost" onClick={() => act("stage", () => api.unstage(path, staged.map((f) => f.path)))}>
                  Unstage all
                </button>
              </motion.div>
            )}
            {staged.map((f) => row(f, true))}
            {unstaged.length > 0 && (
              <motion.div key="unstaged-head" layout="position" transition={ease} className="group-head">
                <span>Changes · {unstaged.length}</span>
                <button className="ghost" onClick={() => act("stage", () => api.stage(path, unstaged.map((f) => f.path)))}>
                  Stage all
                </button>
              </motion.div>
            )}
            {unstaged.map((f) => row(f, false))}
          </div>
          <CommitBox
            hasChanges={status.files.length > 0}
            stagedCount={staged.length}
            branch={branches.current}
            busy={busy !== null}
            committing={busy === "commit"}
            onCommit={(message) => act("commit", () => api.commit(path, message, staged.length === 0))}
          />
        </section>

        <section className="diff">
          {sel ? (
            <>
              <div className="diff-head">
                <span className={"st st-" + label(sel.staged ? sel.file.index : sel.file.worktree)}>
                  {label(sel.staged ? sel.file.index : sel.file.worktree)}
                </span>
                <span className="fname">{sel.file.path}</span>
                {sel.staged && <span className="pill">Staged</span>}
              </div>
              <div className="scroll">
                {diffData && diffData.key === selKey && <DiffView text={diffData.text} />}
              </div>
            </>
          ) : (
            <div className="empty">
              <FileDiff size={28} />
              <p>Select a file to see its diff</p>
            </div>
          )}
        </section>
      </div>

      <AnimatePresence>
      {menu && (
        <motion.div
          className="menu"
          style={{ left: menu.x, top: menu.y }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={ease}
        >
          <button
            className="ghost"
            onClick={() =>
              act("stage", () =>
                menu.staged ? api.unstage(path, [menu.file.path]) : api.stage(path, [menu.file.path]),
              )
            }
          >
            <Plus size={14} /> {menu.staged ? "Unstage" : "Stage"}
          </button>
          <button className="ghost danger-text" onClick={() => askDiscard(menu.file)}>
            <Trash2 size={14} /> Discard changes
          </button>
        </motion.div>
      )}
      </AnimatePresence>
      <AnimatePresence>
        {dialog && <Dialog spec={dialog} onClose={() => setDialog(null)} />}
      </AnimatePresence>
    </main>
  );
}
