use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
    /// Only an AppImage can replace itself. Other installs are updated by their package manager.
    pub can_install: bool,
}

/// Set by the Nix package: the store is read-only and `nix profile upgrade` does the updating.
fn managed_externally() -> bool {
    std::env::var_os("ROOK_NO_UPDATE_CHECK").is_some()
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    if managed_externally() {
        return Ok(None);
    }
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    Ok(update.map(|u| UpdateInfo {
        version: u.version,
        notes: u.body,
        can_install: std::env::var_os("APPIMAGE").is_some(),
    }))
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    if std::env::var_os("APPIMAGE").is_none() {
        return Err("this installation can't update itself".into());
    }
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("already up to date")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart()
}
