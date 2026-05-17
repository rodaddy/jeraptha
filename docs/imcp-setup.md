# iMCP -- Native macOS Automation via MCP

Native Swift app providing 93 tools across 17 Apple services via MCP (Model Context Protocol). Sub-millisecond performance. Used by all OC instances for macOS automation.

## What It Is

iMCP is a forked/extended version of [mattt/iMCP](https://github.com/mattt/iMCP). It runs as a menubar app, exposes tools over Bonjour/TCP, and is accessed via `mcp2cli imcp <tool>`. No Python, no Node -- pure Swift using native Apple frameworks.

**Repo:** [<your-username>/iMCP](https://github.com/<your-username>/iMCP) at `/Volumes/ThunderBolt/Development/mcp/servers/iMCP`

## Services & Tool Count (93 tools)

| Service | Tools | What It Does |
|---------|-------|-------------|
| Mail | 10 | Full email lifecycle -- search, read, send, reply, forward, delete, move, flag, mark read. Multi-account, attachments, HTML body. |
| Calendar | 5 | CRUD events with recurrence, alarms, multi-calendar. EventKit native. |
| Notes | 10 | CRUD notes + file attachments (iCloud-syncing) + move to shared folders. Cross-device transfer via shared Notes folders. |
| Contacts | 6 | Search, create, update, delete contacts + groups. Native Contacts framework. |
| Messages | 3 | List chats, fetch messages (SQLite), send via AppleScript. |
| Reminders | 9 | Full CRUD + list management. EventKit native. |
| Maps | 5 | Search places, directions, ETA, explore POIs, generate static maps. MapKit. |
| Files | 5 | List, read, write, search, info. FileManager + UTType. No sandbox. |
| Desktop | 11 | Window management, app launch/quit, clipboard, **UI element inspection/clicking/typing/reading** via System Events. |
| Music | 3 | Now playing, playback control, catalog search. MusicKit + AppleScript. |
| Weather | 4 | Current, daily, hourly, minute-by-minute. WeatherKit (needs coordinates, not city names). |
| Capture | 4 | Screenshot + screen recording (MP4). ScreenCaptureKit. Camera/mic blocked. |
| Shortcuts | 4 | List, run, details, delete macOS Shortcuts. |
| AppleScript | 2 | Execute arbitrary AppleScript, list running apps. |
| Chrome | 5 | Tabs, navigate, activate, new window, execute JavaScript. |
| Location | 3 | Current location, geocode, reverse geocode. CoreLocation. |
| Utilities | 2 | System notifications, beep. |

## Installation on a New Machine

### 1. Copy the App

```bash
# From the build machine or a shared location
cp -R /path/to/iMCP.app /Applications/iMCP.app
```

The app is code-signed with a personal dev identity (`<APPLE_TEAM_ID>`). On first launch on a different account, right-click > Open to bypass Gatekeeper.

### 2. Launch & Enable Services

1. Open iMCP -- it appears in the menubar
2. Click the menubar icon
3. Toggle on each service you want
4. Grant permission popups as they appear

### 3. Grant TCC Permissions

These need one-time grants in **System Settings > Privacy & Security**:

| Permission | Required For | How |
|------------|-------------|-----|
| Accessibility | `desktop_ui_*`, `desktop_windows_list`, `desktop_window_move` | Add iMCP.app to Accessibility list |
| Screen Recording | `capture_take_screenshot`, `capture_record_screen` | Add iMCP.app to Screen Recording list |
| Automation (per-app) | Mail, Notes, Finder, Chrome, System Events, Music, Messages | Auto-prompted on first use |
| Contacts | `contacts_*` | Auto-prompted on first use |
| Calendars | `calendars_*`, `events_*` | Auto-prompted on first use |
| Reminders | `reminders_*` | Auto-prompted on first use |
| Location | `location_*` | Auto-prompted on first use |

**Important:** If the app binary changes (rebuild), you must remove and re-add iMCP in Accessibility and Screen Recording. Using stable code signing minimizes this.

### 4. Register with mcp2cli

Add to `~/.config/mcp2cli/services.json`:

```json
"imcp": {
  "description": "iMCP -- native Swift Apple services (Calendar, Contacts, Mail, Messages, Reminders, Notes, Maps, Files, Desktop/UI, Music, Weather, Capture, Shortcuts, AppleScript, Chrome)",
  "backend": "stdio",
  "command": "/Applications/iMCP.app/Contents/MacOS/imcp-server",
  "args": [],
  "env": {},
  "blockTools": ["capture_take_picture", "capture_record_audio"]
}
```

### 5. Generate/Copy Skills

```bash
# Option A: Generate fresh from live server (iMCP must be running)
mcp2cli generate-skills imcp

# Option B: Copy from another machine
scp -r user@source:~/.config/mcp2cli/skills/imcp/ ~/.config/mcp2cli/skills/imcp/
scp user@source:~/.config/pai/Skills/apple/SKILL.md ~/.config/pai/Skills/apple/SKILL.md
```

### 6. Verify

```bash
mcp2cli imcp --help                    # should show 84+ tools
mcp2cli imcp calendars_list            # quick smoke test
mcp2cli imcp desktop_ui_elements --params '{"app": "Finder"}'  # tests Accessibility
mcp2cli imcp capture_take_screenshot --params '{"quality": "low"}'  # tests Screen Recording
```

## Building from Source

```bash
cd /Volumes/ThunderBolt/Development/mcp/servers/iMCP

# Dev signed, no sandbox (required for Accessibility/UI scripting)
xcodebuild -project iMCP.xcodeproj -scheme iMCP -configuration Release build \
  CODE_SIGN_IDENTITY="Apple Development: user@example.com (<APPLE_TEAM_ID>)" \
  CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM="<APPLE_TEAM_ID>" \
  PROVISIONING_PROFILE_SPECIFIER="" ENABLE_APP_SANDBOX=NO
```

Binary lands in `~/Library/Developer/Xcode/DerivedData/iMCP-*/Build/Products/Release/iMCP.app`.

**Requirements:** Xcode 26.4+, Swift 6.3, macOS 26.4 (Tahoe).

## Cross-Device File Transfer (Mac to iPad)

No AirDrop automation possible. Instead, use Notes shared folders:

1. Create a shared Notes folder once (manually in Notes.app, share with your Apple ID)
2. `mcp2cli imcp notes_create --params '{"title": "File Drop", "folder": "Shared Folder"}'`
3. `mcp2cli imcp notes_attach --params '{"name": "File Drop", "filePath": "/path/to/file.pdf"}'`
4. File syncs via iCloud, iPad gets notification on shared note update
5. Optionally: `mcp2cli imcp reminders_create --params '{"title": "File ready", "dueDate": "now"}'` for an extra nudge

## Dock Shortcut Apps

Two helper apps in `~/Applications/`:

| App | Icon | What It Does |
|-----|------|-------------|
| Restart iMCP | Cyan lightning bolt refresh arrow | Quits and relaunches iMCP.app |
| Dia Optimized | Purple sparkly D | Launches Dia with `--purge-memory-button --renderer-process-limit=4` |

Build scripts and icons are in the iMCP repo at `Scripts/shortcuts/`.

## Known Issues

- **Bonjour relay fragile** under rapid mcp2cli calls -- SDK `CheckedContinuation` double-resume bug. Patched locally in DerivedData but not upstream. App crashes occasionally.
- **Screen recording** returns video as base64 over JSON-RPC -- mcp2cli 30s timeout too short. Keep durations under 5s.
- **Mail search without scope is slow** -- always pass `account` and/or `mailbox` params.
- **Weather needs coordinates** -- use `maps_search` to geocode city names first.
- **Sandbox must be disabled** for UI scripting (Accessibility) to work from within the app.
- **TCC grants invalidated on binary replacement** if signing identity changes. Stable signing (consistent team ID) minimizes this.

## Key Corrections (for AI agents)

- `mail_send` supports comma-separated To/CC/BCC, `attachments` array, `isHTML` flag, `from` for account selection
- `mail_reply`/`mail_forward` use Mail.app's native commands (preserves threading)
- `notes_attach` embeds files as true iCloud-syncing attachments (not HTML references)
- `notes_move` moves to pre-existing folders -- useful for shared folder cross-device workflow
- `desktop_ui_click` element param uses AppleScript UI element references (e.g. `button "Done" of window 1`)
- `desktop_ui_type` types into whatever has focus -- use `desktop_window_focus` first
- `events_create` uses flat params (`title`, `start`, `end`, `calendar`), not nested objects
- `maps_eta`/`maps_directions` need `originAddress`/`destinationAddress`, not `from`/`to`
- Calendar/Reminder identifiers are in `@id` field -- use this for update/delete
- Notes `body` in create/update is HTML (Notes.app uses rich text internally)
- iMCP.app must be running in menubar for imcp-server CLI to work
