@AGENTS.md

## Claude Code

- Run build and type checks through the flake shell (see `AGENTS.md`). `cargo` and `tauri`
  are not on the default `PATH`.
- `npm run tauri dev` is long-running. Start it with `run_in_background` and read its log, not
  with a foreground command.
- The user reads output in a terminal. Keep summaries short and say plainly what was not
  verified, such as UI behaviour you could not see.
