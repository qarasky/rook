use std::path::Path;
use std::process::Command;

/// Run a program in `dir` (if given) and return stdout, or stderr as the error.
pub fn run(program: &str, args: &[&str], dir: Option<&str>) -> Result<String, String> {
    let mut cmd = Command::new(program);
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
    Command::new(program)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("failed to start {program}: {e}"))
}
