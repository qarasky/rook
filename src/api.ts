import { invoke } from "@tauri-apps/api/core";

export interface RemoteRepo {
  nameWithOwner: string;
  description: string | null;
  isPrivate: boolean;
  updatedAt: string;
  url: string;
}
export interface LocalRepo {
  name: string;
  path: string;
  remote?: string | null;
}
export interface Config {
  cloneDir: string;
  localRepos: LocalRepo[];
}
export interface FileChange {
  path: string;
  index: string;
  worktree: string;
}
export interface RepoStatus {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: FileChange[];
}
export interface Branches {
  current: string;
  local: string[];
}

export interface Commit {
  hash: string;
  short: string;
  author: string;
  date: string;
  subject: string;
  unpushed: boolean;
}
export interface CommitDetail {
  body: string;
  files: { path: string; status: string }[];
}

export interface UpdateInfo {
  version: string;
  notes: string | null;
  canInstall: boolean;
}

export const api = {
  getConfig: () => invoke<Config>("get_config"),
  setCloneDir: (dir: string) => invoke<Config>("set_clone_dir", { dir }),
  addLocalRepo: (path: string) => invoke<Config>("add_local_repo", { path }),
  removeLocalRepo: (path: string) => invoke<Config>("remove_local_repo", { path }),
  listRemoteRepos: (limit = 2000) => invoke<RemoteRepo[]>("list_remote_repos", { limit }),
  cloneRepo: (nameWithOwner: string) => invoke<Config>("clone_repo", { nameWithOwner }),
  status: (path: string) => invoke<RepoStatus>("repo_status", { path }),
  diff: (path: string, file: string, staged: boolean, untracked: boolean) =>
    invoke<string>("file_diff", { path, file, staged, untracked }),
  stage: (path: string, files: string[]) => invoke<void>("stage", { path, files }),
  unstage: (path: string, files: string[]) => invoke<void>("unstage", { path, files }),
  commit: (path: string, message: string, stageAll: boolean) =>
    invoke<void>("commit", { path, message, stageAll }),
  push: (path: string) => invoke<string>("push", { path }),
  pull: (path: string) => invoke<string>("pull", { path }),
  fetch: (path: string) => invoke<void>("fetch", { path }),
  branches: (path: string) => invoke<Branches>("list_branches", { path }),
  discard: (path: string, file: string, untracked: boolean, added: boolean) =>
    invoke<void>("discard", { path, file, untracked, added }),
  commitLog: (path: string, limit = 200) => invoke<Commit[]>("commit_log", { path, limit }),
  commitDetail: (path: string, hash: string) =>
    invoke<CommitDetail>("commit_detail", { path, hash }),
  commitFileDiff: (path: string, hash: string, file: string) =>
    invoke<string>("commit_file_diff", { path, hash, file }),
  undoCommit: (path: string) => invoke<void>("undo_commit", { path }),
  revertCommit: (path: string, hash: string) => invoke<void>("revert_commit", { path, hash }),
  checkUpdate: () => invoke<UpdateInfo | null>("check_update"),
  installUpdate: () => invoke<void>("install_update"),
  openInVscodium: (path: string) => invoke<void>("open_in_vscodium", { path }),
  checkout: (path: string, name: string, create: boolean) =>
    invoke<void>("checkout_branch", { path, name, create }),
};
