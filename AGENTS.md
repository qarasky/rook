# AGENTS.md

Guidance for AI agents (and people) working on Rook.

## What this is

Rook is a desktop GUI for the GitHub CLI, similar in scope to GitHub Desktop. It lists the repos
the user can access, clones them, and does day-to-day git work: status, diff, stage, commit,
push, pull, branches, history, discard and revert. It does this **only by running `gh` and
`git`**. It has no GitHub API client and no token handling of its own.

Stack: Tauri 2, a Rust backend, a React 19 + TypeScript frontend built with Vite. No UI
framework and no state library; state is local `useState` in the components.

## Environment

The machine is NixOS. The Tauri system libraries and the Rust toolchain exist only inside the
flake dev shell, so run everything through it:

```sh
nix --extra-experimental-features 'nix-command flakes' develop -c <command>
```

| Task | Command |
|---|---|
| Install JS deps | `npm install` |
| Run the app (hot reload) | `npm run tauri dev` |
| Type-check frontend | `npx tsc --noEmit` |
| Compile-check backend | `cd src-tauri && cargo check` |
| Frontend production build | `npm run build` |
| Regenerate icons | `npm run icons` |

Always run both the type-check and `cargo check` after a change, since a change often touches
both sides. There are **no automated tests yet**. If you add logic that parses git output
(see `parse_status` and `commit_detail` in `src-tauri/src/git.rs`), add a Rust unit test for it.

Do not run `npm create tauri-app` with `-f` in this folder again. It deletes `flake.nix` and
`flake.lock` (this already happened once).

## Nix package

`flake.nix` also defines `packages.x86_64-linux.default` (`nix build .#default`, `nix run .#default`),
built with `cargo-tauri.hook`. It wraps the binary with `gh` and `git` on `PATH`.

- A flake only sees git-tracked files. `git add` new files before `nix build`, or the build misses them.
- `npmDeps.hash` must be updated whenever `package-lock.json` changes: set it to `lib.fakeHash`,
  build once, and copy the hash from the error.
- Cargo crates come from `src-tauri/Cargo.lock`, so no hash is needed for them.
- Bump `version` in `flake.nix` together with `Cargo.toml`, `package.json` and `tauri.conf.json`.

## Releases and updates

- `.github/workflows/release.yml` builds an AppImage and a deb on every push to `main` (docs-only
  pushes are skipped) and publishes a GitHub release with `latest.json` for the updater.
- The version is `<major>.<minor>` from `tauri.conf.json` plus the workflow run number, injected
  with `TAURI_CONFIG`. The files in the repo stay at `0.1.0`. Change major/minor by editing
  `tauri.conf.json`.
- Update artifacts are signed. The public key is in `tauri.conf.json` (`plugins.updater`). The
  private key is the repo secret `TAURI_SIGNING_PRIVATE_KEY` and is also kept at
  `~/.tauri/rook.key` on the maintainer's machine. **If it is lost, installed copies can never
  be updated again.** Rotating it means shipping a new build by hand.
- `createUpdaterArtifacts` is deliberately set in CI, not in `tauri.conf.json`: the Nix build has
  no signing key and would fail.
- `src-tauri/src/updater.rs` has `check_update` and `install_update`. Only an AppImage can replace
  itself (`APPIMAGE` env var), so other installs just show "update available". The Nix package sets
  `ROOK_NO_UPDATE_CHECK` and never checks, because `nix profile upgrade` handles it.

## Layout

```
src/App.tsx           Shell: loads config, holds the selected repo, renders the toast
src/components/      Sidebar, RepoView (changes), HistoryView, TitleBar, Select, Dialog, DiffView,
                      icons.tsx (the only place that imports lucide-react)
src/api.ts            Typed wrappers over invoke(); keep in sync with the Rust commands
src/lib.ts            Small helpers (errMsg, path and time formatting)
src/App.css           All styles, built on the CSS variables at the top
src-tauri/src/cmd.rs  run / git / git_remote / spawn_detached helpers
src-tauri/src/gh.rs   Remote repo list, clone, config file
src-tauri/src/git.rs  Everything that touches a local repo
src-tauri/src/lib.rs  Command registration (generate_handler!)
src-tauri/capabilities/default.json   Tauri permissions for the main window
assets/               Logo source and renders
scripts/              Icon generator
```

## Adding a backend command

1. Write an `async fn` with `#[tauri::command]` in `gh.rs` or `git.rs`.
2. Register it in `generate_handler![...]` in `lib.rs`.
3. Add a typed wrapper in `src/api.ts`. Tauri maps Rust `snake_case` arguments to `camelCase`
   in JS (`name_with_owner` becomes `nameWithOwner`).
4. If it needs a new window API (not a custom command), add its permission to
   `capabilities/default.json`.

## Backend rules

- **Run external programs through `cmd.rs`**, never with a shell string. Pass arguments as a
  slice, and put user-supplied file names after a `--` so they cannot be read as options.
- Commands that talk to the remote (push, pull, fetch) must use `git_remote`, which sets `gh`
  as the credential helper. Local commands use `git`.
- Return `Result<_, String>` with git's own stderr as the message. The UI shows it in a toast.
- Validate paths that come from the UI before touching the filesystem. `discard` rejects
  absolute paths and `..`. Call `ensure_repo` first in commands that take a repo path.
- Anything destructive must also be checked **in the backend**, not only in the UI. For
  example, `undo_commit` and `revert_commit` re-verify that the commit is unpushed.
- `git status` runs with `--no-optional-locks` because the UI polls it. Do not drop that flag.
- A failed `git revert` must be followed by `git revert --abort`.

## Frontend rules

- The UI polls repo status and history every 2 seconds and on window focus. Updates go through a
  comparison against the previous result (`last` ref), so state only changes when data changed.
  Keep that, or the diff pane flickers. Polling errors are silent; user actions show a toast.
- Do not use `window.prompt`, `window.confirm` or `alert`. They are unreliable in the Tauri
  webview. Use the in-app `Dialog` component.
- The native window frame is off (`decorations: false`), so the app draws its own `TitleBar`.
  Dragging relies on `data-tauri-drag-region`. Keep the title bar rendered in every state,
  including loading and error, or the window cannot be closed.
- The default webview context menu is replaced by a custom one on file rows. Elsewhere the
  browser menu still appears.
- Do not use a native `<select>`: its popup can't be themed and renders white. Use
  `components/Select.tsx`.
- It must feel like a desktop app. `src/native.ts` blocks the browser context menu, zoom, page
  shortcuts and file-drop navigation, and `App.css` makes everything unselectable with an arrow
  cursor, except text fields, diffs and output (`user-select: text`). Use `cursor: default`, not
  `pointer`. New text that users should copy needs `user-select: text`.
- No external loads: no CDN fonts, images or scripts. Assets are bundled or inline.

## Design

Rook follows qarasky's shared project conventions (also used by Kore, Falco and Flatline): a single geometric
glyph on a dark rounded-square tile, a warm off-white for light marks, and **one accent per
product**.

| Role | Value |
|---|---|
| Logo tile | `#16181d` |
| Logo rook | `#F3F1E9` |
| Accent | `#5b8def` (shared with Kore; hover `#7aa3f2`) |
| Surfaces | `#16181d` bg, `#1d2026` surface, `#23262d` raised, `#2c3038` border |

- The UI takes its look from Kore: **dark only**, dense, hairline borders, 6px radius, 48px list
  rows, 40px controls (32px for compact ones), a 256px sidebar, 15px root size, Inter if
  installed and otherwise the system font, lucide icons. Use the CSS variables in `App.css`
  (`--surface`, `--raised`, `--border`, `--radius`, ...), not literals.
- Motion uses `framer-motion` with short transitions from `components/motion.ts`, and
  `MotionConfig reducedMotion="user"` in `App.tsx` honours the OS setting. Animate overlays
  (dialog, menu, popover, toast) and layout shifts (file rows moving between groups). **Never fade
  content that is just being replaced** (switching tab, file or repo): fading from opacity 0 makes
  frequent clicks flicker. Don't use `layoutId` for highlights either, it cross-fades; the sidebar
  pill and tab underline are plain CSS transitions.
- Status colours (success `#5fc98a`, danger `#f2777a`, warning `#e5a54b`) are separate from the accent.
  Never reuse the accent to mean success or failure.
- `assets/rook.svg` may contain only `<rect>` (with `x`, `y`, `width`, `height`, `rx`) and `<path>`
  built from `M`/`L`/`Z`, each with a literal `fill`. No curves, groups, transforms, strokes or
  gradients, because `scripts/generate_icon.py` has its own small renderer.
- Raster icons are **generated**. Run `npm run icons` and never edit `assets/*.png` or
  `src-tauri/icons/*` by hand. Keep `public/rook.svg` identical to `assets/rook.svg`.
- The title bar draws the rook inline in `TitleBar`. Update both places if the mark changes.

## Things that are easy to break

- **App identifier.** `tauri.conf.json` keeps `dev.skyler.ghwrapper` from before the rename to
  Rook. The config directory is named after it, so changing it silently drops the user's saved
  repo list. Change it only together with a migration.
- Remote repos come from `gh api user/repos` (owner, collaborator and organisation repos), not
  `gh repo list`. Clone folders fall back to `<owner>-<name>` on a name clash, so match local
  clones to remote ones through `LocalRepo.remote`, not by folder name.
- **Config file** lives in the Tauri app config dir (`config.json`). Adding fields needs
  `#[serde(default)]` or old files will fail to load.
- `tauri.conf.json` changes (such as window decorations) need a full restart of `tauri dev`.
- Renamed files in `git status` v2 carry an extra NUL-separated original path. `parse_status`
  skips it; keep that in mind when changing the parser.
- `discard` does not handle renamed files specially.

## Known gaps

See "Limitations" in `README.md`: no folder picker, the
editor is hard-wired to `codium`, and there are no tests.

## Git

Commit only when asked. When the user asks, write a short imperative subject line.
