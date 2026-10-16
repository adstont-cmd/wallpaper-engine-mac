// Trackpad fingers for the wallpaper layer. VS Code's window only sees clicks,
// so a small native helper (helper/trackpad-helper.swift) reads the fingers and
// this module relays its lines over a local WebSocket that the layer in every
// VS Code window connects to. One server per machine: the first window binds the
// port, the others retry in case it goes away.
"use strict";
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC11B65";
// Only VS Code's own workbench may listen; a web page in a browser could
// otherwise follow the trackpad.
const ALLOWED_ORIGIN = /^vscode-file:\/\//;

function frame(text) {
  const payload = Buffer.from(text, "utf8");
  const head = payload.length < 126
    ? Buffer.from([0x81, payload.length])
    : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff]);
  return Buffer.concat([head, payload]);
}

// Accepts the WebSocket handshake by hand (no dependencies): returns false for
// anything that is not a WebSocket request from an allowed origin.
function accept(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key || String(req.headers.upgrade).toLowerCase() !== "websocket" ||
      !ALLOWED_ORIGIN.test(String(req.headers.origin || ""))) {
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return false;
  }
  const digest = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
               `Sec-WebSocket-Accept: ${digest}\r\n\r\n`);
  return true;
}

class TouchRelay {
  constructor({ port, helperPath, helperArgs = [], log = () => {} }) {
    this.port = port;
    this.helperPath = helperPath;
    this.helperArgs = helperArgs;
    this.log = log;
    this.clients = new Set();
    this.server = null;
    this.helper = null;
    this.retry = null;
    this.stopped = false;
    this.last = "u";
  }

  start() {
    this.stopped = false;
    this.listen();
  }

  listen() {
    if (this.stopped || this.server) return;
    const server = http.createServer((_, res) => { res.writeHead(426); res.end(); });
    server.on("upgrade", (req, socket) => {
      if (!accept(req, socket)) return;
      this.clients.add(socket);
      socket.write(frame(this.last));   // a late window learns whether fingers rest now
      // Clients only ever close; any frame from them (close, ping) ends the connection.
      socket.on("data", () => socket.destroy());
      socket.on("close", () => this.clients.delete(socket));
      socket.on("error", () => this.clients.delete(socket));
    });
    server.on("error", err => {
      server.close();
      this.server = null;
      if (err.code !== "EADDRINUSE") this.log(`touch relay: ${err.message}`);
      this.retry = setTimeout(() => { this.retry = null; this.listen(); }, 10000);
    });
    server.listen(this.port, "127.0.0.1", () => {
      this.server = server;
      this.spawnHelper();
    });
  }

  spawnHelper() {
    if (this.stopped || this.helper || !fs.existsSync(this.helperPath)) return;
    // A .vsix does not keep the executable bit.
    try { fs.accessSync(this.helperPath, fs.constants.X_OK); } catch {
      try { fs.chmodSync(this.helperPath, 0o755); } catch { /* read-only install: try as is */ }
    }
    const helper = spawn(this.helperPath, this.helperArgs, { stdio: ["pipe", "pipe", "pipe"] });
    this.helper = helper;
    let buffered = "";
    helper.stdout.on("data", chunk => {
      buffered += chunk;
      let nl;
      while ((nl = buffered.indexOf("\n")) >= 0) {
        const line = buffered.slice(0, nl);
        buffered = buffered.slice(nl + 1);
        this.broadcast(line);
      }
    });
    helper.stderr.on("data", d => this.log(`trackpad helper: ${String(d).trim()}`));
    helper.on("error", err => this.log(`trackpad helper: ${err.message}`));
    helper.on("exit", code => {
      if (this.helper === helper) this.helper = null;
      if (!this.stopped && code !== 0) this.log(`trackpad helper exited with ${code}`);
    });
  }

  broadcast(line) {
    if (!/^(d|f|u)( [-0-9.,;]*)?$/.test(line)) return;
    this.last = line[0] === "u" ? "u" : "f " + line.slice(2);
    const data = frame(line);
    for (const socket of this.clients) socket.write(data);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    if (this.helper) { this.helper.stdin.end(); this.helper.kill(); this.helper = null; }
    for (const socket of this.clients) socket.destroy();
    this.clients.clear();
    if (this.server) { this.server.close(); this.server = null; }
  }
}

const helperPath = extensionPath => path.join(extensionPath, "bin", "trackpad-helper");

module.exports = { TouchRelay, helperPath, frame, accept };
