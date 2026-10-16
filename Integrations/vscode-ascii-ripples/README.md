# ASCII Ripples for VS Code

Draws the ASCII Ripples live wallpaper behind every empty editor group, the
area with the VS Code logo and shortcut hints that shows when no file is open.
Click it to send a wave; the glyphs light up under the pointer. Open a file and
the wallpaper steps aside; close the last one and it is back.

*Русский:* живые обои ASCII Ripples за пустым редактором VS Code (когда не открыт
ни один файл). Клик пускает волну, под курсором — фонарик. Настройки: ⌘, → «ASCII Ripples».

## Install

1. Get `ascii-ripples-<version>.vsix` (Actions → *VS Code extension* → artifact, or
   `npx @vscode/vsce package` in this folder).
2. VS Code → Extensions → `…` → *Install from VSIX…* and pick the file
   (or `code --install-extension ascii-ripples-<version>.vsix`).
3. Click *Reload Window* in the notification.

To see the empty editor right at launch, set `"workbench.startupEditor": "none"`.

## How it works

The extension API cannot draw behind editors, so the extension adds one
`<script>` tag to VS Code's own workbench page and copies `ascii-ripples.js`
next to it (inside `Visual Studio Code.app`). It updates the page's checksum in
`product.json`, so VS Code does not report a corrupt installation. A VS Code
update replaces the page; the extension notices at the next start and asks for
one more reload.

*ASCII Ripples: Disable and Restore VS Code* (or uninstalling the extension)
removes the tag and the script and restores the original checksum.

If VS Code lives where your user cannot write, the extension shows the
`sudo chown` command that fixes it.

## Settings

| Setting | Default | |
|---|---|---|
| `asciiRipples.enabled` | `true` | Off restores the original VS Code files |
| `asciiRipples.theme` | `time` | `time` (follows the sun like the desktop wallpaper), `vscode` (current color theme), `auto` (macOS appearance), `dark`, `light` |
| `asciiRipples.latitude`, `asciiRipples.longitude` | empty | Location for `time` |
| `asciiRipples.opacity` | `1` | Layer opacity |
| `asciiRipples.fps` | `30` | Frame-rate limit (0 = display rate) |
| `asciiRipples.cellSize`, `asciiRipples.chars` | `13`, a–z A–Z 0–9 | Glyphs |
| `asciiRipples.waves`, `asciiRipples.flashlight`, `asciiRipples.heartChance` | `true`, `true`, `15` | Interaction |
| `asciiRipples.showWatermark` | `true` | Keep the VS Code logo over the wallpaper |
| `asciiRipples.colors` | `{}` | `{ "dark": { "bg", "text", "wave" }, "light": { … } }` as `#rrggbb` |
| `asciiRipples.trackpad.touch` | `true` | A finger landing on the trackpad sends a wave where the pointer is (macOS) |
| `asciiRipples.trackpad.clickArea` | `anywhere` | Where on the trackpad a click must land: `anywhere`, `anyEdge`, `leftEdge`, `rightEdge`, `topEdge`, `bottomEdge`, `never` |
| `asciiRipples.trackpad.secondaryClick` | `false` | A two-finger click also sends a wave |
| `asciiRipples.advanced` | `{}` | Any wallpaper value by name: `blobSize`, `coverage`, `edge`, `morph`, `driftX`, `driftY`, `idle`, `flicker`, `waveSpeed`, `waveReach`, `swellWidth`, `ringGap`, `ring2`, `wobble`, `jitter`, `waveLife`, `blueFade`, `glowFade`, `waveBrightness`, `hoverRadius`, `hoverBrightness` (fractions as 0–1, like the wallpaper's `CFG`) |

Changing a setting rewrites the script and asks to reload the window.

## Trackpad

The VS Code window only receives clicks. For touches and edge clicks the
extension runs a small native helper (`bin/trackpad-helper`, from
`helper/trackpad-helper.swift`) that reads the fingers on the trackpad, the same
way the WallpaperMachine app does, and relays them to every VS Code window over
`ws://127.0.0.1:47913` (`asciiRipples.trackpad.port`). It runs only while a
trackpad setting needs it and needs no permission.

## Development

`npm test` runs the patcher and relay tests (plain Node, no dependencies). The
helper builds on macOS: `swiftc -O -swift-version 5 helper/trackpad-helper.swift -o bin/trackpad-helper`.
