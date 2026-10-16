"use strict";
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");
const patcher = require("./patcher");
const { TouchRelay, helperPath } = require("./touch");

// Remembered so the uninstall hook (which runs without the `vscode` API) knows
// which installations to restore.
const STATE_FILE = path.join(os.homedir(), ".ascii-ripples-vscode.json");

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return { appRoots: [] }; }
}
function remember(appRoot, patched) {
  const state = readState();
  const roots = new Set(state.appRoots || []);
  patched ? roots.add(appRoot) : roots.delete(appRoot);
  try { fs.writeFileSync(STATE_FILE, JSON.stringify({ appRoots: [...roots] }, null, 2)); } catch { /* best effort */ }
}

function options() {
  const c = vscode.workspace.getConfiguration("asciiRipples");
  const cfg = Object.assign({}, c.get("advanced") || {});
  cfg.cellSize = c.get("cellSize");
  cfg.chars = c.get("chars");
  cfg.click = c.get("waves");
  cfg.hover = c.get("flashlight");
  cfg.heartChance = c.get("heartChance") / 100;
  return {
    theme: c.get("theme"),
    latitude: c.get("latitude"),
    longitude: c.get("longitude"),
    colors: c.get("colors") || {},
    opacity: c.get("opacity"),
    fps: c.get("fps"),
    showWatermark: c.get("showWatermark"),
    trackpad: trackpadOptions(),
    cfg,
  };
}

function trackpadOptions() {
  const c = vscode.workspace.getConfiguration("asciiRipples.trackpad");
  return {
    touch: c.get("touch"),
    clickArea: c.get("clickArea"),
    secondaryClick: c.get("secondaryClick"),
    port: c.get("port"),
  };
}

// The relay runs only while a trigger needs the fingers, and only on macOS,
// where the helper exists.
let relay = null;
function syncRelay(context) {
  const t = trackpadOptions();
  const enabled = vscode.workspace.getConfiguration("asciiRipples").get("enabled");
  const wanted = enabled && process.platform === "darwin" && (t.touch || t.clickArea !== "anywhere");
  if (relay && (!wanted || relay.port !== t.port)) { relay.stop(); relay = null; }
  if (wanted && !relay) {
    relay = new TouchRelay({ port: t.port, helperPath: helperPath(context.extensionPath), log: m => console.log("[ascii-ripples]", m) });
    relay.start();
  }
}

async function sync(context, { announce }) {
  const appRoot = vscode.env.appRoot;
  const enabled = vscode.workspace.getConfiguration("asciiRipples").get("enabled");
  let changed;
  try {
    if (enabled) {
      const template = fs.readFileSync(path.join(context.extensionPath, "media", "ascii-ripples.js"), "utf8");
      changed = patcher.apply(appRoot, patcher.buildScript(template, options()));
    } else {
      changed = patcher.remove(appRoot);
    }
    remember(appRoot, enabled);
  } catch (err) {
    return reportError(err, appRoot);
  }
  if (!changed && !announce) return;
  const reload = vscode.l10n.t("Reload Window");
  const message = !changed
    ? vscode.l10n.t("ASCII Ripples is already up to date.")
    : enabled
      ? vscode.l10n.t("ASCII Ripples is installed. Reload the window to see it behind empty editors.")
      : vscode.l10n.t("ASCII Ripples is removed. Reload the window to finish.");
  const pick = await vscode.window.showInformationMessage(message, ...(changed ? [reload] : []));
  if (pick === reload) vscode.commands.executeCommand("workbench.action.reloadWindow");
}

async function reportError(err, appRoot) {
  console.error("[ascii-ripples]", err);
  if (err && (err.code === "EACCES" || err.code === "EPERM" || err.code === "EROFS")) {
    const bundle = patcher.bundleOf(appRoot);
    const command = `sudo chown -R "$(whoami)" "${bundle}"`;
    const copy = vscode.l10n.t("Copy Command");
    const pick = await vscode.window.showErrorMessage(
      vscode.l10n.t("ASCII Ripples cannot write into {0}. Give your user ownership of VS Code (run in Terminal: {1}), then run \"ASCII Ripples: Reinstall\".", bundle, command),
      copy);
    if (pick === copy) vscode.env.clipboard.writeText(command);
    return;
  }
  vscode.window.showErrorMessage(vscode.l10n.t("ASCII Ripples failed: {0}", String(err && err.message || err)));
}

function activate(context) {
  const setEnabled = value => vscode.workspace.getConfiguration("asciiRipples")
    .update("enabled", value, vscode.ConfigurationTarget.Global);
  context.subscriptions.push(
    vscode.commands.registerCommand("asciiRipples.enable", async () => {
      await setEnabled(true);
      await sync(context, { announce: true });
    }),
    vscode.commands.registerCommand("asciiRipples.disable", async () => {
      await setEnabled(false);
      await sync(context, { announce: true });
    }),
    vscode.commands.registerCommand("asciiRipples.reinstall", () => sync(context, { announce: true })),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration("asciiRipples")) return;
      syncRelay(context);
      sync(context, { announce: false });
    }),
    { dispose: () => { if (relay) relay.stop(); relay = null; } },
  );
  syncRelay(context);
  // Also after a VS Code update, which replaces the patched page.
  sync(context, { announce: false });
}

function deactivate() {}

module.exports = { activate, deactivate };
