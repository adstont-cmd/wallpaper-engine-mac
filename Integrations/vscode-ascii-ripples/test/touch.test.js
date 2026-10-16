"use strict";
const test = require("node:test");
const assert = require("node:assert");
const net = require("net");
const path = require("path");
const { TouchRelay } = require("../touch");

const FAKE_HELPER = path.join(__dirname, "fixtures", "fake-helper.js");

function freePort() {
  return new Promise(resolve => {
    const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

// A raw WebSocket client: returns the decoded text frames received within `ms`.
function connect(port, origin, ms = 600) {
  return new Promise(resolve => {
    const socket = net.connect(port, "127.0.0.1");
    let buf = Buffer.alloc(0), upgraded = false, status = null;
    const frames = [];
    socket.on("connect", () => socket.write(
      `GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nOrigin: ${origin}\r\n\r\n`));
    socket.on("data", chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const end = buf.indexOf("\r\n\r\n");
        if (end < 0) return;
        status = buf.slice(0, end).toString().split(" ")[1];
        upgraded = status === "101";
        buf = buf.slice(end + 4);
      }
      while (buf.length >= 2 && buf.length >= 2 + buf[1]) {
        frames.push(buf.slice(2, 2 + buf[1]).toString());
        buf = buf.slice(2 + buf[1]);
      }
    });
    socket.on("error", () => {});
    setTimeout(() => { socket.destroy(); resolve({ status, frames }); }, ms);
  });
}

test("relays helper lines to VS Code windows and ignores other origins", async () => {
  const port = await freePort();
  // The fixture is a node script; it speaks after the clients below are in.
  const relay = new TouchRelay({ port, helperPath: process.execPath, helperArgs: [FAKE_HELPER] });
  relay.start();
  await new Promise(r => setTimeout(r, 100));
  const [win, web] = await Promise.all([connect(port, "vscode-file://vscode-app"), connect(port, "https://example.com")]);
  assert.strictEqual(win.status, "101");
  assert.deepStrictEqual(win.frames, ["u", "d 0.100,0.500", "f 0.120,0.500", "u"]);
  assert.strictEqual(web.status, "403");
  assert.deepStrictEqual(web.frames, []);
  relay.stop();
});

test("a window that connects while a finger rests gets its position, not a new touch", async () => {
  const port = await freePort();
  const relay = new TouchRelay({ port, helperPath: "/nonexistent" });
  relay.start();
  await new Promise(r => setTimeout(r, 100));
  relay.broadcast("d 0.900,0.100");
  const late = await connect(port, "vscode-file://vscode-app", 200);
  assert.deepStrictEqual(late.frames, ["f 0.900,0.100"]);
  relay.stop();
});

test("a second relay on a taken port waits instead of failing", async () => {
  const port = await freePort();
  const a = new TouchRelay({ port, helperPath: "/nonexistent" });
  const b = new TouchRelay({ port, helperPath: "/nonexistent" });
  a.start();
  await new Promise(r => setTimeout(r, 100));
  b.start();
  await new Promise(r => setTimeout(r, 100));
  assert.ok(a.server && !b.server && b.retry);
  a.stop(); b.stop();
});
