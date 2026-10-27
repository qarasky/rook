# Rook

<img src="assets/rook.png" width="128" alt="Rook icon">

A small desktop GUI for the GitHub CLI. Browse the repos you have access to, clone one with a
click, then review changes, commit and push, in the spirit of GitHub Desktop. Rook has no
GitHub integration of its own: every action is a `gh` or `git` command, and your existing
`gh auth login` is the only credential it uses.

## Features

- **Repo list from GitHub.** Lists every repo you can access, including those of your
  organisations and ones you collaborate on, with an owner filter. Clones them into a folder you
  choose (`~/Documents/GitHub` by default).
- **Local repos.** Cloned repos show up in a Local tab. You can also add any existing checkout by path.
- **Changes.** Staged and unstaged files with checkboxes, a coloured diff per file, and a commit
  box. With nothing staged, the button commits everything.
- **Discard.** Right-click a file to throw away its changes, after a confirmation.
- **Push, pull, fetch.** Push and pull show how many commits you are ahead or behind. A branch
  with no upstream is pushed with `-u origin HEAD`.
- **Branches.** Switch branches or create a new one from the header.
- **History.** Browse commits with their title, description, changed files and diffs. Unpushed
  commits are marked, and can be reverted, or undone if it is the latest one.
- **Live.** The view refreshes by itself when files change on disk, so edits made in an editor or
  a terminal appear without reloading.
- **Open in VSCodium** from the header.
- A custom title bar instead of the native one, and a dark UI modelled on Kore.

## Requirements

- [GitHub CLI](https://cli.github.com/), signed in with `gh auth login`
- `git`
- Node.js and npm
- Rust toolchain
- On Linux, the Tauri system libraries: webkit2gtk 4.1, gtk3, libsoup 3
  (see [Tauri's prerequisites](https://tauri.app/start/prerequisites/))
- VSCodium on your `PATH` as `codium`, only for the Open in VSCodium button

On NixOS, or anywhere with Nix flakes, `nix develop` gives you everything above except `codium`.

## Getting started

```sh
nix develop            # skip if you installed the prerequisites yourself
npm install
npm run tauri dev      # run the app with hot reload
```

Build a release bundle:

```sh
npm run tauri build
```

Checks:

```sh
npx tsc --noEmit                      # type-check the frontend
cd src-tauri && cargo check           # compile-check the backend
```

## Download

Every push to `main` publishes a release with a Linux AppImage and a `.deb`:
https://github.com/qarasky/rook/releases/latest

The AppImage updates itself: Rook checks for a newer release on start and shows an **Update**
button in the title bar. Other installs (the `.deb`, Nix) show nothing or just point you to the
releases page, and are updated by their package manager. Releases are Linux only for now.

## Install with Nix

The flake builds Rook as a package that wraps in `gh` and `git`, so nothing else has to be installed:

```sh
nix run github:qarasky/rook               # try it without installing
nix profile install github:qarasky/rook   # install for your user
```

The Nix package does not check for updates itself; upgrade it with `nix profile upgrade` or by updating
your flake inputs.

Or add it to your own flake, for example in home-manager:

```nix
inputs.rook.url = "github:qarasky/rook";
# ...
home.packages = [ inputs.rook.packages.x86_64-linux.default ];
```

A flake only sees files tracked by git, so `git add` new files before building.

## How it works

Rook is a [Tauri 2](https://tauri.app/) app: a React and TypeScript frontend in a webview, and a
Rust backend that exposes a handful of commands to it.

```
src/            React UI: App.tsx, components/, and the typed wrapper around the backend (api.ts)
src-tauri/src/
  cmd.rs        run git/gh as a subprocess; git_remote() authenticates through `gh auth git-credential`
  gh.rs         remote repo list, clone, and the saved config
  git.rs        status, diff, stage, commit, push/pull, branches, history, discard
assets/         logo source (rook.svg) and renders
scripts/        generate_icon.py
```

Git networking commands (push, pull, fetch) run with `gh` as the credential helper, so they work
without `gh auth setup-git`.

### Configuration

Rook stores its list of local repos and the clone folder in `config.json` under the app config
directory, for example `~/.config/dev.skyler.ghwrapper/config.json` on Linux. The folder keeps the
app's original identifier so existing settings are not lost.

## Logo

The mark is a faceted rook: a chess piece, and a bird in the same family as Falco. It follows
the shared qarasky conventions of a single flat glyph on a dark rounded tile with one accent.

| | |
|---|---|
| Tile | `#16181d` |
| Rook | `#F3F1E9` |
| Accent facet | `#5b8def` (the same blue as Kore) |

`assets/rook.svg` is the source and may only contain `<rect>` and straight-line `<path>` polygons
(`M`, `L`, `Z`), because `scripts/generate_icon.py` has its own small renderer. After editing it,
regenerate everything with:

```sh
npm run icons
```

This rewrites `assets/rook.png`, `assets/rook-64.png` and the bundle icons in `src-tauri/icons/`.
Do not edit those by hand. Copy `assets/rook.svg` to `public/rook.svg` if the mark changes.

## Limitations

- Organisations that restrict third-party access to `gh` may hide some repos until you authorise it.
- Paths for cloning and adding repos are typed in, there is no folder picker.
- Revert and undo work only on unpushed commits.
- The editor button is hard-wired to `codium`.
- There are no automated tests yet.
