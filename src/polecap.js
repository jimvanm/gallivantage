// Caps over the poles.
//
// The height and map tiles stop at 85.05 degrees north and south (that is
// where the web map's square world ends), so on the round Earth there is a
// hole at each pole, and through it you saw the inside of the far side. Each
// hole gets a cap: a disc filling it exactly, its edge at the height of the
// ground round it (sampled from the loaded tiles, a little below so the tiles
// win where the two meet).
//
// On it, a compass card in the colours of the app's own compass: every degree
// ticked, longer at 5 and 10, numbered every 10. At a pole every direction is
// south, so the degrees are degrees of LONGITUDE, labelled the standard way:
// 0 at Greenwich, then east and west to 180 (the E and W smaller than the
// numbers). Seen from above the North Pole, east runs anticlockwise; at the
// South Pole, clockwise. Meridians every 30 degrees and the circles of 87 and
// 89 degrees inside. Cosmetic on purpose: here the data ends.
//
// Drawn with its own small textured program, placed at the pole like any
// other patch (globe.js).

import * as G from './gl.js';
import { ecef, axesAt, viewOf } from './globe.js';
import { latToMercY, lonToMercX } from './geo.js';

export const EDGE = 85.05112878;      // degrees: where the tiles stop
const RINGS = 48, SECTORS = 360;      // the disc's mesh: a polar grid
const TUCK = 30;                      // metres the cap sits below the ground at its edge
const RIM_EVERY = 1;                  // degrees of longitude between ground samples
const CARD = 2048;                    // pixels across the compass card picture
const CARD_R = 0.5 * 0.985;           // the card's radius, as a fraction of the picture

// Where on the card picture (0..1 across and down) a point of the cap is:
// r 0 at the pole, 1 at the edge; lon in degrees. Laid out so that, seen
// from above the pole, the picture is not mirrored.
export function cardUV(sign, r, lon) {
  const a = lon * Math.PI / 180;
  return [0.5 - sign * CARD_R * r * Math.sin(a), 0.5 - CARD_R * r * Math.cos(a)];
}

// The cap's mesh, in the pole's own axes: x, y, z, u, v per point.
// sign: 1 north, -1 south. rim: ground heights round the edge, one per
// RIM_EVERY degrees of longitude.
export function buildCap(sign, rim) {
  const pole = sign * 90, O = ecef(pole, 0, 0), ax = axesAt(pole, 0);
  const mid = rim.reduce((a, h) => a + h, 0) / rim.length;
  const rimAt = (lon) => {
    const f = (((lon % 360) + 360) % 360) / RIM_EVERY, i = Math.floor(f) % rim.length, t = f - Math.floor(f);
    return rim[i] * (1 - t) + rim[(i + 1) % rim.length] * t;
  };
  const V = (RINGS + 1) * (SECTORS + 1), data = new Float32Array(V * 5), p = [0, 0, 0];
  let k = 0;
  for (let i = 0; i <= RINGS; i++) {
    const r = i / RINGS, lat = sign * (90 - r * (90 - EDGE));
    for (let j = 0; j <= SECTORS; j++) {
      const lon = j * 360 / SECTORS;
      ecef(lat, lon, mid + (rimAt(lon) - mid) * r - TUCK, p);
      const d0 = p[0] - O[0], d1 = p[1] - O[1], d2 = p[2] - O[2];
      for (let q = 0; q < 3; q++) data[k++] = ax[q][0] * d0 + ax[q][1] * d1 + ax[q][2] * d2;
      const uv = cardUV(sign, r, lon);
      data[k++] = uv[0]; data[k++] = uv[1];
    }
  }
  const idx = new Uint32Array(RINGS * SECTORS * 6);
  let o = 0;
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SECTORS; j++) {
      const a = i * (SECTORS + 1) + j, b = a + 1, c = a + SECTORS + 1, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
    }
  }
  return { data, indices: idx, verts: V };
}

// How a longitude is written: '0', '180', or the number with E or W.
export const lonLabel = (d) => ({ num: String(d <= 180 ? d : 360 - d), dir: d === 0 || d === 180 ? '' : d < 180 ? 'E' : 'W' });

// The compass card, drawn once per pole on a canvas, in the colours of the
// app's compass (index.html, #compass). Shown to Jim and agreed 9 October.
export function drawCard(cv, sign) {
  const cx = cv.getContext('2d'), S = cv.width, C = S / 2, R = S * CARD_R;
  const at = (r, lon) => { const uv = cardUV(sign, r, lon); return [uv[0] * S, uv[1] * S]; };
  // Turn so text stands upright when read from the middle (its foot toward the pole).
  const turn = (lon) => Math.atan2(at(1, lon)[0] - C, C - at(1, lon)[1]);
  const MONO = 'ui-monospace, monospace';
  cx.fillStyle = '#4a5666'; cx.fillRect(0, 0, S, S);
  cx.fillStyle = '#141b26';
  cx.beginPath(); cx.arc(C, C, R, 0, 2 * Math.PI); cx.fill();
  cx.strokeStyle = '#4a5666'; cx.lineWidth = S * 0.006;
  cx.beginPath(); cx.arc(C, C, R * 0.995, 0, 2 * Math.PI); cx.stroke();
  // Inside: meridians every 30 degrees, circles of 87 and 89.
  cx.strokeStyle = 'rgba(201,212,224,0.35)'; cx.lineWidth = S * 0.0022;
  for (let d = 0; d < 360; d += 30) {
    const [x0, y0] = at(0.06, d), [x1, y1] = at(0.74, d);
    cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
  }
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.font = `${Math.round(S * 0.018)}px ${MONO}`; cx.fillStyle = 'rgba(232,238,245,0.7)';
  for (const lat of [87, 89]) {
    const r = (90 - lat) / (90 - EDGE);
    cx.beginPath(); cx.arc(C, C, R * r, 0, 2 * Math.PI); cx.stroke();
    const [x, y] = at(r + 0.035, 15);
    cx.save(); cx.translate(x, y); cx.rotate(turn(15)); cx.fillText(`${lat}°${sign > 0 ? 'N' : 'S'}`, 0, 0); cx.restore();
  }
  // The ring: every degree ticked, longer at 5, longest at 10.
  for (let d = 0; d < 360; d++) {
    const ten = d % 10 === 0, five = d % 5 === 0;
    cx.strokeStyle = ten ? '#ffffff' : '#c9d4e0';
    cx.lineWidth = S * (ten ? 0.0034 : five ? 0.0026 : 0.0017);
    const [x0, y0] = at(ten ? 0.865 : five ? 0.9 : 0.93, d), [x1, y1] = at(0.985, d);
    cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1, y1); cx.stroke();
  }
  // Numbers every 10 degrees: the number full size, the E or W smaller beside
  // it on the same baseline; Greenwich, 90E, 180 and 90W in amber.
  for (let d = 0; d < 360; d += 10) {
    const quarter = d % 90 === 0, { num, dir } = lonLabel(d);
    const [x, y] = at(0.8, d);
    const big = Math.round(S * (quarter ? 0.032 : 0.024)), small = Math.round(big * 0.62), gap = big * 0.06;
    cx.save(); cx.translate(x, y); cx.rotate(turn(d));
    cx.fillStyle = quarter ? '#ffd479' : '#e8eef5';
    cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
    cx.font = `${big}px ${MONO}`; const wn = cx.measureText(num).width;
    cx.font = `${small}px ${MONO}`; const wd = dir ? cx.measureText(dir).width + gap : 0;
    const x0 = -(wn + wd) / 2, base = big * 0.36;
    cx.font = `${big}px ${MONO}`; cx.fillText(num, x0, base);
    if (dir) { cx.font = `${small}px ${MONO}`; cx.fillText(dir, x0 + wn + gap, base); }
    cx.restore();
  }
  // The middle.
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillStyle = '#ffd479';
  cx.font = `${Math.round(S * 0.04)}px ${MONO}`;
  cx.fillText(sign > 0 ? '90°N' : '90°S', C, C - S * 0.03);
  cx.fillStyle = 'rgba(232,238,245,0.7)';
  cx.font = `${Math.round(S * 0.016)}px ${MONO}`;
  cx.fillText('NO DATA PAST 85°', C, C + S * 0.03);
  cx.fillText('DEGREES ARE LONGITUDE', C, C + S * 0.055);
}

const VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUV;
uniform mat4 uProj, uView;
uniform mat3 uRot;
uniform vec3 uOrigin;
out vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = uProj * uView * vec4(uRot * aPos + uOrigin, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uCard;
out vec4 frag;
void main() { frag = vec4(texture(uCard, vUV).rgb, 1.0); }`;

export class PoleCaps {
  constructor(gl) {
    this.gl = gl;
    this.prog = G.program(gl, VS, FS);
    this.u = G.uniforms(gl, this.prog, ['uProj', 'uView', 'uRot', 'uOrigin', 'uCard']);
    this.caps = [1, -1].map((sign) => ({ sign, rim: null, vao: null, vbo: null, ibo: null, count: 0, tex: null }));   // tex: null not tried yet
    this.next = 0;
    this.at = { rot: new Float32Array(9), org: [0, 0, 0] };
  }

  // The card as a texture. Needs a page (a canvas); null without one.
  _card(sign) {
    const gl = this.gl;
    if (typeof document === 'undefined' || !document.createElement) return null;
    const cv = document.createElement('canvas');
    if (!cv.getContext || !cv.getContext('2d')) return null;
    cv.width = cv.height = CARD;
    // A cap is a nicety: if the picture cannot be drawn here, go without it.
    try { drawCard(cv, sign); } catch (e) { return null; }
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const an = gl.getExtension && gl.getExtension('EXT_texture_filter_anisotropic');
    if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t;
  }

  // Once a second: sample the ground round each edge, and rebuild a cap
  // whose edge no longer matches it (finer tiles arrived, or the first ones).
  // groundAt(mercX, mercY): height or null.
  update(now, groundAt) {
    if (now < this.next) return;
    this.next = now + 1000;
    const gl = this.gl;
    for (const c of this.caps) {
      const y = latToMercY(c.sign * (EDGE - 0.01));
      const rim = [];
      for (let lon = 0; lon < 360; lon += RIM_EVERY) {
        const h = groundAt(lonToMercX(lon > 180 ? lon - 360 : lon), y);
        rim.push(h === null || h === undefined ? 0 : h);
      }
      if (c.rim && rim.every((h, i) => Math.abs(h - c.rim[i]) < 20)) continue;
      c.rim = rim;
      const m = buildCap(c.sign, rim);
      if (!c.vao) { c.vao = gl.createVertexArray(); c.vbo = gl.createBuffer(); c.ibo = gl.createBuffer(); }
      gl.bindVertexArray(c.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, c.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, m.data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      c.count = m.indices.length;
      if (c.tex === null) c.tex = this._card(c.sign) || false;     // false: tried, no picture here
    }
  }

  // Draws the caps that could be in sight. cam: { lat, alt }.
  draw(pass, cam) {
    const gl = this.gl, u = this.u;
    const horizon = Math.acos(6371000 / (6371000 + Math.max(0, cam.alt))) * 180 / Math.PI;
    let used = false;
    for (const c of this.caps) {
      if (!c.count || !c.tex) continue;
      if (90 - c.sign * cam.lat > horizon + 6) continue;      // over the curve from here
      if (!used) {
        gl.useProgram(this.prog);
        gl.uniformMatrix4fv(u.uProj, false, pass.proj);
        gl.uniformMatrix4fv(u.uView, false, pass.view);
        gl.uniform1i(u.uCard, 0);
        used = true;
      }
      viewOf(pass).place(c.sign * 90, 0, 0, this.at);
      gl.uniformMatrix3fv(u.uRot, false, this.at.rot);
      gl.uniform3f(u.uOrigin, this.at.org[0], this.at.org[1], this.at.org[2]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, c.tex);
      gl.bindVertexArray(c.vao);
      gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
  }
}
