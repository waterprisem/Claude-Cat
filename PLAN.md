# Claude Cat: Project Plan

A small macOS desktop pet that shows what Claude Code is doing. One cat per Claude Code session. The cat animates while Claude is coding, idles when Claude is done or needs the user, and shows a speech bubble on hover.

Work through the phases in order, one phase per session. Tick the checkboxes as you go and commit at the end of each phase.

---

## 1. Product spec (decided)

**Platform:** macOS only. Electron, plain JavaScript, minimal dependencies.

**Signal source:** Claude Code hooks. They are shell commands that Claude Code runs on lifecycle events and that receive a JSON payload on stdin (session id, working directory, transcript path, event name, plus event-specific fields). Hooks live in `~/.claude/settings.json`, so they apply to the CLI, the desktop app and IDE integrations alike. No screen scraping.

**States (two animations, three meanings):**

| State | Animation | Bubble when NOT hovered | Bubble when hovered |
|---|---|---|---|
| `coding` | coding loop (3 frames) | none | what Claude is doing right now, e.g. "Editing App.tsx" |
| `waiting` (needs the user) | idle (art has "..." drawn in) | none | the notification message, e.g. "Claude needs your permission to use Bash" |
| `done` (finished) | idle (same as waiting) | none | head of Claude's last message (first ~2 lines, truncated cleanly) |

`done` and `waiting` look identical: the idle art already has "..." drawn in it, so there is no separate "..." bubble (decided in Phase 4). Only the hover text differs.

**One cat per session.** A cat appears when a session's first event arrives and disappears on `SessionEnd`. The project name (basename of `cwd`) is shown as a small tag at the cat's bottom-left. "Choosing the project" means a tray menu where each known project can be enabled, muted or pinned, so the user can decide which sessions get a cat.

**Interaction:**
- Drag the cat anywhere. Position is remembered per project.
- On hover, a small resize grip appears in the cat's bottom-right corner; dragging it resizes the cat with its top-left fixed. (Phase 3 used `+`/`-` buttons; replaced in Phase 4 because they covered the bubble.) Default 128px, range 64 to 256px, step 16px. Size is remembered (global, not per cat).
- Transparent areas of the window must be click-through. Only the cat itself, the bubble and the hover buttons capture the mouse.
- Always on top, visible on all Spaces and over fullscreen apps, no Dock icon, tray icon only.
- Should not be disruptive: no focus stealing, no sounds, no notifications, no bouncing.

**Assets (provided by the user):**
- Source frames are 1080x1080 PNG.
- Coding: 3 frames, looped.
- Idle: 8 frames. Frame 1 is the normal resting pose. Frames 2 to 8 are a blink sequence.
- Assumptions to verify in Phase 0: PNGs have a transparent background; frame order is by filename (natural sort); frame 8 ends close to the open-eyes pose. Report if any of these is false.
- Downscale at build time to 512px (2x retina for the 256px max size). Never ship 1080px frames to the renderer.

**Animation timing (configurable constants):**
- Coding: loop the 3 frames at about 6 fps.
- Idle: hold frame 1 for a random 3 to 7 seconds, play frames 2 to 8 once at about 14 fps, return to frame 1.

---

## 2. Architecture

```
Claude Code (CLI/desktop/IDE)
   |  hook event (JSON on stdin)
   v
curl one-liner  --POST-->  http://127.0.0.1:47821/event   (Electron main process)
                                   |
                              SessionStore (state machine, one record per session_id)
                                   |  IPC
                                   v
                       one BrowserWindow per session (transparent, frameless, always on top)
                                   |
                       renderer: sprite animation + bubble + hover controls
```

Suggested layout (adjust if there is a good reason):

```
claude-cat/
  CLAUDE.md
  PLAN.md
  package.json
  assets/source/coding/*.png      # user's originals
  assets/source/idle/*.png
  assets/processed/               # generated, git-ignored
  scripts/process-assets.js
  src/main/index.js               # app lifecycle, tray, dock hide
  src/main/server.js              # localhost HTTP receiver
  src/main/sessions.js            # state machine + timers
  src/main/transcript.js          # last-assistant-message extraction
  src/main/toolSummary.js         # tool name + input -> human text
  src/main/windows.js             # create/position/persist cat windows
  src/main/config.js              # config.json read/write
  src/main/hooksInstaller.js      # install/remove hooks in ~/.claude/settings.json
  src/preload/preload.js
  src/renderer/{cat.html,cat.js,cat.css}
```

Config and positions live in `~/Library/Application Support/claude-cat/config.json`. Raw event logs (debug only) go in the same folder.

### Hook command

All hook entries use the same command. It must never block, print, or fail Claude Code:

```sh
curl -s -m 1 --connect-timeout 0.3 -X POST -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:47821/event >/dev/null 2>&1 || true # claude-cat
```

The trailing `# claude-cat` comment is the marker the installer uses to find and remove its own entries. If the app is not running, curl fails fast and Claude Code is unaffected.

Events to register: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Notification`, `Stop`, `StopFailure`, `SubagentStop`, `SessionEnd`. Each entry has `"timeout": 5` and no matcher. The hook stays a synchronous `command` (an `http` hook treats an empty 200 as an error, and async hooks could deliver `Stop` before the last `PostToolUse`).

**Important:** Verify the exact event names and payload fields against the current Claude Code hooks documentation and against real logged payloads in Phase 1. Do not trust this document over what Claude Code actually sends.

### State machine

| Event | Result |
|---|---|
| `SessionStart` | create session, state `done`, text "..." (idle, no message yet) |
| `UserPromptSubmit` | `coding`, action "Thinking..." |
| `PreToolUse` | `coding`, action from `toolSummary(tool_name, tool_input)` |
| `PostToolUse`, `PostToolUseFailure` | `coding` (this is also how it recovers after a permission prompt is approved) |
| `PermissionRequest` | `waiting`, "Claude needs your permission to use <tool>" |
| `Notification` | `waiting`, hover text = notification message. Ignored when `idle_prompt` arrives in `done`, or `permission_prompt` arrives already `waiting` (its message is generic) |
| `Stop` | `done`, hover text = head of `last_assistant_message` (transcript only as a fallback) |
| `StopFailure` | `waiting`, "Stopped (<error type>)" |
| `SubagentStop` | no state change (main agent is still working) |
| `SessionEnd` | remove session and close its window |

Edge cases to handle:
- **Interrupt (Esc):** verified: Claude Code sends no hook event on Esc, but it appends a user entry whose text starts with `[Request interrupted by user` to the transcript. While a session is `coding`, poll its transcript every second (`interruptPollMs`), read only appended lines, and flip to `waiting` "Interrupted" when that entry appears. Backup: if a session is `coding` and no event arrives for 120s (configurable), flip it to `waiting` with text "Stopped?".
- **Killed terminal:** `SessionEnd` may never fire. Remove sessions that have had no events for 6 hours (configurable).
- **Transcript timing:** the transcript file may not be fully flushed when `Stop` fires. Read it with a short delay and one retry. Parse defensively (JSONL, skip bad lines, find the last assistant entry with text content). If anything fails, fall back to "Done".
- **Unknown session:** any event from an unseen `session_id` creates the session (the app may have started mid-session).
- **App restart:** at startup, read `~/.claude/sessions/<pid>.json` (one per open Claude Code session: `pid`, `sessionId`, `cwd`, `status` `busy`/`idle`). Keep those whose process is alive, and create their cats right away: `coding` "Working..." if busy, else `done` with the transcript's last assistant text. Validated like hook payloads; read once, never written.
- **Subagent/sidechain noise:** do not let subagent activity produce more than one cat per session.

### Tool summaries (`toolSummary.js`)

Short, human, max about 40 characters, never leaking long commands or file contents.

| Tool | Text |
|---|---|
| Edit / Write / MultiEdit | "Editing `<basename>`" |
| Read | "Reading `<basename>`" |
| Bash | "Running `<first ~30 chars of command>`" |
| Grep / Glob | "Searching the code" |
| WebSearch / WebFetch | "Searching the web" |
| Task / Agent | "Delegating to a helper" |
| TodoWrite / plan tools | "Planning" |
| anything else (incl. MCP tools) | "Using `<tool name>`" |

### Bubble rules

- The bubble shows only on hover, in every state. The "..." drawn in the idle art stands in for the old "..." bubble.
- Empty text falls back to "Thinking..." (coding), "Claude needs your attention" (waiting) or "Ready for your next prompt" (done, before any reply).
- Hover text: max 2 lines, ellipsis on a word boundary. If the text was cut short, clicking the bubble expands it to up to 10 lines (the window grows for it while open); clicking again or moving the pointer away collapses it. Selecting or copying text is not needed.
- The project name is a small translucent tag at the cat's bottom-left, always shown, not part of the bubble.

---

## 3. Phases

### Phase 0: Scaffold and assets
- [x] `npm init`, Electron installed, `npm start` launches an app with a tray icon and no Dock icon
- [x] `.gitignore` (node_modules, assets/processed, logs)
- [x] `scripts/process-assets.js` resizes all source PNGs to 512px into `assets/processed/{coding,idle}/` and prints frame counts
- [x] Script reports whether PNGs have an alpha channel and warns if not

**Done when:** app starts and quits cleanly from the tray, and processed assets exist with the expected frame counts (3 and 8).

### Phase 1: Event pipeline (no UI)
- [x] HTTP server bound to `127.0.0.1` only, `POST /event`, always responds fast with 200 and an empty body
- [x] Every raw payload appended to a debug log file (off by default; `"debugLog": true` in config.json)
- [x] `sessions.js` implements the state machine above with injectable clock for timers
- [x] `transcript.js` and `toolSummary.js` with unit tests (use `node:test`, no extra deps)
- [x] Tray menu item "Install hooks" (can be crude for now) or a documented manual snippet for `~/.claude/settings.json`
- [x] Console prints every state transition: `[my-app] coding: Editing App.tsx`

**Done when:** the user runs a real Claude Code CLI session and the console shows correct `coding` -> `waiting`/`done` transitions with sensible text, including a permission prompt and an Esc interrupt. Update the "verified payload shapes" section at the bottom of this file with what Claude Code really sends.

### Phase 2: One cat, animated
- [x] Frameless, transparent, always-on-top window showing the cat sprite
- [x] Preload all frames; swap frames without flicker
- [x] Coding loop and idle-with-blink timing as specified
- [x] State pushed from main via IPC; temporary tray debug items "Simulate coding / waiting"
- [x] Hidden Dock icon, visible on all Spaces and over fullscreen apps, does not steal focus

**Done when:** simulated and real events switch the animation correctly and the window never takes keyboard focus.

_Verified 2026-10-16:_ the cat hides for about a second during the Space-switch and fullscreen animations, then returns. This is accepted as normal macOS behavior for all-Spaces windows. A higher window level (`status`/`screen-saver`) might avoid it, but wasn't tried. Phase 2 shows one window for the most recently changed session; it hides only when no sessions remain.

### Phase 3: Interaction
- [x] Drag to move (works from any opaque part of the cat)
- [x] Click-through on transparent pixels (`setIgnoreMouseEvents(true, { forward: true })` plus hit-testing in the renderer)
- [x] Hover reveals `+` / `-` buttons; size steps 64 to 256 in steps of 16; the window grows with the cat
- [x] Position (per project) and size persisted, restored on next launch, clamped to visible displays

**Done when:** the user can drag and resize the cat, clicking next to it hits the app underneath, and a restart preserves everything.

### Phase 4: Speech bubbles
- [x] Bubble rendered above the cat, flips below if too close to the top of the screen (see note below)
- [x] Rules from "Bubble rules" above (hover only; the "..." is in the art)
- [x] Smooth but subtle fade in and out (under 150 ms), no layout jumping when text changes

**Done when:** hovering during a real session shows live actions while coding, the right message when waiting, and the last-message head when done.

_Notes from Phase 4 testing (2026-10-16):_ the window includes an 84px bubble zone above the cat, and macOS keeps windows below the menu bar, so a dragged cat stops just under it with the bubble still above. The flip to below only happens for a cat placed higher by other means. A version that relaid the window during the drag broke dragging and was reverted; the user is fine with this. Esc detection by watching the transcript was added right after Phase 4.

### Phase 5: Multiple sessions and project control
- [x] One window per `session_id`, spawned at a saved or default position (stagger so they do not overlap)
- [x] Tray menu lists projects with open sessions, each with Show / Mute (a checkbox), and an "Auto-show new projects" toggle. Choices for closed projects are remembered but not listed
- [x] Muted projects get no window; unmuting recreates it
- [x] Stale and interrupt timeouts from the edge-case list implemented and configurable in config.json

**Done when:** two simultaneous sessions in two folders produce two independent cats, and muting one removes only that cat.

### Phase 6: Polish and packaging
- [x] Hooks installer: merge into `~/.claude/settings.json` without clobbering existing hooks, back up the file first, identify entries by the `# claude-cat` marker, and offer "Remove hooks"
- [x] Launch at login toggle (`app.setLoginItemSettings`)
- [x] Tray status line, "Quit"
- [x] `electron-builder` (or equivalent) produces a local `.app`
- [x] README with install, hook setup, and a note that Claude Code sessions must be restarted to pick up new hooks
- [x] Clicking a cat brings its session's terminal to the front: the exact tab in Terminal and iTerm2 (one macOS Automation prompt), the app itself for any other terminal (added 2026-10-18 at the user's request)

**Done when:** a fresh machine setup works from the README alone.

_Notes from Phase 6 (2026-10-18):_ packaged with `@electron/packager` instead of electron-builder (smaller; only a plain `.app` is needed), then ad-hoc signed. `LSUIElement` keeps the Dock icon from ever appearing. The Debug menu stays, but only when run from source. Install/Remove hooks verified by the user (backups made, 11 entries restored). Launch at login is implemented but not yet tested by the user across a real login.

---

## 4. Out of scope (for now)

Windows/Linux, sounds, notifications, themes, multiple cat skins, a cat that follows the mouse, reading anything other than hook events, transcripts, `~/.claude/sessions/` (at startup, and on a click to find the session's process) and the process list (`ps`, on a click), any network access beyond localhost.

## 5. Verified payload shapes

Verified on 2026-10-16 with Claude Code 2.1.287 against `events.log` from real sessions. Field names only; values are illustrative.

**Common to every event:** `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `scratchpad_dir`. Most events also send `prompt_id`, `permission_mode` (`default`, `auto`, …) and `effort: { level }`. Subagent events add `agent_id` and `agent_type` (can be `""`), with the parent's `session_id`.

| Event | Extra fields seen |
|---|---|
| `SessionStart` | `source` (`startup`), `model` |
| `UserPromptSubmit` | `prompt` |
| `PreToolUse` | `tool_name`, `tool_input` (Bash: `command`, `description`; Read: `file_path`, `offset`), `tool_use_id` |
| `PermissionRequest` | `tool_name`, `tool_input`, `permission_suggestions` |
| `PostToolUse` | `tool_name`, `tool_input`, `tool_response` (Bash: `stdout`, `stderr`, `interrupted`, …), `tool_use_id`, `duration_ms` |
| `PostToolUseFailure` | `tool_name`, `tool_input`, `tool_use_id`, `duration_ms`, `error` (e.g. "Exit code 1"), `is_interrupt` |
| `Notification` | `message`, `notification_type` (`permission_prompt`, `idle_prompt`) |
| `Stop` | `last_assistant_message`, `stop_hook_active`, `background_tasks`, `session_crons` |
| `SubagentStop` | as `Stop`, plus `agent_id`, `agent_type`, `agent_transcript_path` |
| `SessionEnd` | `reason` (`other` seen on `/exit`) |

Observed behavior:
- **Permission prompt:** `PreToolUse` → `PermissionRequest` (within ~40 ms) → `Notification` `permission_prompt` with the generic message "Claude needs your permission" (~6 s later) → `PostToolUse` after approval.
- **Finished turn:** `Stop` always carried `last_assistant_message`; the transcript fallback was never needed. `Notification` `idle_prompt` ("Claude is waiting for your input") follows ~60 s later.
- **Esc interrupt:** no hook event at all; the next event is the user's next `UserPromptSubmit`. The transcript does get a main-thread `type: "user"` entry with a text block `[Request interrupted by user]` (or `… for tool use]` when Esc hits during a tool). That entry is what the app watches for. Exception, verified 2026-10-17: Esc while Claude is still thinking (before any tool call or text) writes nothing to the transcript; Claude Code just restores the prompt to the input box. Only the 120 s timeout catches that case.
- **Already-open sessions** picked up newly installed hooks without a restart.
- `SubagentStop` can arrive after the main `Stop` (background helpers), and can be the first event seen for a session.
- Not yet seen: `StopFailure`, and `is_interrupt: true`.
