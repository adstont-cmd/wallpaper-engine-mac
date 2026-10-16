// Installs and removes the ASCII Ripples layer in a VS Code installation.
// Pure Node (no `vscode` import) so the uninstall hook and tests can use it.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SCRIPT_NAME = "ascii-ripples.js";
const TAG = `<!-- ascii-ripples --><script src="./${SCRIPT_NAME}"></script>`;
const TAG_LINE = /\n?[ \t]*<!-- ascii-ripples --><script src="\.\/ascii-ripples\.js"><\/script>/g;
// The workbench page moved between releases; newest first.
const WORKBENCH_PAGES = [
  "vs/code/electron-browser/workbench/workbench.html",
  "vs/code/electron-sandbox/workbench/workbench.html",
];
const PLACEHOLDER = /\/\*@@OPTIONS@@\*\/[\s\S]*?\/\*@@END@@\*\//;

// VS Code's own integrity check: sha256, base64 without padding.
const checksum = buf => crypto.createHash("sha256").update(buf).digest("base64").replace(/=+$/, "");

function findWorkbench(appRoot) {
  for (const rel of WORKBENCH_PAGES) {
    const file = path.join(appRoot, "out", rel);
    if (fs.existsSync(file)) return { file, rel, dir: path.dirname(file) };
  }
  const err = new Error(`VS Code workbench page not found under ${appRoot}`);
  err.code = "ENOWORKBENCH";
  throw err;
}

function buildScript(template, options) {
  // `</` cannot end a script here, but keep the JSON inert anyway.
  const json = JSON.stringify(options).replace(/</g, "\\u003c");
  return template.replace(PLACEHOLDER, `/*@@OPTIONS@@*/${json}/*@@END@@*/`);
}

function writeIfChanged(file, content) {
  try {
    if (fs.readFileSync(file, "utf8") === content) return false;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  fs.writeFileSync(file, content);
  return true;
}

// Keeps the "installation appears to be corrupt" warning away: VS Code compares
// the page with the checksum in product.json. Only that one value is rewritten.
function updateChecksum(appRoot, rel, html) {
  const productFile = path.join(appRoot, "product.json");
  let text;
  try { text = fs.readFileSync(productFile, "utf8"); } catch { return false; }
  const product = JSON.parse(text);
  if (!product.checksums || !(rel in product.checksums)) return false;
  const sum = checksum(Buffer.from(html, "utf8"));
  if (product.checksums[rel] === sum) return false;
  const key = JSON.stringify(rel).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const re = new RegExp(`(${key}\\s*:\\s*)"[^"]*"`);
  if (!re.test(text)) return false;
  fs.writeFileSync(productFile, text.replace(re, `$1"${sum}"`));
  return true;
}

function isApplied(appRoot) {
  const wb = findWorkbench(appRoot);
  return fs.readFileSync(wb.file, "utf8").includes(TAG);
}

// Returns true when anything on disk changed (the window needs a reload).
function apply(appRoot, script) {
  const wb = findWorkbench(appRoot);
  let changed = writeIfChanged(path.join(wb.dir, SCRIPT_NAME), script);
  const original = fs.readFileSync(wb.file, "utf8");
  let html = original.replace(TAG_LINE, "");
  html = html.includes("</html>") ? html.replace("</html>", `\t${TAG}\n</html>`) : `${html}\n${TAG}\n`;
  if (html !== original) { fs.writeFileSync(wb.file, html); changed = true; }
  updateChecksum(appRoot, wb.rel, html);
  return changed;
}

function remove(appRoot) {
  const wb = findWorkbench(appRoot);
  let changed = false;
  const original = fs.readFileSync(wb.file, "utf8");
  const html = original.replace(TAG_LINE, "");
  if (html !== original) { fs.writeFileSync(wb.file, html); changed = true; }
  updateChecksum(appRoot, wb.rel, html);
  try { fs.unlinkSync(path.join(wb.dir, SCRIPT_NAME)); changed = true; } catch (e) { if (e.code !== "ENOENT") throw e; }
  return changed;
}

// "/Applications/Visual Studio Code.app/Contents/Resources/app" -> the .app bundle.
function bundleOf(appRoot) {
  const m = /^(.*?\.app)(\/|$)/.exec(appRoot);
  return m ? m[1] : appRoot;
}

module.exports = { SCRIPT_NAME, TAG, checksum, findWorkbench, buildScript, apply, remove, isApplied, bundleOf };
