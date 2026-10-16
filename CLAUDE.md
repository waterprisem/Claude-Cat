# Claude Cat

A small macOS Electron app: a desktop cat that reflects what Claude Code is doing (coding / waiting / done), one cat per session, with hover speech bubbles. Driven entirely by Claude Code hooks posting JSON to a localhost server.

**Read `PLAN.md` first.** It has the spec, architecture, state machine and phases. Work on one phase at a time, tick its checkboxes, and commit when it is done.

## Stack and conventions

- Electron, plain JavaScript (CommonJS), no frontend framework, no bundler unless packaging needs one
- Keep dependencies minimal. Ask before adding any dependency beyond Electron and the packager
- Tests use `node:test`. Run with `npm test`
- Run the app with `npm start`
- Small files, one responsibility each, following the layout in `PLAN.md`
- Constants (port, timings, sizes) live in one place and can be overridden by `config.json`

## Hard rules

1. **Never slow down or break Claude Code.** The hook command must always exit 0, print nothing, and time out fast. The HTTP server must answer immediately and do real work afterwards.
2. **Localhost only.** Bind to `127.0.0.1`. No telemetry, no outbound network calls.
3. **Treat hook payloads as untrusted input.** Validate fields, cap string lengths, never execute or evaluate anything from a payload. Render text with `textContent`, never `innerHTML`.
4. **Never modify `~/.claude/settings.json` without a timestamped backup**, and only touch entries marked `# claude-cat`.
5. **The cat must never steal focus** or cause the Dock icon to appear.
6. **Do not trust `PLAN.md` over real data.** Hook event names and payload fields must be verified against the current Claude Code docs and actual logged payloads. Record what you find in PLAN.md section 5.
7. Do not ship or load the 1080px source images in the renderer. Use the processed 512px frames.

## Workflow

- Start each session by reading `PLAN.md` and checking which phase is current
- Use plan mode for anything touching window behavior (click-through, always-on-top, Spaces), since it is easy to get subtly wrong
- When a phase's acceptance criteria require real-world testing with a live Claude Code session, say so clearly and tell the user exactly what to do rather than guessing
- If an assumption in `PLAN.md` turns out to be wrong (asset format, hook behavior), stop, say so, and propose the smallest change to the plan
- Commit at the end of each phase with a message like `Phase 3: drag, resize, click-through`

## Where things are

- Config and positions: `~/Library/Application Support/claude-cat/config.json`
- Debug event log: same folder, `events.log`
- Source art: `assets/source/` (user's originals, do not modify). Processed art: `assets/processed/` (generated)
