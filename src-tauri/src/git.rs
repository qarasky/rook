use serde::Serialize;

use crate::cmd::{ensure_repo, git, git_remote};

#[derive(Serialize, Default)]
pub struct FileChange {
    pub path: String,
    /// Status letter in the index ('.' = unchanged).
    pub index: char,
    /// Status letter in the working tree ('.' = unchanged, '?' = untracked).
    pub worktree: char,
}

#[derive(Serialize, Default)]
pub struct RepoStatus {
    pub branch: String,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<FileChange>,
}

fn parse_status(raw: &str) -> RepoStatus {
    let mut st = RepoStatus::default();
    let mut parts = raw.split('\0');
    while let Some(entry) = parts.next() {
        if let Some(h) = entry.strip_prefix("# branch.head ") {
            st.branch = h.to_string();
        } else if let Some(u) = entry.strip_prefix("# branch.upstream ") {
            st.upstream = Some(u.to_string());
        } else if let Some(ab) = entry.strip_prefix("# branch.ab ") {
            let mut it = ab.split(' ');
            st.ahead = it.next().and_then(|s| s[1..].parse().ok()).unwrap_or(0);
            st.behind = it.next().and_then(|s| s[1..].parse().ok()).unwrap_or(0);
        } else if let Some(p) = entry.strip_prefix("? ") {
            st.files.push(FileChange { path: p.into(), index: '.', worktree: '?' });
        } else if entry.starts_with("1 ") || entry.starts_with("2 ") || entry.starts_with("u ") {
            let renamed = entry.starts_with("2 ");
            let fields = match entry.chars().next() {
                Some('1') => 9,
                Some('2') => 10,
                _ => 11,
            };
            let f: Vec<&str> = entry.splitn(fields, ' ').collect();
            if f.len() == fields {
                let mut xy = f[1].chars();
                st.files.push(FileChange {
                    path: f[fields - 1].into(),
                    index: xy.next().unwrap_or('.'),
                    worktree: xy.next().unwrap_or('.'),
                });
            }
            if renamed {
                parts.next(); // original path
            }
        }
    }
    st
}

#[tauri::command]
pub async fn repo_status(path: String) -> Result<RepoStatus, String> {
    ensure_repo(&path)?;
    let raw = git(&path, &["--no-optional-locks", "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"])?;
    Ok(parse_status(&raw))
}

#[tauri::command]
pub async fn file_diff(path: String, file: String, staged: bool, untracked: bool) -> Result<String, String> {
    if untracked {
        // `git diff --no-index` exits 1 when files differ, so don't treat that as failure.
        let out = std::process::Command::new("git")
            .args(["diff", "--no-index", "--", "/dev/null", &file])
            .current_dir(&path)
            .output()
            .map_err(|e| e.to_string())?;
        return Ok(String::from_utf8_lossy(&out.stdout).into_owned());
    }
    let mut args = vec!["diff"];
    if staged {
        args.push("--cached");
    }
    args.extend(["--", &file]);
    git(&path, &args)
}

#[tauri::command]
pub async fn stage(path: String, files: Vec<String>) -> Result<(), String> {
    let mut args = vec!["add", "--"];
    args.extend(files.iter().map(String::as_str));
    git(&path, &args).map(|_| ())
}

#[tauri::command]
pub async fn unstage(path: String, files: Vec<String>) -> Result<(), String> {
    let mut args = vec!["restore", "--staged", "--"];
    args.extend(files.iter().map(String::as_str));
    git(&path, &args).map(|_| ())
}

#[tauri::command]
pub async fn commit(path: String, message: String, stage_all: bool) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("commit message is empty".into());
    }
    if stage_all {
        git(&path, &["add", "-A"])?;
    }
    git(&path, &["commit", "-m", &message]).map(|_| ())
}

#[tauri::command]
pub async fn push(path: String) -> Result<String, String> {
    let has_upstream = git(&path, &["rev-parse", "--abbrev-ref", "@{upstream}"]).is_ok();
    if has_upstream {
        git_remote(&path, &["push"])
    } else {
        git_remote(&path, &["push", "-u", "origin", "HEAD"])
    }
}

#[tauri::command]
pub async fn pull(path: String) -> Result<String, String> {
    git_remote(&path, &["pull", "--ff-only"])
}

#[tauri::command]
pub async fn fetch(path: String) -> Result<(), String> {
    git_remote(&path, &["fetch", "--prune"]).map(|_| ())
}

#[derive(Serialize)]
pub struct Branches {
    pub current: String,
    pub local: Vec<String>,
}

#[tauri::command]
pub async fn list_branches(path: String) -> Result<Branches, String> {
    let current = git(&path, &["branch", "--show-current"])?.trim().to_string();
    let local = git(&path, &["branch", "--format=%(refname:short)"])?
        .lines()
        .map(str::to_string)
        .collect();
    Ok(Branches { current, local })
}

#[tauri::command]
pub async fn checkout_branch(path: String, name: String, create: bool) -> Result<(), String> {
    let args: Vec<&str> = if create {
        vec!["switch", "-c", &name]
    } else {
        vec!["switch", &name]
    };
    git(&path, &args).map(|_| ())
}

#[tauri::command]
pub async fn open_in_vscodium(path: String) -> Result<(), String> {
    ensure_repo(&path)?;
    crate::cmd::spawn_detached("codium", &[&path])
}

/// Throw away all local changes to one file, staged and unstaged.
#[tauri::command]
pub async fn discard(path: String, file: String, untracked: bool, added: bool) -> Result<(), String> {
    ensure_repo(&path)?;
    let rel = std::path::Path::new(&file);
    if rel.is_absolute() || rel.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(format!("invalid path: {file}"));
    }
    if untracked {
        let full = std::path::Path::new(&path).join(rel);
        return std::fs::remove_file(&full).map_err(|e| format!("could not delete {file}: {e}"));
    }
    if added {
        // New file that was staged: it has no HEAD version to restore.
        return git(&path, &["rm", "-f", "--", &file]).map(|_| ());
    }
    git(&path, &["restore", "--source=HEAD", "--staged", "--worktree", "--", &file]).map(|_| ())
}

#[derive(Serialize)]
pub struct Commit {
    pub hash: String,
    pub short: String,
    pub author: String,
    pub date: String,
    pub subject: String,
    pub unpushed: bool,
}

#[derive(Serialize)]
pub struct CommitFile {
    pub path: String,
    pub status: String,
}

#[derive(Serialize)]
pub struct CommitDetail {
    pub body: String,
    pub files: Vec<CommitFile>,
}

fn has_commits(path: &str) -> bool {
    git(path, &["rev-parse", "--verify", "-q", "HEAD"]).is_ok()
}

/// Commits reachable from HEAD that exist on no remote yet.
fn unpushed_hashes(path: &str) -> Result<Vec<String>, String> {
    if !has_commits(path) {
        return Ok(vec![]);
    }
    let out = if git(path, &["rev-parse", "--abbrev-ref", "@{upstream}"]).is_ok() {
        git(path, &["rev-list", "@{upstream}..HEAD"])?
    } else {
        git(path, &["rev-list", "HEAD", "--not", "--remotes"])?
    };
    Ok(out.lines().map(str::to_string).collect())
}

fn require_unpushed(path: &str, hash: &str) -> Result<(), String> {
    if unpushed_hashes(path)?.iter().any(|h| h == hash) {
        Ok(())
    } else {
        Err("this commit has already been pushed".into())
    }
}

#[tauri::command]
pub async fn commit_log(path: String, limit: u32) -> Result<Vec<Commit>, String> {
    ensure_repo(&path)?;
    if !has_commits(&path) {
        return Ok(vec![]);
    }
    let unpushed = unpushed_hashes(&path)?;
    let n = format!("-n{limit}");
    let raw = git(
        &path,
        &["log", &n, "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e"],
    )?;
    Ok(raw
        .split('\x1e')
        .map(str::trim)
        .filter(|r| !r.is_empty())
        .filter_map(|r| {
            let f: Vec<&str> = r.split('\x1f').collect();
            (f.len() == 5).then(|| Commit {
                unpushed: unpushed.iter().any(|h| h == f[0]),
                hash: f[0].into(),
                short: f[1].into(),
                author: f[2].into(),
                date: f[3].into(),
                subject: f[4].into(),
            })
        })
        .collect())
}

#[tauri::command]
pub async fn commit_detail(path: String, hash: String) -> Result<CommitDetail, String> {
    ensure_repo(&path)?;
    let body = git(&path, &["show", "-s", "--format=%b", &hash])?.trim().to_string();
    let raw = git(
        &path,
        &["diff-tree", "--no-commit-id", "--name-status", "-r", "-z", "-M", "--root", &hash],
    )?;
    let mut files = vec![];
    let mut parts = raw.split('\0').filter(|p| !p.is_empty());
    while let Some(status) = parts.next() {
        let renamed = status.starts_with('R') || status.starts_with('C');
        if renamed {
            parts.next(); // old path
        }
        if let Some(p) = parts.next() {
            files.push(CommitFile { path: p.into(), status: status.chars().take(1).collect() });
        }
    }
    Ok(CommitDetail { body, files })
}

#[tauri::command]
pub async fn commit_file_diff(path: String, hash: String, file: String) -> Result<String, String> {
    git(&path, &["show", "--format=", "--root", &hash, "--", &file])
}

/// Undo the latest commit, keeping its changes staged. Only for unpushed commits.
#[tauri::command]
pub async fn undo_commit(path: String) -> Result<(), String> {
    ensure_repo(&path)?;
    let head = git(&path, &["rev-parse", "HEAD"])?.trim().to_string();
    require_unpushed(&path, &head)?;
    git(&path, &["reset", "--soft", "HEAD~1"]).map(|_| ())
}

/// Add a new commit that reverses `hash`. Only for unpushed commits.
#[tauri::command]
pub async fn revert_commit(path: String, hash: String) -> Result<(), String> {
    ensure_repo(&path)?;
    require_unpushed(&path, &hash)?;
    git(&path, &["revert", "--no-edit", &hash]).map(|_| ()).map_err(|e| {
        let _ = git(&path, &["revert", "--abort"]);
        e
    })
}
