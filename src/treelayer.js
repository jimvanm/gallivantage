// Trees in the app: the Biome Lab's forest (forest.js, forestdraw.js) on the round Earth, riding the buildings'
// machinery. Helpers (nearworker.js, treetile.js) plant one zoom-16 tile at a time from its address, on the same
// ground the buildings stand on; nothing is stored. Here: which tiles are wanted (nearest first, with only the share
// of their trees that will show), holding them, and drawing them in both depth passes.
//
// Each tile's trees are in the tile's own local axes (treetile.js). The drawer gathers them into lists in one frame,
// the "anchor" (where the camera was when a list was made), and each pass places that anchor as the buildings' tiles
// are placed (globe.js).

import { View, ecef } from './globe.js';
import { tileSizeMerc, tileCentreMerc, mercToTile } from './geo.js';
import { WorkerPool } from './pool.js';
import { elevationUrl, surveyGeneration } from './placetiles.js';
import { createForestDrawer } from './forestdraw.js';
import { VIEW_DEFAULTS, shareToMake, reach as reachOf } from './forest.js';
import { TREE_Z, COVER_Z } from './treetile.js';
import { SUN_DIR } from './gl.js';
import { settings, TREE_STYLES } from './settings.js';

const WORKERS = 2;
const DROP_MARGIN = 600;     // metres past the reach before a held tile is let go
const RETRY_MS = 10000;
const ANCHOR_MOVE = 20000;  // metres from the anchor before it moves to the camera

export class TreeLayer {
  // lib: the tree shapes (library/trees/models.json), getTemplate: () => the map tile address template.
  constructor(gl, lib, getTemplate) {
    this.gl = gl;
    this.getTemplate = getTemplate;
    this.drawer = createForestDrawer(gl, lib);
    this.styles = this.drawer.styles.map((s) => s.map(({ H, W, n }) => ({ H, W, n })));
    this.V = { ...VIEW_DEFAULTS };
    this.keeper = { live: new Map(), dirty: false, farDirty: false };
    this.failed = new Map();
    this.want = [];
    this.active = false;
    this.blocked = false;
    this.stats = { done: 0, failed: 0, ms: 0 };
    this.anchor = null;      // the frame the trees are held in: { lat, lon, view } (see _anchorAt)
    this.sgen = surveyGeneration();
    this.pool = new WorkerPool(new URL('./nearworker.js', import.meta.url), WORKERS, {
      message: (s) => this._message(s),
      onResult: (spec, msg) => { this.stats.done++; this.stats.ms += msg.ms || 0; this._pumpSoon(); this._take(spec, msg); },
      onFail: (spec, error) => { this.stats.failed++; this.lastError = error; this.failed.set(spec.key, performance.now() + RETRY_MS); },
      onError: (text) => { this.lastError = 'helper failed: ' + text; },
    });
  }

  // Start the next job as soon as a helper is free, not at the next frame (frames can be slow while trees load).
  _pumpSoon() { if (this.getTemplate() && this.active && !this.blocked) queueMicrotask(() => this.pool.pump((s) => s.d)); }

  get style() { return TREE_STYLES[settings.trees].id; }
  get dots() { return this.style === 'full'; }
  get reach() { return reachOf(this.V, this.dots); }

  _message(s) {
    const d = TREE_Z - COVER_Z, x14 = s.x >> d, y14 = s.y >> d;
    const vurl = this.getTemplate().replace('{z}', COVER_Z).replace('{x}', x14).replace('{y}', y14);
    return { trees: 1, x: s.x, y: s.y, keep: s.keep, vurl, eurl: elevationUrl(COVER_Z, x14, y14), styles: this.styles, sgen: this.sgen };
  }

  _take(spec, msg) {
    if (msg.sgen !== this.sgen) return;                              // made on the ground before the survey was switched
    const had = this.keeper.live.get(spec.key);
    if (had && had.keep >= msg.keep) return;
    const b = { key: spec.key, rawX: spec.rawX, y: spec.y, rad: msg.rad, n: msg.n, own: msg.u8, keep: msg.keep, tree: true, lat: msg.lat, lon: msg.lon };
    if (this.anchor) this._move(b);
    this.keeper.live.set(spec.key, b);
    this.keeper.dirty = true; this.keeper.farDirty = true;
  }

  // The trees are held in one frame, the anchor: the local axes at a point near the camera (globe.js), so the drawer
  // works as in the lab, on plain positions. Each tile arrives in its own axes and is moved into the anchor's once.
  // The anchor moves only when the camera has gone 20 km from it (float precision stays at millimetres within that).
  _anchorAt(lat, lon) {
    this.anchor = { lat, lon, view: new View(lat, lon, 0) };
    for (const b of this.keeper.live.values()) this._move(b);
    this.keeper.dirty = true; this.keeper.farDirty = true;
  }

  _move(b) {
    const P = this.anchor.view.place(b.lat, b.lon, 0), r = P.rot, o = P.org;   // r by columns
    const src = new Float32Array(b.own.buffer, b.own.byteOffset, b.n * 5), u8 = b.own.slice(), f = new Float32Array(u8.buffer);
    for (let i = 0; i < b.n; i++) {
      const x = src[i * 5], y = src[i * 5 + 1], z = src[i * 5 + 2];
      f[i * 5] = r[0] * x + r[3] * y + r[6] * z + o[0];
      f[i * 5 + 1] = r[1] * x + r[4] * y + r[7] * z + o[1];
      f[i * 5 + 2] = r[2] * x + r[5] * y + r[8] * z + o[2];
    }
    b.u8 = u8; b.u32 = new Uint32Array(u8.buffer); b.cx = o[0]; b.cz = o[2];
  }

  // Let every tile go (the survey was switched: the ground under them changed).
  reset() {
    this.keeper.live.clear(); this.keeper.dirty = true; this.keeper.farDirty = true;
    this.failed.clear(); this.pool.clearQueue();
    this.sgen = surveyGeneration();
  }

  // Every frame. v: detail.js's view; hfov: the view's width (radians).
  update(v, hfov, now) {
    this.active = settings.trees > 0 && v.nearOn;
    this.blocked = !v.nearFetchOk;
    if (surveyGeneration() !== this.sgen) this.reset();
    if (!this.active) { this.want = []; this.pool.keepOnly(new Set()); return; }
    const Z = TREE_Z, n = 2 ** Z, size = tileSizeMerc(Z), tm = size * v.k, R = this.reach, V = this.V;
    const t = mercToTile(v.mercX, v.mercY, Z), cx = Math.floor(t.x), cy = Math.floor(t.y), Rt = Math.ceil(R / tm) + 1;
    const rad = tm * 0.71, want = [], seen = new Set();
    const dist = (rawX, y) => { const c = tileCentreMerc(rawX, y, Z); return Math.hypot(c.x - v.mercX, c.y - v.mercY) * v.k; };
    for (let y = Math.max(0, cy - Rt); y <= Math.min(n - 1, cy + Rt); y++) for (let rawX = cx - Rt; rawX <= cx + Rt; rawX++) {
      const d = dist(rawX, y) - rad;
      if (d > R) continue;
      const x = ((rawX % n) + n) % n, key = x + '/' + y, keep = shareToMake(Math.max(0, d), V);
      seen.add(key);
      const had = this.keeper.live.get(key);
      if (had && had.keep >= keep) continue;
      want.push({ key, x, y, rawX, keep, d });
    }
    // let go of tiles well out of reach
    for (const [k, b] of this.keeper.live) {
      if (seen.has(k)) continue;
      if (dist(b.rawX, b.y) - b.rad > R + DROP_MARGIN) { this.keeper.live.delete(k); this.keeper.dirty = true; this.keeper.farDirty = true; }
    }
    this.want = want;
    this.pool.keepOnly(new Set(want.map((w) => w.key)));
    if (!this.blocked && this.getTemplate()) {
      for (const w of want) {
        const retry = this.failed.get(w.key);
        if (retry !== undefined) { if (now < retry) continue; this.failed.delete(w.key); }
        this.pool.want(w.key, w);
      }
    }
    if (this.getTemplate()) this.pool.pump((s) => s.d);

    // the drawer's lists, with the camera in the anchor's frame
    if (!this.anchor) this._anchorAt(v.lat, v.lon);
    let eye = this.anchor.view.toCam(ecef(v.lat, v.lon, v.alt));
    if (Math.hypot(eye[0], eye[2]) > ANCHOR_MOVE) { this._anchorAt(v.lat, v.lon); eye = [0, v.alt, 0]; }
    this.drawer.update({ eye, yaw: v.yaw, pitch: v.pitch, hfov, agl: v.agl, now, keeper: this.keeper, V, show: this.show, reach: R, anchor: this.anchor });
  }

  get show() { return { trees: true, vines: false, dots: this.dots }; }

  // One depth pass. pass: main.js's (proj, view, globe); fog: the ground's fog colour and strength.
  draw(pass, sky, fogDensity) {
    if (!this.active || !this.keeper.live.size) return;
    const vp = mul4(pass.proj, pass.view), V = pass.view;
    const fwdCam = [-V[2], -V[6], -V[10]];                             // the camera's looking direction (gl.js viewRot)
    const placeOf = (a) => {
      const P = pass.globe.place(a.lat, a.lon, 0), r = P.rot, o = P.org;
      // the eye and the looking direction in the anchor's axes: the turn's transpose
      const back = (w) => [r[0] * w[0] + r[1] * w[1] + r[2] * w[2], r[3] * w[0] + r[4] * w[1] + r[5] * w[2], r[6] * w[0] + r[7] * w[1] + r[8] * w[2]];
      return { rot: r, org: o, eye: back([-o[0], -o[1], -o[2]]), fwd: back(fwdCam), cam: [0, 0, 0] };
    };
    this.drawer.draw({ vp, V: this.V, show: this.show, sun: SUN_DIR, sky, fog: fogDensity, fogSq: 1, placeOf });
  }

  get status() {
    if (this.disabled) return 'off (no helper)';
    if (!settings.trees) return 'off';
    if (!this.active) return 'too high';
    let n = 0; for (const b of this.keeper.live.values()) n += b.n;
    const s = this.drawer.stats;
    return TREE_STYLES[settings.trees].label + ' ' + this.keeper.live.size + ' tiles ' + (n / 1000).toFixed(0) + 'k trees' +
      (this.want.length ? ' (' + this.want.length + ' to come)' : '') + ' ' + s.rebuildMs.toFixed(0) + '/' + s.farMs.toFixed(0) + ' ms' +
      (this.blocked ? ' (too fast to fetch)' : '') + (this.stats.done ? ' ' + (this.stats.ms / this.stats.done).toFixed(0) + ' ms a tile' : '') +
      (this.stats.failed ? ' ' + this.stats.failed + ' failed (' + String(this.lastError).slice(0, 80) + ')' : '');
  }

  get disabled() { return this.pool.dead; }
}

function mul4(a, b) {   // a * b, column-major
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
