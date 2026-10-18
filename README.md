# Claude Cat

A little cat that lives on your macOS desktop and shows what Claude Code is doing. There is one cat per Claude Code session. It animates while Claude is working and sits still when Claude is done or needs you. Hover over a cat to see what Claude is up to.

It works through Claude Code hooks: each hook sends a small JSON message to the app on `127.0.0.1`. The app has no Dock icon and lives in the menu bar.

## Requirements

- macOS (Apple Silicon or Intel)
- [Node.js](https://nodejs.org) 20 or later
- Xcode Command Line Tools, for `git`, `sips`, `iconutil` and `codesign`. Install them with `xcode-select --install`.
- Claude Code

## Install

```sh
git clone https://github.com/waterprisem/claude-cat.git
cd claude-cat
npm install
npm run dist
```

This builds `dist/Claude Cat-darwin-arm64/Claude Cat.app` (the folder ends in `-x64` on Intel Macs). Drag `Claude Cat.app` into your Applications folder and open it. A cat icon appears in the menu bar.

## Hook setup

1. Click the cat in the menu bar, then **Install hooks**.
   - This adds one entry per hook event to `~/.claude/settings.json`. Each entry is marked `# claude-cat`, and your other settings and hooks are left alone.
   - Before changing anything, it saves a copy next to the file, named `settings.json.claude-cat-backup-<time>`.
   - Each hook just runs `curl` to send the event to the app. If the app isn't running, the hook gives up quietly within a second and Claude Code carries on as normal.
2. **Restart any open Claude Code sessions.** Claude Code only reads hooks when a session starts, so sessions that were already open won't show a cat until you restart them.

To undo, use **Remove hooks** in the same menu. It also makes a backup first, and it removes only the `# claude-cat` entries.

## Using it

- **States:**
  - The cat animates while Claude is working.
  - It idles (with a "..." in the art) when Claude is done, or when Claude needs your permission or attention. The bubble tells you which.
- **Speech bubble:** hover over the cat to see the latest step or reply. If the text is cut short, click the bubble to see up to 10 lines. Click again, or move away, to shrink it.
- **Name tag:** the tag at the cat's bottom-left shows the project (the session's folder name).
- **Go to the session:** click the cat to bring its Claude Code session's terminal to the front.
  - In Terminal and iTerm2 it switches to the exact window and tab. The first time, macOS asks whether Claude Cat may control that app. Click OK. If you decline, or later turn it off in System Settings → Privacy & Security → Automation, a click just brings the app forward.
  - In other terminals (and editors like VS Code), a click brings the app forward.
  - Sessions running inside `tmux` can't be traced back to a terminal, so nothing happens.
  - After rebuilding the app, macOS may ask again, because each build is signed differently.
- **Move:** drag the cat. Each project remembers where its cat goes.
- **Resize:** hover over the cat and drag the grip in its bottom-right corner. All cats share one size.
- **Projects menu:** a checkbox for each project with an open session hides or shows that project's cats. "Auto-show new projects" decides whether new projects get a cat straight away.
- **Launch at login:** turn this on in the menu to start the cat when you log in.
- **Clicks go through:** clicks on the empty space around a cat reach whatever is behind it.

If a Claude Code session is already open when the app starts, its cat comes back straight away.

## Settings

Settings and cat positions are stored in `~/Library/Application Support/claude-cat/config.json`. You can add any of these keys to override the default:

| Key | Default | Meaning |
|---|---|---|
| `port` | `47821` | Local port the app listens on. After changing it, use Remove hooks, then Install hooks. |
| `interruptTimeoutMs` | `120000` | How long a working cat can go without hearing from Claude before it shows "Stopped?" |
| `staleSessionMs` | `21600000` | How long a session can go without any events before its cat is removed |
| `debugLog` | `false` | Write every hook event to `events.log` in the same folder. This includes your prompts and Claude's replies. |
| `codingFps`, `blinkFps` | `6`, `14` | Animation speeds |

Quit and reopen the app after editing the file.

## Privacy

- The app listens only on `127.0.0.1` and makes no network requests.
- It reads only:
  - the hook events Claude Code sends it
  - the session transcript, to fetch the last reply and notice when you press Esc
  - `~/.claude/sessions/` at startup, to find sessions that are already open, and when you click a cat, to find its process
  - the list of running processes (`ps`) when you click a cat, to find which terminal the session is in
- Nothing is written anywhere except `config.json` (and `events.log` if you turn on `debugLog`).

## Uninstall

1. Menu bar cat → **Remove hooks**
2. Menu bar cat → **Quit**
3. Delete `Claude Cat.app` and the folder `~/Library/Application Support/claude-cat/`.

## Development

```sh
npm install
npm run assets   # make the 512px frames and icons from assets/source/ (needed once)
npm start        # run from source; adds a Debug menu with fake sessions
npm test
npm run dist     # build the .app
```

Only one copy of the app runs at a time. Quit the built app before running `npm start`, and the other way round.

`PLAN.md` has the design, the state machine and the hook payloads it was built against.
