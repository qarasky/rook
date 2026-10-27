import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { api, type Config, type RemoteRepo } from "../api";
import { errMsg, shortPath } from "../lib";
import { Cloud, Check, FolderGit2, FolderPlus, Loader2, Lock, RefreshCw, Search, X } from "./icons";
import { Select } from "./Select";

export function Sidebar(props: {
  config: Config;
  selected: string | null;
  onSelect: (path: string) => void;
  onConfig: (c: Config) => void;
  onError: (m: string) => void;
}) {
  const { config, selected, onSelect, onConfig, onError } = props;
  const [tab, setTab] = useState<"local" | "remote">("local");
  const [remote, setRemote] = useState<RemoteRepo[] | null>(null);
  const [filter, setFilter] = useState("");
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [addPath, setAddPath] = useState("");

  const loadRemote = useCallback(() => {
    setRemote(null);
    api.listRemoteRepos().then(setRemote).catch((e) => onError(errMsg(e)));
  }, [onError]);

  useEffect(() => {
    if (tab === "remote" && remote === null) loadRemote();
  }, [tab, remote, loadRemote]);

  const owners = useMemo(
    () => [...new Set((remote ?? []).map((r) => r.nameWithOwner.split("/")[0]))].sort(),
    [remote],
  );
  const isCloned = (r: RemoteRepo) =>
    config.localRepos.some(
      (l) => l.remote === r.nameWithOwner || (!l.remote && l.name === r.nameWithOwner.split("/")[1]),
    );
  // Typing stays responsive even with thousands of repos in the list.
  const q = useDeferredValue(filter).toLowerCase();

  const clone = async (r: RemoteRepo) => {
    setBusy(r.nameWithOwner);
    try {
      const c = await api.cloneRepo(r.nameWithOwner);
      onConfig(c);
      const added = c.localRepos.find((l) => l.remote === r.nameWithOwner);
      if (added) onSelect(added.path);
      setTab("local");
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const addExisting = async () => {
    const path = addPath.trim();
    if (!path) return;
    try {
      onConfig(await api.addLocalRepo(path));
      onSelect(path);
      setAddPath("");
    } catch (e) {
      onError(errMsg(e));
    }
  };

  const locals = config.localRepos.filter((r) => r.name.toLowerCase().includes(q));
  const remotes = (remote ?? []).filter(
    (r) =>
      r.nameWithOwner.toLowerCase().includes(q) &&
      (owner === "" || r.nameWithOwner.startsWith(owner + "/")),
  );

  return (
    <aside className="sidebar">
      <nav className="nav">
        <span className="nav-pill" style={{ transform: `translateY(${tab === "local" ? 0 : 42}px)` }} />
        <button className={"nav-item" + (tab === "local" ? " active" : "")} onClick={() => setTab("local")}>
          <FolderGit2 size={18} />
          <span>Local</span>
          <span className="count">{config.localRepos.length}</span>
        </button>
        <button className={"nav-item" + (tab === "remote" ? " active" : "")} onClick={() => setTab("remote")}>
          <Cloud size={18} />
          <span>GitHub</span>
          {remote && <span className="count">{remote.length}</span>}
        </button>
      </nav>

      <div className="search-row">
        <div className="search">
          <Search size={14} className="muted" />
          <input spellCheck={false} autoComplete="off" placeholder="Filter repositories" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {tab === "remote" && (
          <Select
            title="Owner"
            value={owner}
            onChange={setOwner}
            options={[{ value: "", label: "All" }, ...owners.map((o) => ({ value: o, label: o }))]}
          />
        )}
      </div>

      <div className="list">
        {tab === "local" && locals.length === 0 && (
          <p className="muted pad small">
            {config.localRepos.length === 0
              ? "No repositories yet. Clone one from GitHub or add an existing folder."
              : "No matches."}
          </p>
        )}
        {tab === "local" &&
          locals.map((r) => (
            <div
              key={r.path}
              className={"row" + (r.path === selected ? " selected" : "")}
              onClick={() => onSelect(r.path)}
              title={r.path}
            >
              <FolderGit2 size={18} className="row-icon" />
              <div className="row-main">
                <div className="row-title">{r.name}</div>
                <div className="row-sub">{shortPath(r.path)}</div>
              </div>
              <button
                className="ghost icon reveal"
                title="Remove from list (files stay on disk)"
                onClick={(e) => {
                  e.stopPropagation();
                  api.removeLocalRepo(r.path).then(onConfig).catch((x) => onError(errMsg(x)));
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}

        {tab === "remote" && remote === null && (
          <p className="muted pad small loading">
            <Loader2 size={14} className="spin" /> Loading repositories…
          </p>
        )}
        {tab === "remote" &&
          remotes.map((r) => {
            const [o, n] = r.nameWithOwner.split("/");
            return (
              <div key={r.nameWithOwner} className="row" title={r.description ?? ""}>
                <div className="row-main">
                  <div className="row-title">
                    <span className="muted">{o}/</span>
                    {n}
                    {r.isPrivate && <Lock size={12} className="muted lock" />}
                  </div>
                  <div className="row-sub">{r.description || "No description"}</div>
                </div>
                {isCloned(r) ? (
                  <span className="cloned">
                    <Check size={13} /> Cloned
                  </span>
                ) : (
                  <button disabled={busy !== null} onClick={() => clone(r)}>
                    {busy === r.nameWithOwner ? <Loader2 size={13} className="spin" /> : null}
                    {busy === r.nameWithOwner ? "Cloning" : "Clone"}
                  </button>
                )}
              </div>
            );
          })}
      </div>

      <div className="side-foot">
        {tab === "local" ? (
          <div className="search">
            <FolderPlus size={14} className="muted" />
            <input spellCheck={false} autoComplete="off"
              placeholder="Add existing repo by path"
              value={addPath}
              onChange={(e) => setAddPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addExisting()}
            />
          </div>
        ) : (
          <>
            <label className="muted small">Clone into</label>
            <div className="search-row tight">
              <input spellCheck={false} autoComplete="off"
                className="field sm"
                defaultValue={config.cloneDir}
                onBlur={(e) => {
                  if (e.target.value !== config.cloneDir)
                    api.setCloneDir(e.target.value).then(onConfig).catch((x) => onError(errMsg(x)));
                }}
              />
              <button className="icon" title="Refresh list" onClick={loadRemote}>
                <RefreshCw size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
