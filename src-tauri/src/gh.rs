use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::cmd::run;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteRepo {
    pub name_with_owner: String,
    pub description: Option<String>,
    pub is_private: bool,
    pub updated_at: String,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LocalRepo {
    pub name: String,
    pub path: String,
    /// `owner/name` on GitHub, when Rook cloned it.
    #[serde(default)]
    pub remote: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub clone_dir: String,
    pub local_repos: Vec<LocalRepo>,
}

impl Default for Config {
    fn default() -> Self {
        let home = std::env::var("HOME").unwrap_or_default();
        Config {
            clone_dir: format!("{home}/Documents/GitHub"),
            local_repos: vec![],
        }
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

fn load(app: &AppHandle) -> Result<Config, String> {
    let p = config_path(app)?;
    match fs::read_to_string(&p) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| format!("bad config: {e}")),
        Err(_) => Ok(Config::default()),
    }
}

fn save(app: &AppHandle, cfg: &Config) -> Result<(), String> {
    let s = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(config_path(app)?, s).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_config(app: AppHandle) -> Result<Config, String> {
    load(&app)
}

#[tauri::command]
pub async fn set_clone_dir(app: AppHandle, dir: String) -> Result<Config, String> {
    let mut cfg = load(&app)?;
    cfg.clone_dir = dir;
    save(&app, &cfg)?;
    Ok(cfg)
}

fn register(app: &AppHandle, path: String, remote: Option<String>) -> Result<Config, String> {
    if !std::path::Path::new(&path).join(".git").exists() {
        return Err(format!("{path} is not a git repository"));
    }
    let mut cfg = load(app)?;
    if !cfg.local_repos.iter().any(|r| r.path == path) {
        let name = path.rsplit('/').next().unwrap_or(&path).to_string();
        cfg.local_repos.push(LocalRepo { name, path, remote });
        save(app, &cfg)?;
    }
    Ok(cfg)
}

#[tauri::command]
pub async fn add_local_repo(app: AppHandle, path: String) -> Result<Config, String> {
    register(&app, path, None)
}

#[tauri::command]
pub async fn remove_local_repo(app: AppHandle, path: String) -> Result<Config, String> {
    let mut cfg = load(&app)?;
    cfg.local_repos.retain(|r| r.path != path);
    save(&app, &cfg)?;
    Ok(cfg)
}

/// Every repo the user can access: their own, ones they collaborate on, and
/// those of organisations they belong to.
#[tauri::command]
pub async fn list_remote_repos(limit: usize) -> Result<Vec<RemoteRepo>, String> {
    let out = run(
        "gh",
        &[
            "api",
            "--paginate",
            "user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
            "--jq",
            ".[] | {nameWithOwner: .full_name, description: .description, isPrivate: .private, updatedAt: .updated_at, url: .html_url}",
        ],
        None,
    )?;
    out.lines()
        .filter(|l| !l.trim().is_empty())
        .take(limit)
        .map(|l| serde_json::from_str(l).map_err(|e| e.to_string()))
        .collect()
}

/// Clones into `<clone_dir>/<repo name>`, or `<owner>-<name>` if that folder is taken.
#[tauri::command]
pub async fn clone_repo(app: AppHandle, name_with_owner: String) -> Result<Config, String> {
    let cfg = load(&app)?;
    let base = cfg.clone_dir.trim_end_matches('/');
    let (owner, name) = name_with_owner.split_once('/').unwrap_or(("", &name_with_owner));
    let mut dest = format!("{base}/{name}");
    if std::path::Path::new(&dest).exists() {
        dest = format!("{base}/{owner}-{name}");
        if std::path::Path::new(&dest).exists() {
            return Err(format!("{dest} already exists"));
        }
    }
    fs::create_dir_all(&cfg.clone_dir).map_err(|e| e.to_string())?;
    run("gh", &["repo", "clone", &name_with_owner, &dest], None)?;
    register(&app, dest, Some(name_with_owner))
}
