// Layer 4, drawing: the ground of the whole Earth, as tiles on the ball.
//
// Asks select.js which tiles to fetch and draw, has helpers (tileworker.js)
// fetch and build them, keeps them on the graphics card, and draws them
// relative to the camera.
//
// It also answers "how high is the ground here?" from the tiles it holds.
// That belongs in layer 2 (one ground), which does not exist yet; until it
// does, this is the only place that answers it, so there is still only one.

import { program, logDepthC, LOG_DEPTH_GLSL } from './gl.js';
import { selectTiles, ROOT_Z } from './select.js';
import { GRID, STRIDE, heightAt as nodeHeight } from './tilemesh.js';
import { tileAt, A, B } from '../geo/earth.js';
import { outside } from './sea.js';
import { MAX_ZOOM } from '../sources/terrarium.js';
import { FAR } from './view.js';

const WORKERS = 4;
const IN_FLIGHT = 16;              // downloads at once
const KEEP = 1200;                 // tiles held on the graphics card, beyond those the view needs
const UPLOADS_PER_FRAME = 4;       // so several arriving at once never stall a frame

const VS = `#version 300 es
layout(location = 0) in vec4 aPos;       // metres from the tile's middle, and height
layout(location = 1) in vec4 aNrm;
uniform mat4 uProj, uView;
uniform vec3 uOffset;                    // the tile's middle, relative to the camera
// Centroid: every value is worked out inside the triangle, even at its
// edges. Without it, a sliver seen edge-on (a skirt, far away) gets values
// from outside itself, such as a height above sea level under open water,
// and dotted lines appear along tile edges.
centroid out vec3 vRel; centroid out vec3 vN; centroid out float vH; centroid out float vW;
void main() {
  vRel = aPos.xyz + uOffset;
  vN = aNrm.xyz; vH = aPos.w;
  gl_Position = uProj * uView * vec4(vRel, 1.0);
  vW = gl_Position.w;
}`;

const FS = `#version 300 es
precision highp float;
centroid in vec3 vRel; centroid in vec3 vN; centroid in float vH; centroid in float vW;
uniform vec3 uCamE, uSun, uHazeColour, uTint;
uniform float uHaze, uTintMix, uDropUnder;
uniform vec3 uOcs;          // camera, earth-centred, z stretched by K (as in sea.js)
uniform float uC;           // how far the camera is outside the sea (as in sea.js)
${LOG_DEPTH_GLSL}
out vec4 colour;
const float K = ${(A / B).toFixed(12)};
void main() {
  // Hidden by the sea? If the line of sight dips under sea level before it
  // gets here, this ground is behind the curve of the Earth (or on its far
  // side), and the sea, drawn first, must show instead. Worked out exactly,
  // as the sea itself is, not by comparing depths: a graphics card keeps
  // depth too coarsely to tell low land from the sea round it far away, and
  // the two flickered. The margin allows for the flat triangles of coarse
  // tiles sagging a little under the curve.
  if (uC > 0.0) {
    float L = length(vRel);
    vec3 d = vRel / L, ds = vec3(d.xy, d.z * K);
    float a = dot(ds, ds), b = dot(ds, uOcs), disc = b * b - a * uC;
    if (b < 0.0 && disc >= 0.0 && uC / (-b + sqrt(disc)) < L - (50.0 + L * 1e-3)) discard;
  }
  // Ground under sea level is not drawn: the sea, drawn first, covers it
  // (sea.js). (Land truly below sea level, such as Dutch polders, shows as
  // sea until water comes from the map.) Not when you are below sea level
  // yourself: there is no sea then, and the ground must show.
  if (vH < 0.0 && uDropUnder > 0.5) discard;
  vec3 n = normalize(vN), up = normalize(vRel + uCamE);
  float steep = 1.0 - dot(n, up);
  // By height: lowland green, upland olive, high brown, snow on top.
  vec3 c = mix(vec3(0.26, 0.38, 0.19), vec3(0.40, 0.41, 0.26), smoothstep(200.0, 1400.0, vH));
  c = mix(c, vec3(0.47, 0.43, 0.36), smoothstep(1400.0, 2800.0, vH));
  c = mix(c, vec3(0.50, 0.48, 0.46), smoothstep(0.18, 0.35, steep));          // bare rock on steep ground
  c = mix(c, vec3(0.92, 0.94, 0.97), smoothstep(3600.0, 4600.0, vH) * (1.0 - smoothstep(0.35, 0.6, steep)));
  c = mix(c, vec3(0.45, 0.42, 0.33), step(vH, -0.5));                         // under the sea
  c = mix(c, uTint, uTintMix);
  c *= 0.38 + 0.72 * max(dot(n, uSun), 0.0);
  float haze = 1.0 - exp(-length(vRel) * uHaze);
  colour = vec4(mix(c, uHazeColour, haze * 0.85), 1.0);
  gl_FragDepth = logDepth(vW);
}`;

// One colour per zoom, for "colour tiles by zoom".
const ZOOM_TINT = [[1, 0, 0], [1, .5, 0], [1, 1, 0], [.5, 1, 0], [0, 1, 0], [0, 1, .6], [0, 1, 1], [0, .6, 1],
  [0, .2, 1], [.5, 0, 1], [1, 0, 1], [1, 0, .5], [1, 1, 1], [.6, .6, .6], [.3, .3, .3], [0, 0, 0]];

export class Globe {
  constructor(gl) {
    this.gl = gl;
    this.prog = program(gl, VS, FS, ['uProj', 'uView', 'uOffset', 'uCamE', 'uSun', 'uHazeColour', 'uHaze', 'uLogC', 'uTint', 'uTintMix', 'uDropUnder', 'uOcs', 'uC']);
    this.tiles = new Map();        // key -> tile on the graphics card
    this.info = new Map();         // select.js's notes per tile
    this.loading = new Map();      // key -> job id
    this.failed = new Map();       // key -> { until, tries }
    this.arrived = [];             // finished jobs waiting to be uploaded
    this.draws = [];
    this.bytes = 0; this.downloads = 0; this.errors = 0; this.lastError = '';
    this.maxZ = 14; this.detailPx = 4; this.tint = false; this.limit = KEEP;
    this.workers = [];
    this.jobs = new Map();         // id -> key
    this.nextId = 1;
    for (let i = 0; i < WORKERS; i++) {
      const w = new Worker(new URL('./tileworker.js', import.meta.url), { type: 'module' });
      w.onmessage = (ev) => this._done(ev.data);
      w.onerror = (e) => { this.lastError = 'helper: ' + (e.message || 'failed to start'); };
      this.workers.push(w);
    }
  }

  _done(msg) {
    const key = this.jobs.get(msg.id);
    this.jobs.delete(msg.id);
    if (!msg.ok) {
      this.loading.delete(key);
      // Try again later, waiting longer each time (2 s, 4 s ... up to a minute),
      // so one bad moment on the network never loses a tile for good.
      const f = this.failed.get(key) || { tries: 0 };
      f.tries++; f.until = performance.now() + Math.min(60000, 1000 * 2 ** f.tries);
      this.failed.set(key, f);
      this.errors++; this.lastError = key + ': ' + msg.error;
      return;
    }
    // Still counted as loading until it is on the graphics card, so it is
    // not asked for again while it waits its turn to be uploaded.
    this.failed.delete(key);
    this.bytes += msg.bytes; this.downloads++;
    this.arrived.push([key, msg]);
  }

  _upload(key, m) {
    const gl = this.gl;
    const vao = gl.createVertexArray(), vbo = gl.createBuffer(), ibo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, m.vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.BYTE, true, STRIDE, 16);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const [z, x, y] = key.split('/').map(Number);
    this.tiles.set(key, { key, z, x, y, vao, vbo, ibo, count: m.indices.length, centre: m.centre,
      minH: m.minH, maxH: m.maxH, nodes: m.nodes, used: performance.now() });
  }

  // Frees the longest-unused tiles beyond KEEP, never one the view needs.
  _evict(needed) {
    if (this.tiles.size <= this.limit) return;
    const gl = this.gl;
    const old = [...this.tiles.values()].filter((t) => t.z > ROOT_Z && !needed.has(t.key)).sort((a, b) => a.used - b.used);
    for (const t of old) {
      if (this.tiles.size <= this.limit) break;
      gl.deleteVertexArray(t.vao); gl.deleteBuffer(t.vbo); gl.deleteBuffer(t.ibo);
      this.tiles.delete(t.key); this.info.delete(t.key);
    }
  }

  // view: as selectTiles wants it (select.js), less maxZ, detailPx and N.
  update(view) {
    for (let i = 0; i < UPLOADS_PER_FRAME && this.arrived.length; i++) {
      const [key, m] = this.arrived.shift();
      this.loading.delete(key);
      this._upload(key, m);
    }
    if (this.info.size > 30000) this.info.clear();     // notes on tiles long out of sight
    const { draw, fetch, keep } = selectTiles({ ...view, maxZ: Math.min(this.maxZ, MAX_ZOOM), detailPx: this.detailPx, N: GRID }, this.tiles, this.info);
    const now = performance.now();
    for (const f of fetch) {
      if (this.loading.size >= IN_FLIGHT) break;
      if (this.loading.has(f.key)) continue;
      const bad = this.failed.get(f.key);
      if (bad && now < bad.until) continue;
      const id = this.nextId++;
      this.jobs.set(id, f.key);
      this.loading.set(f.key, id);
      this.workers[id % WORKERS].postMessage({ id, z: f.z, x: f.x, y: f.y });
    }
    this.wanted = fetch.length;
    this.draws = draw.map((k) => this.tiles.get(k));
    for (const k of keep) this.tiles.get(k).used = now;
    this._evict(keep);
  }

  // pass: { proj, view, camE (earth-centred, full precision), sun, hazeColour, haze, aboveSea }
  draw(pass) {
    const gl = this.gl, u = this.prog.u;
    gl.useProgram(this.prog.p);
    gl.uniformMatrix4fv(u.uProj, false, pass.proj);
    gl.uniformMatrix4fv(u.uView, false, pass.view);
    gl.uniform3f(u.uCamE, pass.camE[0], pass.camE[1], pass.camE[2]);
    gl.uniform3fv(u.uSun, pass.sun);
    gl.uniform3fv(u.uHazeColour, pass.hazeColour);
    gl.uniform1f(u.uHaze, pass.haze);
    gl.uniform1f(u.uLogC, logDepthC(FAR));
    gl.uniform1f(u.uTintMix, this.tint ? 0.55 : 0);
    gl.uniform1f(u.uDropUnder, pass.aboveSea ? 1 : 0);
    const e = pass.camE;
    gl.uniform3f(u.uOcs, e[0], e[1], e[2] * A / B);
    gl.uniform1f(u.uC, outside(e));
    for (const t of this.draws) {
      // The big subtraction, in full precision, here and only here.
      gl.uniform3f(u.uOffset, t.centre[0] - pass.camE[0], t.centre[1] - pass.camE[1], t.centre[2] - pass.camE[2]);
      if (this.tint) gl.uniform3fv(u.uTint, ZOOM_TINT[t.z]);
      gl.bindVertexArray(t.vao);
      gl.drawElements(gl.TRIANGLES, t.count, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);
    return this.draws.length;
  }

  // Ground height at a latitude and longitude, from the finest tile held, on
  // the same triangles that are drawn. Null where nothing is held.
  heightAt(lat, lon) {
    for (let z = MAX_ZOOM; z >= ROOT_Z; z--) {
      const t = tileAt(lat, lon, z), x = Math.floor(t.x), y = Math.floor(t.y);
      const tile = this.tiles.get(z + '/' + x + '/' + y);
      if (tile) return nodeHeight(tile.nodes, t.x - x, t.y - y);
    }
    return null;
  }

  // The finest zoom drawn, for the status line.
  get finest() { return this.draws.reduce((m, t) => Math.max(m, t.z), 0); }
}
