mod cmd;
mod gh;
mod git;
mod updater;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            gh::get_config,
            gh::set_clone_dir,
            gh::add_local_repo,
            gh::remove_local_repo,
            gh::list_remote_repos,
            gh::clone_repo,
            git::repo_status,
            git::file_diff,
            git::stage,
            git::unstage,
            git::commit,
            git::push,
            git::pull,
            git::fetch,
            git::list_branches,
            git::checkout_branch,
            git::open_in_vscodium,
            git::discard,
            updater::check_update,
            updater::install_update,
            git::commit_log,
            git::commit_detail,
            git::commit_file_diff,
            git::undo_commit,
            git::revert_commit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
