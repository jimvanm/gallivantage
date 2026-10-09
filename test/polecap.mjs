// The caps over the poles: they fill the hole exactly, follow the ground at
// their edge, carry the card unmirrored, and label longitude the standard way.
import assert from 'node:assert/strict';
import { buildCap, cardUV, lonLabel, EDGE } from '../src/polecap.js';
import { ecef, axesAt } from '../src/globe.js';

for (const sign of [1, -1]) {
  const where = sign > 0 ? 'north' : 'south';
  const rim = Array.from({ length: 360 }, (_, i) => (sign > 0 ? -3000 : 2800) + 200 * Math.sin(i * Math.PI / 30));
  const m = buildCap(sign, rim), f = m.data;
  const O = ecef(sign * 90, 0, 0), ax = axesAt(sign * 90, 0);
  const world = (i) => [0, 1, 2].map((k) => O[k] + f[5 * i] * ax[0][k] + f[5 * i + 1] * ax[1][k] + f[5 * i + 2] * ax[2][k]);
  let minLat = 90;
  for (let i = 0; i < m.verts; i++) {
    const e = world(i);
    minLat = Math.min(minLat, Math.abs(Math.atan2(e[2], Math.hypot(e[0], e[1]) * (1 - 1 / 298.257223563) ** 2) * 180 / Math.PI));
  }
  assert.ok(Math.abs(minLat - EDGE) < 0.002, `${where}: the cap reaches the tiles' edge (${minLat.toFixed(4)})`);
  // Its edge, at longitude 0, 90 and 135, follows the ground there, 30 m under it.
  const last = 48 * 361;
  for (const lon of [0, 90, 135]) {
    const e = world(last + lon), want = ecef(sign * EDGE, lon, 0);
    const h = Math.hypot(...e) - Math.hypot(...want);
    assert.ok(Math.abs(h - (rim[lon] - 30)) < 15, `${where} edge at ${lon}: ${h.toFixed(0)} m, ground ${rim[lon]} m`);
  }
  // Not mirrored: seen from above the pole, going east turns the same way on
  // the card as on the ground.
  const a = ecef(sign * 88, 0, 0), b = ecef(sign * 88, 10, 0);
  const cz = a[0] * b[1] - a[1] * b[0];                              // turn about the Earth's axis
  const turnOnGround = Math.sign(cz * sign);                          // +1 anticlockwise seen from above this pole
  const p = cardUV(sign, 0.5, 0), q = cardUV(sign, 0.5, 10);
  const turnOnCard = -Math.sign((p[0] - 0.5) * (q[1] - 0.5) - (p[1] - 0.5) * (q[0] - 0.5));   // the picture's y runs down
  assert.equal(turnOnCard, turnOnGround, `${where}: the card is not mirrored`);
}
console.log('ok  caps reach the tiles\' edge, follow the ground there, and carry the card unmirrored, north and south');

assert.deepEqual([0, 10, 90, 180, 190, 270, 350].map((d) => { const l = lonLabel(d); return l.num + l.dir; }),
  ['0', '10E', '90E', '180', '170W', '90W', '10W']);
console.log('ok  longitude labelled 0, east and west to 180');
