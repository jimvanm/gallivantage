// Round Earth lab: the ground of the whole world laid on the ball, with the
// sea and the sky, from standing height to geostationary height.
//
// Uses the app's own layers (src/), as every lab must.

import { BUILD } from '../src/version.js';
import { Camera, EYE } from '../src/moving/camera.js';
import { Globe } from '../src/drawing/globe.js';
import { Sea } from '../src/drawing/sea.js';
import { perspective, viewTurn, viewPlanes, FOV } from '../src/drawing/view.js';
import { localFrame } from '../src/geo/earth.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const fail = (msg) => { $('error').textContent = msg; $('error').style.display = 'block'; throw new Error(msg); };
const gl = canvas.getContext('webgl2', { antialias: true });
if (!gl) fail('This browser has no WebGL2, which the lab needs.');
$('ver').textContent = 'Gallivantage ' + BUILD;
const DEPTH_BITS = gl.getParameter(gl.DEPTH_BITS);     // how finely this graphics card keeps depth

// Places to test from. Each tests something: walking height, low flying,
// cruise height, the edge of space, orbit, the 85-degree edge of the data,
// and the date line.
const PLACES = [
  ['Standing at Moraine Lake', { lat: 51.3217, lon: -116.1860, agl: EYE, heading: 160, tilt: 4 }],
  ['Low over the Grand Canyon', { lat: 36.0544, lon: -112.1401, agl: 900, heading: 10, tilt: -12 }],
  ['Airliner height over the Rockies', { lat: 50.9, lon: -116.4, agl: 10500, heading: 300, tilt: -8 }],
  ['100 km up: the Great Lakes', { lat: 43.0, lon: -79.0, agl: 100000, heading: 290, tilt: -25 }],
  ['Space station height: Gulf of St. Lawrence', { lat: 47.0, lon: -60.0, agl: 410000, heading: 300, tilt: -15 }],
  ['2,000 km up over Canada', { lat: 58, lon: -96, agl: 2000000, heading: 0, tilt: -90 }],
  ['Geostationary: 36,000 km', { lat: 0, lon: -80, agl: 35786000, heading: 0, tilt: -90 }],
  ['The edge of the data: 85 degrees north', { lat: 82.5, lon: -62, agl: 400000, heading: 0, tilt: -30 }],
  ['The date line, over Fiji', { lat: -17.6, lon: 179.6, agl: 60000, heading: 0, tilt: -35 }],
];

// ---- the world ------------------------------------------------------------------
const globe = new Globe(gl);
const sea = new Sea(gl);
const ground = (lat, lon) => globe.heightAt(lat, lon);
const cam = new Camera(readHash() || { lat: 51.3217, lon: -116.186, h: 3000, heading: 160, tilt: -10 });
let wantAgl = null;            // a height asked for before the ground under it had loaded
window.lab = { cam, globe, sea, goTo };     // for poking at from the browser's console

function goTo(p) {
  Object.assign(cam, { lat: p.lat, lon: p.lon, heading: p.heading, tilt: p.tilt, fly: p.agl > EYE + 0.5 });
  const g = ground(p.lat, p.lon);
  cam.h = (g === null ? 0 : g) + p.agl;
  wantAgl = cam.fly ? p.agl : null;     // kept until finer ground arrives (see frame())
}

// ---- the panel ------------------------------------------------------------------
for (const [name, p] of PLACES) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => goTo(p);
  $('places').appendChild(b);
}
// Height slider: 1.7 m to 40,000 km, spread by the logarithm. Moving it
// above standing height starts you flying.
const H0 = Math.log(EYE), H1 = Math.log(4e7);
const toSlider = (agl) => Math.round((Math.log(Math.max(EYE, agl)) - H0) / (H1 - H0) * 1000);
const fromSlider = (v) => Math.exp(H0 + v / 1000 * (H1 - H0));
$('height').oninput = (e) => {
  const g = ground(cam.lat, cam.lon), agl = fromSlider(+e.target.value);
  cam.h = (g === null ? 0 : g) + agl;
  cam.fly = cam.fly || agl > EYE + 0.5;
  wantAgl = null;
};
$('detail').value = globe.detailPx;
$('detailText').textContent = globe.detailPx;
$('detail').oninput = (e) => { globe.detailPx = +e.target.value; $('detailText').textContent = e.target.value; };
for (let z = 8; z <= 15; z++) $('maxZ').add(new Option(String(z), String(z), false, z === globe.maxZ));
$('maxZ').onchange = (e) => { globe.maxZ = +e.target.value; };
$('tint').onchange = (e) => { globe.tint = e.target.checked; };
$('hide').onclick = () => { $('panel').style.display = 'none'; };

// ---- input, as in Terrain Walker -------------------------------------------------
// A click on the view takes the mouse, full screen and the keyboard together;
// Esc gives them back. The keyboard lock is what stops Ctrl+W closing the
// window while Ctrl is held to fly faster (Chrome and Edge; not Firefox).
const MOUSE_DEG = 0.0022 * 180 / Math.PI;     // degrees turned per pixel of mouse travel
const DOUBLE_TAP_MS = 450;
const keys = new Set();
let lastSpace = -Infinity;
const grab = async () => {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); } catch (e) { /* carry on */ }
  try { if (navigator.keyboard && navigator.keyboard.lock) await navigator.keyboard.lock(); } catch (e) { /* carry on */ }
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* next click */ }
};
canvas.addEventListener('click', grab);
const locked = () => document.pointerLockElement === canvas;
const letGo = () => { keys.clear(); if (document.pointerLockElement) document.exitPointerLock(); };
addEventListener('blur', letGo);
document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });
document.addEventListener('mousemove', (e) => {
  if (locked()) cam.look(e.movementX * MOUSE_DEG, -e.movementY * MOUSE_DEG);
});
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) {
      // Double-tap Space: walk or fly.
      const now = performance.now();
      if (now - lastSpace < DOUBLE_TAP_MS) { cam.fly = !cam.fly; lastSpace = -Infinity; } else lastSpace = now;
    }
  }
  if (e.code === 'KeyG' && !e.repeat) cam.fly = !cam.fly;
  if (e.code === 'KeyQ' || e.code === 'KeyE') { cam.fly = true; e.preventDefault(); }
  if (e.code === 'KeyH' && !e.repeat) $('panel').style.display = $('panel').style.display === 'none' ? '' : 'none';
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
// The wheel changes speed, for whichever way you are moving.
canvas.addEventListener('wheel', (e) => cam.bump(Math.exp(-e.deltaY * 0.0012)), { passive: true });

// ---- the address keeps where you are, so a link brings you back -----------------
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1)), n = (k) => (q.has(k) ? +q.get(k) : NaN);
  const p = { lat: n('lat'), lon: n('lon'), h: n('h'), heading: n('heading'), tilt: n('tilt') };
  return Object.values(p).every(Number.isFinite) ? p : null;
}
setInterval(() => {
  history.replaceState(null, '', '#lat=' + cam.lat.toFixed(5) + '&lon=' + cam.lon.toFixed(5) + '&h=' + cam.h.toFixed(1) +
    '&heading=' + cam.heading.toFixed(1) + '&tilt=' + cam.tilt.toFixed(1));
}, 1000);

// ---- each frame -----------------------------------------------------------------
const fmtH = (m) => (Math.abs(m) >= 10000 ? (m / 1000).toFixed(0) + ' km' : Math.abs(m) >= 1000 ? (m / 1000).toFixed(1) + ' km' : m.toFixed(1) + ' m');
const fmtV = (v) => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + ' km/s' : v.toFixed(v >= 100 ? 0 : 1) + ' m/s');
let last = performance.now(), fps = 60;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

  const k = (c) => (keys.has(c) ? 1 : 0), any = (...c) => c.some((x) => keys.has(x));
  cam.move(dt, { fwd: k('KeyW') - k('KeyS'), right: k('KeyD') - k('KeyA'),
    up: any('Space', 'KeyE'), down: any('ShiftLeft', 'ShiftRight', 'KeyQ'),
    boost: any('ControlLeft', 'ControlRight'), run: any('ShiftLeft', 'ShiftRight') }, ground);
  // A place chosen before its ground had loaded: keep the asked-for height
  // above the ground as finer ground arrives, until you move.
  if (wantAgl !== null) {
    if (keys.size || !cam.fly) wantAgl = null;
    else { const g = ground(cam.lat, cam.lon); if (g !== null) cam.h = g + wantAgl; }
  }
  const g = ground(cam.lat, cam.lon), agl = cam.h - (g ?? 0);
  if (document.activeElement !== $('height')) $('height').value = toSlider(agl);
  $('heightText').textContent = fmtH(agl);

  const camE = cam.earth, axes = cam.axes(), aspect = w / h;
  const l = Math.hypot(...camE);
  globe.update({ cam: camE, camDir: camE.map((c) => c / l), camH: cam.h, planes: viewPlanes(axes, FOV, aspect),
    pxPerRadian: h / (FOV * Math.PI / 180) });

  // Light from the south-west, high, wherever you are.
  const f = localFrame(cam.lat, cam.lon);
  const sun = [0, 1, 2].map((i) => 0.75 * f.up[i] - 0.35 * f.east[i] - 0.55 * f.north[i]);
  const sl = Math.hypot(...sun);
  for (let i = 0; i < 3; i++) sun[i] /= sl;
  const space = Math.min(1, Math.max(0, (cam.h - 15000) / 135000));
  const hazeColour = [0.70, 0.78, 0.88].map((c) => c * (1 - space));
  const haze = Math.exp(-Math.max(0, cam.h) / 8000) / 250000;

  gl.viewport(0, 0, w, h);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const proj = perspective(FOV, aspect), view = viewTurn(axes);
  // The sea and sky first, then the land over them (see sea.js).
  sea.draw({ axes: { ...axes, up: f.up }, camE, sun, haze, hazeColour, space, tanY: Math.tan(FOV * Math.PI / 360), aspect });
  const drawn = globe.draw({ proj, view, camE, sun, hazeColour, haze, aboveSea: cam.h > 0 });

  $('status').textContent =
    `${Math.abs(cam.lat).toFixed(4)}° ${cam.lat >= 0 ? 'N' : 'S'}  ${Math.abs(cam.lon).toFixed(4)}° ${cam.lon >= 0 ? 'E' : 'W'}` +
    `   above sea ${fmtH(cam.h)}   above ground ${g === null ? '?' : fmtH(agl)}   heading ${cam.heading.toFixed(0)}°  tilt ${cam.tilt.toFixed(0)}°` +
    `   ${cam.fly ? 'flying' : 'walking'} ${fmtV(cam.speed(agl))} (wheel x${(cam.fly ? cam.flyMult : cam.walkMult).toFixed(2)})` +
    `${locked() ? '' : '   click the view to steer'}\n` +
    `tiles drawn ${drawn} (finest zoom ${globe.finest})   held ${globe.tiles.size}   loading ${globe.loading.size}   still wanted ${globe.wanted}` +
    `   downloaded ${globe.downloads} (${(globe.bytes / 1048576).toFixed(1)} MB)   ${fps.toFixed(0)} frames/s   depth ${DEPTH_BITS} bits` +
    (globe.errors ? `   failures ${globe.errors}: ${globe.lastError}` : '');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
