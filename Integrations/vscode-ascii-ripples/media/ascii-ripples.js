// ASCII Ripples for VS Code. The extension copies this file next to the
// workbench page and loads it with one <script> tag; it draws the ASCII Ripples
// wallpaper behind every empty editor group. Settings are baked in by the
// extension (the placeholder below); changing them rewrites the file and
// reloads the window.
(() => {
"use strict";
const OPTIONS = /*@@OPTIONS@@*/{}/*@@END@@*/;
if (window.__asciiRipples) return;
window.__asciiRipples = true;

// ---------------------------------------------------------------------------
// Color themes (same as the desktop wallpaper), plus "vscode", which takes the
// colors of the current VS Code color theme.
// ---------------------------------------------------------------------------
const THEMES = {
  dark:   { bg: [20, 20, 22],    text: [150, 150, 158], wave: [70, 150, 235] },
  dusk:   { bg: [30, 27, 42],    text: [165, 152, 178], wave: [240, 135, 95] },
  golden: { bg: [238, 224, 207], text: [100, 78, 66],   wave: [222, 112, 55] },
  light:  { bg: [236, 235, 231], text: [70, 70, 78],    wave: [30, 110, 220] },
};
const SKY = [[-12, "dark"], [-4, "dusk"], [3, "golden"], [14, "light"]];
const THEME_FADE_MS = 900;
const darkMQ = matchMedia("(prefers-color-scheme: dark)");
const num = v => (v === "" || v == null ? NaN : Number(String(v).replace(",", ".")));
const geo = {
  lat: Number.isFinite(num(OPTIONS.latitude)) ? num(OPTIONS.latitude) : null,
  lon: Number.isFinite(num(OPTIONS.longitude)) ? num(OPTIONS.longitude) : null,
};
const themeMode = OPTIONS.theme || "time";
const lerp = (a, b, t) => a + (b - a) * t;

function parseColor(s) {
  s = String(s || "").trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split("").map(c => c + c).join("");
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) return m[1].split(/[ ,/]+/).slice(0, 3).map(Number);
  return null;
}
for (const [theme, keys] of [["dark", ["bg", "text", "wave"]], ["light", ["bg", "text", "wave"]]]) {
  const custom = (OPTIONS.colors || {})[theme] || {};
  for (const k of keys) { const c = parseColor(custom[k]); if (c) THEMES[theme][k] = c; }
}

function sunElevation(date) {
  const rad = Math.PI / 180;
  const lat = geo.lat ?? 50;
  const lon = geo.lon ?? -date.getTimezoneOffset() / 4;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date - start) / 864e5;
  const g = 2 * Math.PI / 365 * (day - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
             + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
             - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const ha = ((utcMin + eot + 4 * lon) / 4 - 180) * rad;
  const sinEl = Math.sin(lat * rad) * Math.sin(decl) + Math.cos(lat * rad) * Math.cos(decl) * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) / rad;
}
function skyColors(elev) {
  let i = 0;
  while (i < SKY.length - 1 && elev > SKY[i + 1][0]) i++;
  const [e0, a] = SKY[i], [e1, b] = SKY[Math.min(i + 1, SKY.length - 1)];
  let k = e1 === e0 ? 0 : Math.min(1, Math.max(0, (elev - e0) / (e1 - e0)));
  k = k * k * (3 - 2 * k);
  const lum = c => (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
  let kt = k;
  if ((lum(THEMES[a].bg) - 0.5) * (lum(THEMES[b].bg) - 0.5) < 0) {
    kt = Math.min(1, Math.max(0, (k - 0.42) / 0.16));
    kt = kt * kt * (3 - 2 * kt);
  }
  const mix = (key, t) => THEMES[a][key].map((v, j) => v + (THEMES[b][key][j] - v) * t);
  return { bg: mix("bg", k), text: mix("text", kt), wave: mix("wave", kt) };
}
function vscodeColors() {
  const root = document.querySelector(".monaco-workbench") || document.body;
  const css = getComputedStyle(root);
  const isLight = root.classList.contains("vs") || root.classList.contains("hc-light");
  const base = THEMES[isLight ? "light" : "dark"];
  const v = name => parseColor(css.getPropertyValue(name));
  const bg = v("--vscode-editorGroup-emptyBackground") || v("--vscode-editor-background") || base.bg;
  const fg = v("--vscode-editor-foreground") || base.text;
  return {
    bg,
    text: fg.map((c, i) => lerp(bg[i], c, 0.75)),
    wave: v("--vscode-focusBorder") || v("--vscode-textLink-foreground") || base.wave,
  };
}
function themeColors() {
  if (themeMode === "time") return skyColors(sunElevation(new Date()));
  if (themeMode === "vscode") return vscodeColors();
  return THEMES[themeMode === "auto" ? (darkMQ.matches ? "dark" : "light") : themeMode] || THEMES.dark;
}

// Settings shared by every layer (same names and defaults as the wallpaper).
const CFG = Object.assign({
  chars: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  cellSize: 13,
  blobSize: 260, coverage: 0.5, edge: 0.1, morph: 0.06, driftX: 14, driftY: 9,
  idle: 0.05, flicker: 1,
  click: true, waveSpeed: 90, waveReach: 80, swellWidth: 6, ringGap: 16, ring2: 0.7,
  wobble: 10, jitter: 3, waveLife: 5, blueFade: 0.9, glowFade: 1.0,
  waveBrightness: 0.45, heartChance: 0.15,
  hover: true, hoverRadius: 7, hoverBrightness: 0.35,
}, OPTIONS.cfg || {});
CFG.chars = String(CFG.chars || "").slice(0, 255) || "abc";
const colors = themeColors();
CFG.bg = [...colors.bg]; CFG.text = [...colors.text]; CFG.wave = [...colors.wave];
const fpsLimit = Math.max(0, Number(OPTIONS.fps) || 0);
const layerOpacity = Math.min(1, Math.max(0, OPTIONS.opacity ?? 1));

// --- Perlin noise ---
const P = new Uint8Array(512);
for (let i = 0; i < 256; i++) P[i] = i;
for (let i = 255; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [P[i], P[j]] = [P[j], P[i]]; }
for (let i = 0; i < 256; i++) P[i + 256] = P[i];
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h, x, y, z) {
  h &= 15;
  const u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}
function perlin(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const X = fx & 255, Y = fy & 255, Z = fz & 255;
  x -= fx; y -= fy; z -= fz;
  const u = fade(x), v = fade(y), w = fade(z);
  const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z;
  const B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(P[AA], x, y, z),       grad(P[BA], x - 1, y, z), u),
         lerp(grad(P[AB], x, y - 1, z),   grad(P[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(P[AA + 1], x, y, z - 1),     grad(P[BA + 1], x - 1, y, z - 1), u),
         lerp(grad(P[AB + 1], x, y - 1, z - 1), grad(P[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}

// --- Heart outline as a polar lookup ---
const HEART_BINS = 360, heartR = new Float32Array(HEART_BINS);
for (let i = 0; i < 4000; i++) {
  const s = i / 4000 * Math.PI * 2;
  const hx = 16 * Math.sin(s) ** 3;
  const hy = -(13 * Math.cos(s) - 5 * Math.cos(2 * s) - 2 * Math.cos(3 * s) - Math.cos(4 * s)) - 2;
  const bin = ((Math.atan2(hy, hx) / (Math.PI * 2) + 1) % 1) * HEART_BINS | 0;
  heartR[bin] = Math.max(heartR[bin], Math.hypot(hx, hy));
}
for (let pass = 0; pass < 2; pass++)
  for (let i = 0; i < HEART_BINS; i++) if (!heartR[i]) heartR[i] = heartR[(i + HEART_BINS - 1) % HEART_BINS];
{ const m = Math.max(...heartR); for (let i = 0; i < HEART_BINS; i++) heartR[i] /= m; }
const heartRadius = (dx, dy) => Math.max(0.2, heartR[((Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1) * HEART_BINS | 0]);

// ---------------------------------------------------------------------------
// One animated layer inside a host element (an empty editor group).
// ---------------------------------------------------------------------------
function createLayer(host) {
  const canvas = document.createElement("canvas");
  canvas.className = "ascii-ripples-layer";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute", left: "0", top: "0", width: "100%", height: "100%",
    zIndex: "-1", pointerEvents: "none", opacity: String(layerOpacity),
  });
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: false });
  const ctx = gl ? null : canvas.getContext("2d", { alpha: false });
  let dpr = 1, W = 0, H = 0, CELL_W = 7, CELL_H = 13;
  let cols = 0, rows = 0, cells = null, atlas = [], glyphW = 0, glyphH = 0, cellBuf = null;
  const TINT_LEVELS = 8;
  const waves = [];
  const mouse = { x: -1e4, y: -1e4 };
  let raf = 0, lastDraw = 0, lastT = 0, running = false;
  const col = { bg: [...CFG.bg], text: [...CFG.text], wave: [...CFG.wave] };

  function renderAtlas(color) {
    const a = document.createElement("canvas");
    a.width = glyphW * CFG.chars.length; a.height = glyphH;
    const g = a.getContext("2d");
    g.font = `${Math.round(CELL_H * 0.85 * dpr)}px ui-monospace, Menlo, Consolas, monospace`;
    g.textBaseline = "top"; g.fillStyle = color;
    for (let i = 0; i < CFG.chars.length; i++) g.fillText(CFG.chars[i], i * glyphW, 0);
    return a;
  }
  function buildAtlas() {
    glyphW = Math.round(CELL_W * dpr); glyphH = Math.round(CELL_H * dpr);
    atlas = [];
    if (gl) { glUploadAtlas(renderAtlas("#fff")); return; }
    for (let lv = 0; lv < TINT_LEVELS; lv++) {
      const k = lv / (TINT_LEVELS - 1);
      atlas.push(renderAtlas(`rgb(${col.text.map((v, i) => Math.round(lerp(v, col.wave[i], k)))})`));
    }
  }

  let glProg, glU, glAtlasTex, glCellTex;
  function glInit() {
    const vs = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
    const fs = `
      precision highp float;
      uniform sampler2D uAtlas, uCells;
      uniform vec2 uCellPx, uGrid, uView;
      uniform float uChars;
      uniform vec3 uBg, uText, uWave;
      void main() {
        vec2 p = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
        vec2 cell = floor(p / uCellPx);
        vec2 local = (p - cell * uCellPx) / uCellPx;
        vec4 c = texture2D(uCells, (cell + 0.5) / uGrid);
        float ch = floor(c.r * 255.0 + 0.5);
        float a = texture2D(uAtlas, vec2((ch + local.x) / uChars, local.y)).a * c.g;
        gl_FragColor = vec4(mix(uBg, mix(uText, uWave, c.b), a), 1.0);
      }`;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    glProg = gl.createProgram();
    gl.attachShader(glProg, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(glProg, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(glProg);
    gl.useProgram(glProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(glProg, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    glU = {};
    for (const n of ["uAtlas", "uCells", "uCellPx", "uGrid", "uView", "uChars", "uBg", "uText", "uWave"])
      glU[n] = gl.getUniformLocation(glProg, n);
    const tex = unit => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
                            [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
        gl.texParameteri(gl.TEXTURE_2D, k, v);
      return t;
    };
    glAtlasTex = tex(0); glCellTex = tex(1);
    gl.uniform1i(glU.uAtlas, 0); gl.uniform1i(glU.uCells, 1);
  }
  function glUploadAtlas(img) {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, glAtlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  }
  function glDraw() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, glCellTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, cellBuf);
    const c = v => v.map(x => x / 255);
    gl.uniform2f(glU.uCellPx, glyphW, glyphH);
    gl.uniform2f(glU.uGrid, cols, rows);
    gl.uniform2f(glU.uView, canvas.width, canvas.height);
    gl.uniform1f(glU.uChars, CFG.chars.length);
    gl.uniform3fv(glU.uBg, c(col.bg)); gl.uniform3fv(glU.uText, c(col.text)); gl.uniform3fv(glU.uWave, c(col.wave));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = Math.max(1, host.clientWidth); H = Math.max(1, host.clientHeight);
    CELL_H = CFG.cellSize; CELL_W = Math.max(3, Math.round(CFG.cellSize * 0.54));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    if (gl) {
      glyphW = Math.round(CELL_W * dpr); glyphH = Math.round(CELL_H * dpr);
      CELL_W = glyphW / dpr; CELL_H = glyphH / dpr;
      cols = Math.ceil(canvas.width / glyphW); rows = Math.ceil(canvas.height / glyphH);
    } else {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      cols = Math.ceil(W / CELL_W); rows = Math.ceil(H / CELL_H);
    }
    cellBuf = new Uint8Array(cols * rows * 4);
    const n = cols * rows, nc = CFG.chars.length;
    cells = {
      ch:    new Uint8Array(n).map(() => Math.random() * nc | 0),
      next:  new Float32Array(n).map(() => Math.random() * 3000),
      dim:   new Float32Array(n).map(() => 0.55 + Math.random() * 0.45),
      jit:   new Float32Array(n).map(() => Math.random() * 2 - 1),
      glow:  new Float32Array(n),
      light: new Float32Array(n),
    };
    buildAtlas();
  }

  const CS_X = 4, CS_Y = 2;
  let coarse = new Float32Array(0), cW = 0, cH = 0;
  function sampleBlobs(t) {
    cW = Math.ceil(cols / CS_X) + 2; cH = Math.ceil(rows / CS_Y) + 2;
    if (coarse.length !== cW * cH) coarse = new Float32Array(cW * cH);
    const ox = t * CFG.driftX, oy = t * CFG.driftY, z = t * CFG.morph;
    for (let j = 0; j < cH; j++)
      for (let i = 0; i < cW; i++)
        coarse[j * cW + i] = perlin((i * CS_X * CELL_W - ox) / CFG.blobSize,
                                    (j * CS_Y * CELL_H - oy) / CFG.blobSize, z) * 0.5 + 0.5;
  }

  let themeFade = null;
  function setColors(to, instant) {
    if (instant || !gl) {
      themeFade = null;
      const moved = ["bg", "text", "wave"].some(k => to[k].some((v, i) => Math.abs(v - col[k][i]) > 1));
      col.bg = [...to.bg]; col.text = [...to.text]; col.wave = [...to.wave];
      if (!gl && cells && moved) buildAtlas();
      return;
    }
    themeFade = { from: { bg: [...col.bg], text: [...col.text], wave: [...col.wave] }, to, t0: performance.now() };
  }
  function stepTheme(nowMs) {
    if (!themeFade) return;
    let k = Math.min(1, Math.max(0, (nowMs - themeFade.t0) / THEME_FADE_MS));
    k = k * k * (3 - 2 * k);
    for (const key of ["bg", "text", "wave"])
      col[key] = themeFade.from[key].map((v, i) => lerp(v, themeFade.to[key][i], k));
    if (k === 1) themeFade = null;
  }

  function frame(nowMs) {
    raf = requestAnimationFrame(frame);
    if (fpsLimit > 0 && nowMs - lastDraw < 1000 / fpsLimit - 2) return;
    lastDraw = nowMs;
    const t = nowMs / 1000;
    const dt = Math.min(0.1, lastT ? t - lastT : 0);
    lastT = t;
    const decay = Math.exp(-dt / CFG.glowFade);
    stepTheme(nowMs);
    if (!gl) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgb(${col.bg})`;
      ctx.fillRect(0, 0, W, H);
    }
    const buf = cellBuf;

    while (waves.length && t - waves[0].t0 > CFG.waveLife) waves.shift();
    const band = CFG.wobble * 1.6 + CFG.jitter + CFG.swellWidth * 3 + CFG.ringGap;
    for (const w of waves) {
      w.age = t - w.t0;
      w.life = Math.pow(Math.max(0, 1 - w.age / CFG.waveLife), 1.3);
      w.radius = w.reach * (1 - Math.exp(-w.age * w.speed / w.reach));
      w.tint = Math.exp(-w.age / CFG.blueFade);
    }

    sampleBlobs(t);
    const aspect = CELL_H / CELL_W;
    const hr = CFG.hoverRadius, hr3 = hr * 3;
    const thr = CFG.coverage, edge = Math.max(0.001, CFG.edge);
    const sw = CFG.swellWidth, gapK = CFG.ringGap / sw;
    const nChars = CFG.chars.length;
    const flick = Math.max(0.05, CFG.flicker);
    const { ch, next, dim, jit, glow, light } = cells;

    for (let y = 0; y < rows; y++) {
      const cy = y / CS_Y, j0 = cy | 0, fyc = cy - j0;
      const hy = (y - mouse.y) * aspect;
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        const cx = x / CS_X, i0 = cx | 0, fxc = cx - i0, b = j0 * cW + i0;
        const n = lerp(lerp(coarse[b], coarse[b + 1], fxc), lerp(coarse[b + cW], coarse[b + cW + 1], fxc), fyc);
        let e = (n - thr) / edge; e = e < 0 ? 0 : e > 1 ? 1 : e;
        const density = e * e * (3 - 2 * e);

        let tint = 0;
        for (let wi = 0; wi < waves.length; wi++) {
          const w = waves[wi];
          const dx = x - w.x, dy = (y - w.y) * aspect;
          let d = Math.sqrt(dx * dx + dy * dy);
          if (w.heart) d /= heartRadius(dx, dy);
          if (d - w.radius > band || w.radius - d > band) continue;
          const wob = perlin(dx * 0.02 + w.seed, dy * 0.02, w.age * 0.5) * CFG.wobble
                    + perlin(dx * 0.07, dy * 0.07 + w.seed, w.age * 0.9) * CFG.wobble * 0.5
                    + Math.sin(jit[idx] * 40 + w.seed + w.age * 4) * CFG.jitter;
          const k = (d + wob - w.radius) / sw, k2 = k + gapK;
          if ((k < -3 && k2 < -3) || (k > 3 && k2 > 3)) continue;
          let patch = perlin(dx * 0.04 + w.seed, dy * 0.04, w.age * 0.3) * 1.2 + 0.6;
          patch = patch < 0.15 ? 0.15 : patch > 1 ? 1 : patch;
          const s = Math.max(Math.exp(-k * k), Math.exp(-k2 * k2) * CFG.ring2) * w.life * patch;
          if (s > glow[idx]) glow[idx] = s;
          if (s * w.tint > tint) tint = s * w.tint;
        }

        if (CFG.hover) {
          const hx = x - mouse.x;
          if (hx > -hr3 && hx < hr3 && hy > -hr3 && hy < hr3) {
            const l = Math.exp(-(hx * hx + hy * hy) / (hr * hr));
            if (l > light[idx]) light[idx] = l;
          }
        }

        const g = glow[idx], l = light[idx];
        glow[idx] = g * decay; light[idx] = l * decay;

        const vis = (density * (CFG.idle + CFG.waveBrightness * g) + l * CFG.hoverBrightness) * dim[idx];
        if (vis < 0.02) { buf[idx * 4 + 1] = 0; continue; }

        if (nowMs > next[idx] || (g > 0.3 && Math.random() < 0.08 * flick)) {
          ch[idx] = Math.random() * nChars | 0;
          next[idx] = nowMs + (400 + Math.random() * 3000) / flick;
        }

        const a = vis > 1 ? 1 : vis, tt = tint > 1 ? 1 : tint;
        if (gl) {
          const o = idx * 4;
          buf[o] = ch[idx]; buf[o + 1] = a * 255 + 0.5; buf[o + 2] = tt * 255 + 0.5;
        } else {
          ctx.globalAlpha = a;
          ctx.drawImage(atlas[Math.round(tt * (TINT_LEVELS - 1))], ch[idx] * glyphW, 0, glyphW, glyphH,
                        x * CELL_W, y * CELL_H, CELL_W, CELL_H);
        }
      }
    }
    if (gl) glDraw();
  }

  // Input: the canvas ignores the mouse, so VS Code keeps every click
  // (double-click still opens a new file); the host just listens along.
  const local = e => { const r = host.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const onMove = e => { const [px, py] = local(e); mouse.x = px / CELL_W; mouse.y = py / CELL_H; };
  const onLeave = () => { mouse.x = mouse.y = -1e4; };
  const onDown = e => {
    if (!CFG.click || e.button !== 0) return;
    const [px, py] = local(e);
    waves.push({
      x: px / CELL_W, y: py / CELL_H, t0: performance.now() / 1000,
      seed: Math.random() * 100, heart: Math.random() < CFG.heartChance,
      speed: CFG.waveSpeed * (0.8 + Math.random() * 0.4),
      reach: CFG.waveReach * (0.75 + Math.random() * 0.5),
    });
    if (waves.length > 12) waves.shift();
  };
  const ro = new ResizeObserver(() => {
    if (Math.max(1, host.clientWidth) !== W || Math.max(1, host.clientHeight) !== H) resize();
  });

  if (gl) glInit();
  // The layer sits under the group's own content (the VS Code logo and
  // shortcuts): an isolated stacking context keeps z-index -1 above the
  // group's background.
  const saved = { position: host.style.position, isolation: host.style.isolation };
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.style.isolation = "isolate";
  host.appendChild(canvas);
  resize();
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);
  host.addEventListener("pointerdown", onDown);
  ro.observe(host);

  const layer = {
    host,
    start() { if (running) return; running = true; lastT = 0; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    setColors,
    destroy() {
      layer.stop();
      ro.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      canvas.remove();
      host.style.position = saved.position; host.style.isolation = saved.isolation;
      const lose = gl && gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    },
  };
  return layer;
}

// ---------------------------------------------------------------------------
// Workbench glue: one layer per empty editor group, none while a group shows
// an editor or the window is hidden.
// ---------------------------------------------------------------------------
const layers = new Map();
const GROUP = ".part.editor > .content .editor-group-container";

if (OPTIONS.showWatermark === false) {
  const style = document.createElement("style");
  style.textContent = `.monaco-workbench ${GROUP}.empty .editor-group-watermark .letterpress { visibility: hidden; }`;
  document.head.appendChild(style);
}

function sync() {
  const groups = new Set(document.querySelectorAll(GROUP + ".empty"));
  for (const [host, layer] of layers) {
    if (!groups.has(host) || !host.isConnected) { layer.destroy(); layers.delete(host); }
  }
  for (const host of groups) {
    if (layers.has(host)) continue;
    try {
      const layer = createLayer(host);
      layers.set(host, layer);
      // A group stops being empty the moment an editor opens in it.
      new MutationObserver((_, obs) => {
        if (!host.classList.contains("empty")) { obs.disconnect(); sync(); }
      }).observe(host, { attributes: true, attributeFilter: ["class"] });
    } catch (err) {
      console.error("[ascii-ripples]", err);
    }
  }
  for (const layer of layers.values()) document.hidden ? layer.stop() : layer.start();
}

function recolor(instant) {
  const to = themeColors();
  for (const layer of layers.values()) layer.setColors(to, instant);
  CFG.bg = [...to.bg]; CFG.text = [...to.text]; CFG.wave = [...to.wave];
}

function boot() {
  const workbench = document.querySelector(".monaco-workbench");
  if (!workbench) { setTimeout(boot, 250); return; }
  recolor(true);   // "vscode" colors exist only once the workbench is up
  sync();
  // New groups (splits, new windows' layouts) and groups that became empty
  // again: a cheap periodic scan instead of observing the whole editor DOM.
  setInterval(() => { if (!document.hidden) sync(); }, 700);
  document.addEventListener("visibilitychange", sync);
  if (themeMode === "time") setInterval(() => recolor(false), 30000);
  if (themeMode === "auto") darkMQ.addEventListener("change", () => recolor(false));
  if (themeMode === "vscode") {
    // VS Code swaps the theme class on the workbench and rewrites its color variables.
    let pending = 0;
    new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(() => recolor(false), 50);
    }).observe(workbench, { attributes: true, attributeFilter: ["class"] });
    const sheet = document.querySelector("style.contributedColorTheme") || document.head;
    new MutationObserver(() => recolor(false)).observe(sheet, { childList: true, characterData: true, subtree: true });
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
})();
