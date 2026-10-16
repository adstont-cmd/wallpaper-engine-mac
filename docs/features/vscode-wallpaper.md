# ASCII Ripples in VS Code

`Integrations/vscode-ascii-ripples/` is a VS Code extension that shows the ASCII
Ripples web wallpaper behind empty editor groups (the area with the VS Code
logo and shortcut hints when no file is open). It is independent of the app: it
runs its own copy of the wallpaper inside VS Code and does not need
WallpaperMachine to be running.

## What the user sees

- Every empty editor group shows the animated field; clicking it sends a wave
  and the pointer lights up glyphs nearby. VS Code still receives every click
  (double-click opens a new file). The logo and shortcut hints stay on top;
  `asciiRipples.showWatermark: false` hides the logo.
- Opening an editor in a group removes that group's layer at once; closing the
  last editor brings it back. Inactive empty groups are dimmed by VS Code as usual.
- Themes: `time` (sun position, as on the desktop), `vscode` (follows the
  current color theme live), `auto`, `dark`, `light`.
- Settings changes and first installation ask for a window reload.

## How it works

- `patcher.js` adds `<script src="./ascii-ripples.js">` to
  `out/vs/code/electron-browser/workbench/workbench.html` (or the older
  `electron-sandbox` path) under `vscode.env.appRoot`, writes the script beside
  it with the settings baked in, and rewrites that page's checksum in
  `product.json` (sha256, base64 without padding, as VS Code's integrity check
  computes it). The workbench CSP allows `'self'` scripts; the script uses no
  Trusted Types sinks.
- `media/ascii-ripples.js` is the wallpaper's renderer turned into one layer per
  host element: a canvas at `z-index: -1` in an isolated stacking context inside
  `.editor-group-container.empty`, pointer events off, input read from the
  group. A 700 ms scan (skipped while the window is hidden) finds new empty
  groups; a class observer per group removes the layer when an editor opens.
  Frames are capped at `asciiRipples.fps` (30 by default) and stop while the
  window is hidden.
- Disabling, or the `vscode:uninstall` hook (`uninstall.js`, which reads the
  patched installations from `~/.ascii-ripples-vscode.json`), removes the tag and
  the script; the page and checksum return to their original bytes.
- A VS Code update replaces the page; activation (`onStartupFinished`) re-applies
  it and asks for a reload. `extensionKind: ui` keeps it on the local machine in
  remote windows.

## Limits

- It modifies files inside `Visual Studio Code.app`. If the user cannot write
  there, an error shows the `sudo chown` command to fix it.
- The Welcome page is an editor, not an empty group; with
  `"workbench.startupEditor": "none"` VS Code starts on the empty group.

## Build and test

`npm test` in the folder runs the patcher tests. The *VS Code extension*
workflow (`.github/workflows/vscode-extension.yml`) runs them and packages
`ascii-ripples-<version>.vsix` as an artifact. On `main`, a `package.json` version
that has no release yet becomes a GitHub release tagged `ascii-ripples-<version>`
(never `v*`, which cuts an app release). To release again, raise the version.
