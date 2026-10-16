"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const patcher = require("../patcher");

const REL = "vs/code/electron-browser/workbench/workbench.html";
const PAGE = `<!DOCTYPE html>
<html>
\t<head></head>
\t<body aria-label=""></body>
\t<script src="./workbench.js" type="module"></script>
</html>
`;

function fakeInstall() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ascii-ripples-"));
  const page = path.join(root, "out", REL);
  fs.mkdirSync(path.dirname(page), { recursive: true });
  fs.writeFileSync(page, PAGE);
  const product = `{\n\t"nameShort": "Code",\n\t"checksums": {\n\t\t"vs/base/x.js": "abc",\n\t\t"${REL}": "${patcher.checksum(Buffer.from(PAGE))}"\n\t}\n}\n`;
  fs.writeFileSync(path.join(root, "product.json"), product);
  return { root, page, product };
}
const sumIn = root => JSON.parse(fs.readFileSync(path.join(root, "product.json"), "utf8")).checksums[REL];

test("apply loads the layer, keeps checksums valid and is idempotent", () => {
  const { root, page } = fakeInstall();
  const script = patcher.buildScript("const OPTIONS = /*@@OPTIONS@@*/{}/*@@END@@*/;", { theme: "dark" });
  assert.strictEqual(patcher.apply(root, script), true);
  const html = fs.readFileSync(page, "utf8");
  assert.ok(html.indexOf(patcher.TAG) > html.indexOf("workbench.js"));
  assert.strictEqual(sumIn(root), patcher.checksum(fs.readFileSync(page)));
  assert.match(fs.readFileSync(path.join(path.dirname(page), patcher.SCRIPT_NAME), "utf8"), /"theme":"dark"/);
  assert.strictEqual(patcher.apply(root, script), false);
  assert.strictEqual(html.split(patcher.TAG).length, 2);
  assert.ok(patcher.isApplied(root));
});

test("new settings rewrite only the script", () => {
  const { root, page } = fakeInstall();
  const tpl = "const OPTIONS = /*@@OPTIONS@@*/{}/*@@END@@*/;";
  patcher.apply(root, patcher.buildScript(tpl, { fps: 30 }));
  const html = fs.readFileSync(page, "utf8");
  assert.strictEqual(patcher.apply(root, patcher.buildScript(tpl, { fps: 60 })), true);
  assert.strictEqual(fs.readFileSync(page, "utf8"), html);
});

test("remove restores the original page, checksum and product.json", () => {
  const { root, page, product } = fakeInstall();
  patcher.apply(root, "x");
  assert.strictEqual(patcher.remove(root), true);
  assert.strictEqual(fs.readFileSync(page, "utf8"), PAGE);
  assert.strictEqual(fs.readFileSync(path.join(root, "product.json"), "utf8"), product);
  assert.ok(!fs.existsSync(path.join(path.dirname(page), patcher.SCRIPT_NAME)));
  assert.strictEqual(patcher.remove(root), false);
});

test("older layout and missing installs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ascii-ripples-"));
  assert.throws(() => patcher.findWorkbench(root), { code: "ENOWORKBENCH" });
  const old = path.join(root, "out/vs/code/electron-sandbox/workbench/workbench.html");
  fs.mkdirSync(path.dirname(old), { recursive: true });
  fs.writeFileSync(old, PAGE);
  assert.strictEqual(patcher.apply(root, "x"), true);   // no product.json: still works
  assert.ok(fs.readFileSync(old, "utf8").includes(patcher.TAG));
});

test("options cannot break out of the script", () => {
  const s = patcher.buildScript("a=/*@@OPTIONS@@*/{}/*@@END@@*/;", { chars: "</script><b>" });
  assert.ok(!s.includes("</script>"));
  assert.strictEqual(new Function(`let ${s} return a;`)().chars, "</script><b>");
});

test("bundleOf finds the .app", () => {
  assert.strictEqual(patcher.bundleOf("/Applications/Visual Studio Code.app/Contents/Resources/app"),
    "/Applications/Visual Studio Code.app");
});
