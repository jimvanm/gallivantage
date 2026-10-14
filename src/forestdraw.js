// Drawing the forest: trees, their dots, and the dissolve between them. Shared by the Biome Lab and the app.
// What to draw comes from a ForestKeeper (src/forest.js); this keeps two lists made from it:
// - near: every tree within the trees' range, by shape (detailed close up, the style's far shape beyond), plus
//   the trees there that may already show as dots. Remade after 20 m of travel (more, the higher you are) or a turn.
// - far: every tile wholly past the trees' range, each its front share (the dots kept at that distance). Remade
//   after 300 m of travel or when tiles change, and drawn in one go.
// The ground (and the canopy on it) is the caller's.
//
// Trees and dots never shrink or grow at a handover: they share a fixed 4 x 4 pattern of pixels (forest.js's
// numbers decide each tree's own distances), the one leaving keeping fewer and the one arriving more.

import { BANDS, traceOutline, thinAt, dotBand, prefixBelow } from './forest.js';
import { KINDS as TREE_KINDS } from './biome.js';

const DITHER = `// The handover between a tree and its dot: a dissolve, not shrink-and-grow. Each takes a share of a fixed 4 x 4
// pattern of pixels: the one leaving keeps t..1 of it, the one arriving 0..t, so together they fill every pixel exactly
// once and neither changes size or moves. The pattern is shifted per tree (off), so neighbours do not dissolve in step.
float bayer(vec2 p){ ivec2 q=ivec2(mod(p,4.0)); int i=q.x+q.y*4;
  int m[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return (float(m[i])+0.5)/16.0; }
bool keepPx(vec3 k){ float t=fract(bayer(gl_FragCoord.xy)+k.z); return t>=k.x&&t<k.y; }`;

const TFS = `#version 300 es
precision highp float; in vec3 vRel; in vec3 vCol; flat in vec3 vKeep; uniform vec3 uSun,uSky; uniform float uFog; out vec4 o;
${DITHER}
void main(){ if(!keepPx(vKeep)) discard; vec3 n=cross(dFdx(vRel),dFdy(vRel)); float l=length(n); n=l>1e-9?n/l:vec3(0,1,0); if(dot(n,vRel)>0.0) n=-n;
  float lit=0.55+0.45*max(dot(n,uSun),0.0); vec3 c=floor(vCol*lit*31.0+0.5)/31.0;
  o=vec4(mix(c,uSky,1.0-exp(-length(vRel)*uFog)),1.0); }`;

const TVS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aCol; layout(location=2) in vec3 iPos; layout(location=3) in vec2 iSize; layout(location=4) in vec4 iMisc;
uniform mat4 uVP; uniform vec3 uEye; uniform float uRange; uniform float uShear; uniform float uFade0; out vec3 vRel; out vec3 vCol; flat out vec3 vKeep;
// A fixed number 0..1 for each spot, from its position (no random numbers: it never changes).
float spot(vec2 q){ vec3 p3=fract(vec3(q.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){ float h=iSize.x*0.01,w=iSize.y*0.01,a=iMisc.x*6.2831853,c=cos(a),s=sin(a);
  vec3 p=aPos*vec3(w,h,w);
  p.y+=p.x*(iMisc.z*2.0-1.0)*uShear;
  p=vec3(p.x*c-p.z*s,p.y,p.x*s+p.z*c);
  // Trees do not all end at one distance: each has its own end, somewhere between uFade0 of the range and the
  // range itself, so the forest thins out gradually instead of stopping at a ring that moves with you.
  // Vine rows (uShear 1) keep one end for the whole row.
  // Past its end it dissolves into its dot over 4% of the range (vines just dissolve away).
  vec2 cell=floor(iPos.xz*4.0);
  float d=distance(iPos.xz,uEye.xz), end=uShear>0.5?uRange*0.98:uRange*(uFade0+(0.98-uFade0)*spot(cell));   // done by the range's end
  float t=clamp((d-end)/(uRange*0.04)+0.5,0.0,1.0);
  vKeep=vec3(t,1.0,spot(cell+29.0));
  if(t>=1.0) p=vec3(0.0);                      // wholly gone: nothing to draw
  vec3 wp=iPos+p; vRel=wp-uEye; vec3 col=aCol*(0.8+0.4*iMisc.y); vCol=mix(col,col*vec3(1.15,1.08,0.7),iMisc.z*0.6*(1.0-uShear));
  gl_Position=uVP*vec4(wp,1.0); }`;

// Dots: what a tree becomes past its own end distance. Each style's dot is traced from its own far shape
// (forest.js traceOutline): its width and colour at 16 heights, so the dot keeps the far shape's outline (a spruce
// stays a point, a poplar a tall oval). One flat outline facing you, shaded across as if round; from above it
// becomes a round crown. Two triangles a tree.
const NSH_MAX = 128;
const DVS = `#version 300 es
layout(location=0) in vec2 aCorner; layout(location=2) in vec3 iPos; layout(location=3) in vec2 iSize; layout(location=4) in vec4 iMisc;
uniform mat4 uVP; uniform vec3 uEye,uRight,uUp; uniform float uRange,uFade0,uDot0,uDot1,uThin; uniform vec4 uShapeKind[${NSH_MAX / 4}];
out vec2 vQ; out vec3 vRel; out float vShade; out float vTop; flat out int vKind; flat out vec3 vKeep;
float spot(vec2 q){ vec3 p3=fract(vec3(q.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){ float h=iSize.x*0.01,w=iSize.y*0.01; vec2 cell=floor(iPos.xz*4.0);
  float d=distance(iPos.xz,uEye.xz);
  // It takes over from its tree (the same end, worked out the same way, sharing the pixels), and dissolves into the
  // canopy somewhere in the dots' own band.
  float e1=uRange*(uFade0+(0.98-uFade0)*spot(cell)), e2=uDot0+(uDot1-uDot0)*spot(cell+17.0);
  float tIn=clamp((d-e1)/(uRange*0.04)+0.5,0.0,1.0), tOut=clamp((d-e2)/max(100.0,uDot1*0.05)+0.5,0.0,1.0);
  // Past uThin, fewer and wider: only the trees whose facing number is below the share kept (the same ones the far
  // tiles were made with), each wider so together they cover the same ground; seen from the side a dot keeps its
  // tree's true height. Share: (uThin/d) cubed, at least 1/64.
  float keep=d<=uThin?1.0:max(1.0/64.0,pow(uThin/d,3.0));
  bool none=tIn<=tOut||floor(iMisc.x*255.0+0.5)>=keep*256.0;
  float grow=inversesqrt(keep);
  int s=int(iMisc.w*255.0+0.5); vKind=int(uShapeKind[s/4][s%4]+0.5);
  vec3 mid=iPos+vec3(0.0,h*0.5,0.0); float top=abs(normalize(mid-uEye).y);
  float across=w*grow, up=mix(h,across,top);    // from the side its tree's height; from above as wide as it is
  vec3 wp=mid+(uRight*(aCorner.x-0.5)*across+uUp*(aCorner.y-0.5)*up)*(none?0.0:1.0);
  vQ=aCorner; vTop=top; vRel=wp-uEye; vShade=0.8+0.4*iMisc.y; vKeep=vec3(tOut,tIn,spot(cell+29.0));
  gl_Position=uVP*vec4(wp,1.0); }`;
const DFS = `#version 300 es
precision highp float; in vec2 vQ; in vec3 vRel; in float vShade; in float vTop; flat in int vKind; flat in vec3 vKeep;
uniform vec4 uHW[${8 * BANDS / 4}]; uniform vec3 uBandCol[${8 * BANDS}]; uniform vec3 uSun,uSky,uRight,uUp; uniform float uFog; out vec4 o;
${DITHER}
float hwAt(int i){ return uHW[i/4][i%4]; }
void main(){ if(!keepPx(vKeep)) discard;
  float y=clamp(vQ.y,0.0,0.9999)*${BANDS}.0-0.5; int b0=int(clamp(floor(y),0.0,${BANDS - 1}.0)), b1=min(b0+1,${BANDS - 1}); float f=clamp(y-float(b0),0.0,1.0);
  int k=vKind*${BANDS}; float hw=mix(hwAt(k+b0),hwAt(k+b1),f), wmax=0.0;
  for(int i=0;i<${BANDS};i++) wmax=max(wmax,hwAt(k+i));
  float lim=mix(hw,wmax*sqrt(max(0.0,1.0-pow(vQ.y*2.0-1.0,2.0))),vTop);   // from above: a round crown
  float x=vQ.x-0.5; if(abs(x)>lim||lim<=0.0) discard;
  float nx=x/max(lim,1e-4);
  vec3 n=normalize(uRight*nx*0.85+uUp*0.2-normalize(vRel)*sqrt(max(0.0,1.0-nx*nx)));
  vec3 col=mix(uBandCol[k+b0],uBandCol[k+b1],f)*vShade;
  float lit=0.55+0.45*max(dot(n,uSun),0.0); vec3 c=floor(col*lit*31.0+0.5)/31.0;
  o=vec4(mix(c,uSky,1.0-exp(-length(vRel)*uFog)),1.0); }`;

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); }
  gl.linkProgram(p); return p;
}

// lib: the library's shapes, trees and farm together ({ id: { pos, col, idx } }).
export function createForestDrawer(gl, lib) {
  // ---- shapes: every one scaled to unit height and width, so one program stretches it to each tree's size ----
  const KINDS = TREE_KINDS.map((k) => { const stages = []; for (let i = 1; lib[`${k}-${i}`]; i++) stages.push(`${k}-${i}`); return { key: k, stages, far: `${k}-far` }; });
  for (const len of [10, 3, 1]) KINDS.push({ key: `vine${len}`, stages: [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => `vine-${len}-${i}${j}`)), far: `vine-${len}-far`, row: true });
  KINDS.push({ key: 'vinecap', stages: [1, 2, 3].map((n) => `vine-cap-${n}`), far: null, row: true });
  const K = Object.fromEntries(KINDS.map((k, i) => [k.key, i]));
  const P = [], C = [], I = [], SHAPES = [];
  // ref: use another shape's size (a row piece's far shape must fill exactly the same metres as its near one).
  function pack(id, ref) {
    const m = lib[id]; let H = 0, W = 0;
    for (let i = 0; i < m.pos.length; i += 3) { H = Math.max(H, m.pos[i + 1]); W = Math.max(W, Math.abs(m.pos[i]), Math.abs(m.pos[i + 2])); }
    W *= 2; if (ref) { H = ref.H; W = ref.W; }
    const base = P.length / 3, first = I.length;
    for (let i = 0; i < m.pos.length; i += 3) P.push(m.pos[i] / W, m.pos[i + 1] / H, m.pos[i + 2] / W);
    C.push(...m.col); for (const x of m.idx) I.push(x + base);
    return { id, first, count: m.idx.length, H, W };
  }
  KINDS.forEach((k, ki) => {
    k.shapes = k.stages.map((id) => { const s = pack(id); s.kind = ki; SHAPES.push(s); s.n = SHAPES.length - 1; return s; });
    const f = k.far ? pack(k.far, k.row ? k.shapes[k.shapes.length - 1] : null) : { first: 0, count: 0 };
    k.farFirst = f.first; k.farCount = f.count;
  });
  const NSH = SHAPES.length, NB = NSH + KINDS.length, SHAPE_KIND = new Uint8Array(SHAPES.map((s) => s.kind));
  if (NSH > NSH_MAX) throw new Error('too many shapes for the dots');

  // ---- programs and buffers ----
  const TP = program(gl, TVS, TFS), DP = program(gl, DVS, DFS);
  const UT = Object.fromEntries(['uVP', 'uEye', 'uRange', 'uSun', 'uSky', 'uFog', 'uShear', 'uFade0'].map((n) => [n, gl.getUniformLocation(TP, n)]));
  const UD = Object.fromEntries(['uVP', 'uEye', 'uRight', 'uUp', 'uRange', 'uFade0', 'uDot0', 'uDot1', 'uThin', 'uShapeKind', 'uHW', 'uBandCol', 'uSun', 'uSky', 'uFog'].map((n) => [n, gl.getUniformLocation(DP, n)]));
  {
    const kinds = new Float32Array(NSH_MAX), hw = new Float32Array(8 * BANDS), col = new Float32Array(8 * BANDS * 3);
    SHAPES.forEach((sh, i) => { kinds[i] = Math.min(7, sh.kind); });
    TREE_KINDS.forEach((k, i) => { const d = traceOutline(lib[`${k}-far`]); hw.set(d.hw, i * BANDS); col.set(d.col, i * BANDS * 3); });
    gl.useProgram(DP); gl.uniform4fv(UD.uShapeKind, kinds); gl.uniform4fv(UD.uHW, hw); gl.uniform3fv(UD.uBandCol, col);
  }
  const ibuf = gl.createBuffer(), fbuf = gl.createBuffer();
  const tvao = gl.createVertexArray(); gl.bindVertexArray(tvao);
  {
    const NV = P.length / 3, buf = new ArrayBuffer(NV * 16), f = new Float32Array(buf), b = new Uint8Array(buf);
    for (let i = 0; i < NV; i++) { f[i * 4] = P[i * 3]; f[i * 4 + 1] = P[i * 3 + 1]; f[i * 4 + 2] = P[i * 3 + 2]; b[i * 16 + 12] = C[i * 3]; b[i * 16 + 13] = C[i * 3 + 1]; b[i * 16 + 14] = C[i * 3 + 2]; b[i * 16 + 15] = 255; }
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.UNSIGNED_BYTE, true, 16, 12);
    const e = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, e); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(I), gl.STATIC_DRAW);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); for (const l of [2, 3, 4]) { gl.enableVertexAttribArray(l); gl.vertexAttribDivisor(l, 1); }
  gl.bindVertexArray(null);
  const dvao = gl.createVertexArray(); gl.bindVertexArray(dvao);
  {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);   // corners 0..1, as the dot program reads them
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); for (const l of [2, 3, 4]) { gl.enableVertexAttribArray(l); gl.vertexAttribDivisor(l, 1); }
  }
  gl.bindVertexArray(null);

  // ---- the near list ----
  const DOTS = NB;                 // the last bin: every tree that may be showing as a dot
  const lists = { count: new Uint32Array(NB + 1), start: new Uint32Array(NB + 1) };
  let inst = new Uint8Array(0), inst32 = new Uint32Array(0), lastBuild = null, lastBuildT = 0;
  const stats = { rebuildMs: 0, farMs: 0, farCount: 0, lists, DOTS, NSH, NB, gaps: 0, gapFrames: 0, short: 0, shortFrames: 0 };
  let nearSet = new Set(), farSet = new Set(), lastEye = null, speed = 0;
  // eye: [x, height, z]; agl: metres above the ground; keeper: a ForestKeeper; V: the distances; show: { trees, vines, dots }.
  // spare: how far you may travel before the next remake (by height, and by speed over a quarter second, since a
  // remake can wait up to 0.15 s). Everything that may need drawing within that much travel goes in the lists.
  function rebuild(eye, yaw, hfov, pitch, spare, now, keeper, V, show) {
    const key = `${V.range}|${V.near}|${show.trees}|${show.vines}|${show.dots}|${V.dotRange}|${V.fade}|${V.thinFrom}`;
    const moved = !lastBuild || lastBuild.k !== key || Math.hypot(eye[0] - lastBuild.x, eye[1] - lastBuild.y, eye[2] - lastBuild.z) > spare * 0.8 || Math.abs(yaw - lastBuild.yaw) > 0.12 || Math.abs(pitch - lastBuild.pitch) > 0.12;
    if (!moved && !(keeper.dirty && now - lastBuildT > 150)) return;
    if (lastBuild && lastBuild.k !== key) keeper.farDirty = true;
    const t0 = performance.now(), R = V.range, RS = R + spare, R2 = RS * RS, NR2 = V.near * V.near, vx = Math.sin(yaw), vz = -Math.cos(yaw), cull = pitch > -0.85, half = hfov / 2 + 0.15;
    const dots = show.dots && show.trees, F2 = Math.max(0, V.fade * R - R * 0.05 - spare) ** 2;
    const chosen = [];
    for (const b of keeper.live.values()) {
      if (b.tree ? !show.trees : !show.vines) continue;
      const mx = b.cx - eye[0], mz = b.cz - eye[2], d = Math.hypot(mx, mz);
      // tiles wholly past the trees' range belong to the far list; note when one changes sides
      const far = b.tree && d - b.rad > R;
      if (b.far !== far) { b.far = far; keeper.farDirty = true; }
      // Past the range a tile's dots come from the far list, but only once the far list holds it: until then it stays
      // here, so its square of forest never blinks to bare ground for the moment in between.
      if (d - b.rad > RS && (!b.tree || farSet.has(b))) continue;
      if (cull && d > b.rad * 1.5 && Math.acos(Math.max(-1, Math.min(1, (mx * vx + mz * vz) / d))) > half + Math.asin(Math.min(1, b.rad / d))) continue;
      chosen.push([b, d, b.tree]);
    }
    nearSet = new Set(chosen.map((c) => c[0]));
    chosen.sort((a, b) => a[1] - b[1]);             // nearest first, so the card skips hidden pixels
    const cnt = new Uint32Array(NB + 1);
    const bin = (u8, i, d2) => { const s = u8[i * 20 + 19]; return d2 < NR2 ? s : NSH + SHAPE_KIND[s]; };
    // A tree past where trees start turning into dots may show as either, so it goes to both lists; the card decides.
    // Past thinFrom only the share of trees kept as dots goes in.
    const isDot = (u8, i, d2) => d2 > F2 && u8[i * 20 + 16] < thinAt(Math.max(1, Math.sqrt(d2) - spare), V) * 256;
    for (const [b, , tree] of chosen) {
      const f = new Float32Array(b.u8.buffer, b.u8.byteOffset, b.n * 5);
      for (let i = 0; i < b.n; i++) { const dx = f[i * 5] - eye[0], dy = f[i * 5 + 1] - eye[1], dz = f[i * 5 + 2] - eye[2], d2 = dx * dx + dz * dz; if (d2 <= R2) cnt[bin(b.u8, i, d2 + dy * dy)]++; if (tree && dots && isDot(b.u8, i, d2)) cnt[DOTS]++; }
    }
    const starts = new Uint32Array(NB + 1); let tot = 0; for (let k = 0; k <= NB; k++) { starts[k] = tot; tot += cnt[k]; }
    if (inst.length < tot * 20) { inst = new Uint8Array(Math.ceil(Math.max(tot * 20, inst.length * 1.5, 2000) / 20) * 20); inst32 = new Uint32Array(inst.buffer); }
    const w = starts.slice();
    const copy = (src, i, j) => { const a = i * 5, o = j * 5; inst32[o] = src[a]; inst32[o + 1] = src[a + 1]; inst32[o + 2] = src[a + 2]; inst32[o + 3] = src[a + 3]; inst32[o + 4] = src[a + 4]; };
    for (const [b, , tree] of chosen) {
      const f = new Float32Array(b.u8.buffer, b.u8.byteOffset, b.n * 5);
      for (let i = 0; i < b.n; i++) {
        const dx = f[i * 5] - eye[0], dy = f[i * 5 + 1] - eye[1], dz = f[i * 5 + 2] - eye[2], d2 = dx * dx + dz * dz;
        if (d2 <= R2) copy(b.u32, i, w[bin(b.u8, i, d2 + dy * dy)]++);
        if (tree && dots && isDot(b.u8, i, d2)) copy(b.u32, i, w[DOTS]++);
      }
    }
    lists.count.set(cnt); lists.start.set(starts);
    gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); gl.bufferData(gl.ARRAY_BUFFER, inst.subarray(0, tot * 20), gl.DYNAMIC_DRAW);
    stats.rebuildMs = performance.now() - t0; lastBuild = { k: key, x: eye[0], y: eye[1], z: eye[2], yaw, pitch }; lastBuildT = now; keeper.dirty = false;
  }

  // ---- the far list ----
  let farTiles = [], farInst = new Uint8Array(0), farAt = null, farT = 0;
  function buildFar(eye, now, keeper, V, show, reachM) {
    const movedFar = !farAt || Math.hypot(eye[0] - farAt[0], eye[2] - farAt[1]) > 300;
    if (!movedFar && !(keeper.farDirty && now - farT > 250)) return;
    const t0 = performance.now(), R = V.range;
    farTiles = []; let tot = 0;
    if (show.dots && show.trees) for (const b of keeper.live.values()) {
      if (!b.tree) continue;
      const d = Math.hypot(b.cx - eye[0], b.cz - eye[2]);
      if (d - b.rad <= R || d - b.rad > reachM) continue;
      const n = prefixBelow(b, thinAt(Math.max(1, d - b.rad - 300), V));
      if (n) { farTiles.push({ b, n, start: tot }); tot += n; }
    }
    farTiles.sort((p, q) => Math.hypot(p.b.cx - eye[0], p.b.cz - eye[2]) - Math.hypot(q.b.cx - eye[0], q.b.cz - eye[2]));
    tot = 0; for (const t of farTiles) { t.start = tot; tot += t.n; }
    if (farInst.length < tot * 20) farInst = new Uint8Array(Math.max(tot * 20, farInst.length * 1.5 | 0, 2000));
    for (const t of farTiles) farInst.set(t.b.u8.subarray(0, t.n * 20), t.start * 20);
    gl.bindBuffer(gl.ARRAY_BUFFER, fbuf); gl.bufferData(gl.ARRAY_BUFFER, farInst.subarray(0, tot * 20), gl.STATIC_DRAW);
    farSet = new Set(farTiles.map((t) => t.b));
    stats.farCount = tot; farAt = [eye[0], eye[2]]; farT = now; keeper.farDirty = false; stats.farMs = performance.now() - t0;
  }

  // A check that should always find nothing: held tiles in view, past the trees' range and within reach, that are in
  // neither list this frame (their square of forest would blink to bare ground).
  function countGaps(u) {
    if (!(u.show.dots && u.show.trees)) { stats.gaps = 0; return; }
    const R = u.V.range, vx = Math.sin(u.yaw), vz = -Math.cos(u.yaw), half = u.hfov / 2 + 0.15, cull = u.pitch > -0.85;
    let g = 0, sh = 0;
    for (const b of u.keeper.live.values()) {
      if (!b.tree) continue;
      const mx = b.cx - u.eye[0], mz = b.cz - u.eye[2], d = Math.hypot(mx, mz);
      // short: the tile holds fewer trees than its nearest dots need now (its square shows sparser than its neighbours)
      if (d - b.rad <= u.reach && b.keep < thinAt(Math.max(1, d - b.rad), u.V) * 0.999 && d - b.rad > u.V.fade * R) sh++;
      // inside the range: it must be in the near list (it may hold trees still to be drawn)
      if (d - b.rad <= R) {
        const inView = !cull || d < b.rad * 1.5 || Math.acos(Math.max(-1, Math.min(1, (mx * vx + mz * vz) / d))) <= half + Math.asin(Math.min(1, b.rad / d));
        if (inView && !nearSet.has(b)) g++;
        continue;
      }
      if (d - b.rad > u.reach) continue;
      if (cull && d > b.rad * 1.5 && Math.acos(Math.max(-1, Math.min(1, (mx * vx + mz * vz) / d))) > half + Math.asin(Math.min(1, b.rad / d))) continue;
      if (!nearSet.has(b) && !farSet.has(b) && prefixBelow(b, thinAt(Math.max(1, d - b.rad - 300), u.V)) > 0) g++;
    }
    stats.gaps = g; if (g) stats.gapFrames++;
    stats.short = sh; if (sh) stats.shortFrames++;
  }

  // ---- drawing ----
  // f: { vp, eye, fwd, V, show, sun, sky, fog }. Returns { calls, tris }.
  function draw(f) {
    const { vp, eye, fwd, V, sun, sky, fog } = f;
    let calls = 0, tris = 0;
    gl.useProgram(TP); gl.bindVertexArray(tvao); gl.uniformMatrix4fv(UT.uVP, false, vp); gl.uniform3fv(UT.uEye, eye); gl.uniform1f(UT.uRange, V.range); gl.uniform1f(UT.uFade0, V.fade); gl.uniform3fv(UT.uSun, sun); gl.uniform3fv(UT.uSky, sky); gl.uniform1f(UT.uFog, fog);
    gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
    for (let k = 0; k < NB; k++) {
      const n = lists.count[k]; if (!n) continue; const o = lists.start[k] * 20;
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 20, o); gl.vertexAttribPointer(3, 2, gl.UNSIGNED_SHORT, false, 20, o + 12); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, 20, o + 16);
      const first = k < NSH ? SHAPES[k].first : KINDS[k - NSH].farFirst, count = k < NSH ? SHAPES[k].count : KINDS[k - NSH].farCount;
      if (!count) continue;
      gl.uniform1f(UT.uShear, KINDS[k < NSH ? SHAPE_KIND[k] : k - NSH].row ? 1 : 0);
      gl.drawElementsInstanced(gl.TRIANGLES, count, gl.UNSIGNED_INT, first * 4, n); calls++; tris += n * count / 3;
    }
    if (lists.count[DOTS] || farTiles.length) {
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const r0 = cross(fwd, [0, 1, 0]), rl = Math.hypot(...r0) || 1, right = r0.map((v) => v / rl), up = cross(right, fwd), [d0, d1] = dotBand(V);
      gl.useProgram(DP); gl.bindVertexArray(dvao);
      gl.uniformMatrix4fv(UD.uVP, false, vp); gl.uniform3fv(UD.uEye, eye); gl.uniform3fv(UD.uRight, right); gl.uniform3fv(UD.uUp, up);
      gl.uniform1f(UD.uRange, V.range); gl.uniform1f(UD.uFade0, V.fade); gl.uniform1f(UD.uDot0, d0); gl.uniform1f(UD.uDot1, d1); gl.uniform1f(UD.uThin, V.thinFrom);
      gl.uniform3fv(UD.uSun, sun); gl.uniform3fv(UD.uSky, sky); gl.uniform1f(UD.uFog, fog);
      const point = (buf, o) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 20, o); gl.vertexAttribPointer(3, 2, gl.UNSIGNED_SHORT, false, 20, o + 12); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, 20, o + 16); };
      if (lists.count[DOTS]) { point(ibuf, lists.start[DOTS] * 20); gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, lists.count[DOTS]); calls++; tris += lists.count[DOTS] * 2; }
      // the far list in one go, nearest tiles first (the card drops what is out of view cheaply: four corners a dot)
      if (stats.farCount) { point(fbuf, 0); gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, stats.farCount); calls++; tris += stats.farCount * 2; }
    }
    return { calls, tris };
  }

  return {
    KINDS, K, SHAPES, stats,
    styles: TREE_KINDS.map((_, i) => KINDS[i].shapes),                               // for forest.js makeTrees
    pieceShape: (len, from, to) => KINDS[K[`vine${len}`]].shapes[from * 3 + to],      // for forest.js makeVines
    capShape: (outline) => KINDS[K.vinecap].shapes[outline],
    // Remake the lists if needed. u: { eye, yaw, pitch, hfov, agl, now, keeper, V, show, reach }.
    // debug.freeze: keep the lists as they are (to see what shows just before a remake); debug.fresh: remake every frame.
    debug: { freeze: false, fresh: false },
    update(u) {
      if (this.debug.fresh) { lastBuild = null; farAt = null; }
      // speed, smoothed over about half a second
      if (lastEye) { const dt = Math.max(1e-3, (u.now - lastEye[3]) / 1000), v = Math.hypot(u.eye[0] - lastEye[0], u.eye[1] - lastEye[1], u.eye[2] - lastEye[2]) / dt; speed += (Math.min(v, 1e5) - speed) * Math.min(1, dt * 2); }
      lastEye = [u.eye[0], u.eye[1], u.eye[2], u.now];
      const spare = Math.max(20, 0.15 * u.agl, speed * 0.25) + 10;
      stats.spare = spare;
      if (!this.debug.freeze) { rebuild(u.eye, u.yaw, u.hfov, u.pitch, spare, u.now, u.keeper, u.V, u.show); buildFar(u.eye, u.now, u.keeper, u.V, u.show, u.reach); }
      countGaps(u);
    },
    draw,
  };
}
