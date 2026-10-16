// `vscode:uninstall` hook: VS Code runs it with plain Node after the extension
// is removed, so the installations it patched get their original page back.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const patcher = require("./patcher");

const STATE_FILE = path.join(os.homedir(), ".ascii-ripples-vscode.json");
let roots = [];
try { roots = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")).appRoots || []; } catch { /* nothing patched */ }
for (const appRoot of roots) {
  try { patcher.remove(appRoot); } catch (err) { console.error(`[ascii-ripples] ${appRoot}: ${err.message}`); }
}
try { fs.unlinkSync(STATE_FILE); } catch { /* already gone */ }
