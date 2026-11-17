use std::path::Path;
use std::process::Command;

/// Variables whose entries are filtered rather than dropped: they also carry the user's own paths.
const PATH_LISTS: &[&str] = &["PATH", "XDG_DATA_DIRS"];

/// Changes to make to the environment of a child process so it doesn't see the AppImage bundle.
/// The AppImage runtime points `LD_LIBRARY_PATH`, `PATH`, `GIO_MODULE_DIR`, `PYTHONHOME` and
/// others into its mount. System `git` then loads the bundle's older libraries (for example
/// libnghttp2) next to the system libcurl and fails with a symbol lookup error.
/// Returns `(name, Some(value))` to set and `(name, None)` to remove.
fn appimage_env_fixes(
    vars: impl Iterator<Item = (String, String)>,
    appdir: &str,
) -> Vec<(String, Option<String>)> {
    let appdir = appdir.trim_end_matches('/');
    if appdir.is_empty() {
        return vec![];
    }
    let mut fixes = vec![];
    for (k, v) in vars {
        if !v.contains(appdir) {
            continue;
        }
        if PATH_LISTS.contains(&k.as_str()) {
            let kept: Vec<&str> = v
                .split(':')
                .filter(|e| !e.is_empty() && !e.starts_with(appdir))
                .collect();
            fixes.push((k, Some(kept.join(":"))));
        } else {
            fixes.push((k, None));
        }
    }
    fixes
}

/// A `Command` for an external program, with the AppImage environment removed when running
/// from an AppImage. Use this for everything Rook starts.
pub fn command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    if let Ok(appdir) = std::env::var("APPDIR") {
        for (k, v) in appimage_env_fixes(std::env::vars(), &appdir) {
            match v {
                Some(v) => cmd.env(k, v),
                None => cmd.env_remove(k),
            };
        }
    }
    cmd
}

/// Run a program in `dir` (if given) and return stdout, or stderr as the error.
pub fn run(program: &str, args: &[&str], dir: Option<&str>) -> Result<String, String> {
    let mut cmd = command(program);
    cmd.args(args).env("GIT_TERMINAL_PROMPT", "0");
    if let Some(d) = dir {
        cmd.current_dir(d);
    }
    let out = cmd
        .output()
        .map_err(|e| format!("failed to run {program}: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        let err = String::from_utf8_lossy(&out.stderr);
        let msg = if err.trim().is_empty() {
            String::from_utf8_lossy(&out.stdout)
        } else {
            err
        };
        Err(msg.trim().to_string())
    }
}

/// Run git in `repo`.
pub fn git(repo: &str, args: &[&str]) -> Result<String, String> {
    run("git", args, Some(repo))
}

/// Run a git command that talks to the remote, authenticating through `gh`
/// so it works without `gh auth setup-git`.
pub fn git_remote(repo: &str, args: &[&str]) -> Result<String, String> {
    let mut full = vec![
        "-c",
        "credential.helper=",
        "-c",
        "credential.helper=!gh auth git-credential",
    ];
    full.extend_from_slice(args);
    run("git", &full, Some(repo))
}

pub fn ensure_repo(path: &str) -> Result<(), String> {
    if Path::new(path).join(".git").exists() {
        Ok(())
    } else {
        Err(format!("{path} is not a git repository"))
    }
}

/// Start a program without waiting for it to exit.
pub fn spawn_detached(program: &str, args: &[&str]) -> Result<(), String> {
    command(program)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("failed to start {program}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::appimage_env_fixes;

    fn vars(list: &[(&str, &str)]) -> impl Iterator<Item = (String, String)> {
        list.iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect::<Vec<_>>()
            .into_iter()
    }

    #[test]
    fn strips_appimage_paths() {
        let d = "/tmp/.mount_Rook.Ab12";
        let fixes = appimage_env_fixes(
            vars(&[
                ("LD_LIBRARY_PATH", "/tmp/.mount_Rook.Ab12/usr/lib/:/tmp/.mount_Rook.Ab12/lib/"),
                ("PATH", "/tmp/.mount_Rook.Ab12/usr/bin/:/home/u/.local/bin:/usr/bin"),
                ("XDG_DATA_DIRS", "/tmp/.mount_Rook.Ab12/usr/share/:/usr/share"),
                ("PYTHONHOME", "/tmp/.mount_Rook.Ab12/usr/"),
                ("APPDIR", d),
                ("HOME", "/home/u"),
                ("GTK_MODULES", "gail:atk-bridge"),
            ]),
            &format!("{d}/"),
        );
        assert_eq!(
            fixes,
            vec![
                ("LD_LIBRARY_PATH".into(), None),
                ("PATH".into(), Some("/home/u/.local/bin:/usr/bin".into())),
                ("XDG_DATA_DIRS".into(), Some("/usr/share".into())),
                ("PYTHONHOME".into(), None),
                ("APPDIR".into(), None),
            ]
        );
    }

    #[test]
    fn no_appdir_changes_nothing() {
        assert!(appimage_env_fixes(vars(&[("PATH", "/usr/bin")]), "").is_empty());
        assert!(appimage_env_fixes(vars(&[("PATH", "/usr/bin")]), "/").is_empty());
    }
}
