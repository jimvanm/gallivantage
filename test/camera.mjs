// Moving on the round Earth.
import { Camera, EYE } from '../src/moving/camera.js';
import { metresPerDegree, localFrame } from '../src/geo/earth.js';
import { ok, near, done } from './_check.mjs';

const flat = () => 100;            // the ground everywhere at 100 m
const still = { fwd: 0, right: 0, up: 0, fast: false };

// Walking north for a second at standing height covers a brisk walk's worth.
let c = new Camera({ lat: 45, lon: -75, h: 100 + EYE, heading: 0, tilt: 0 });
const v = c.speed(EYE);
c.move(1, { ...still, fwd: 1 }, flat);
near((c.lat - 45) * metresPerDegree(45).north, v, 1e-6, 'a second north covers one second of walking');
near(c.lon, -75, 1e-12, 'walking north keeps the longitude');

// Walking east along a parallel keeps the latitude to within a hair.
c = new Camera({ lat: 60, lon: 10, h: 100 + EYE, heading: 90 });
for (let i = 0; i < 100; i++) c.move(0.1, { ...still, fwd: 1 }, flat);
near(c.lat, 60, 1e-6, 'east keeps the latitude');
ok(c.lon > 10, 'east increases the longitude');

// Over the North Pole: come down the other side, facing south.
c = new Camera({ lat: 89.99999, lon: 0, h: 500000, heading: 0 });
for (let i = 0; i < 50; i++) c.move(0.05, { ...still, fwd: 1 }, flat);
ok(c.lat < 90 && Math.abs(Math.abs(c.lon) - 180) < 1e-6 && Math.abs(c.heading - 180) < 1e-6,
  `over the pole: lat ${c.lat.toFixed(4)} lon ${c.lon} heading ${c.heading}`);

// Never below eye height, whatever you do.
c = new Camera({ lat: 10, lon: 10, h: 50, heading: 0 });
c.move(0.1, still, flat);
near(c.h, 100 + EYE, 1e-9, 'pushed up to eye height above the ground');
for (let i = 0; i < 50; i++) c.move(0.1, { ...still, up: -1, fast: true }, flat);
near(c.h, 100 + EYE, 1e-9, 'holding "down" stops at eye height');

// Going up is in proportion to height: the same keypress doubles you sooner or later at any height.
const rise = (h0) => { const k = new Camera({ lat: 0, lon: 0, h: 100 + h0 }); k.move(0.5, { ...still, up: 1 }, flat); return (k.h - 100) / h0; };
near(rise(1000), rise(100000), 0.01, 'climbing feels the same at 1 km and 100 km');

// A level gaze is level where you stand, wherever you are: at right angles to up.
for (const [lat, lon, hd] of [[0, 0, 0], [45, -79, 123], [-70, 150, 270]]) {
  const k = new Camera({ lat, lon, h: 10, heading: hd, tilt: 0 }), a = k.axes(), up = localFrame(lat, lon).up;
  near(a.fwd[0] * up[0] + a.fwd[1] * up[1] + a.fwd[2] * up[2], 0, 1e-12, `level gaze is level at ${lat},${lon}`);
  near(a.top[0] * up[0] + a.top[1] * up[1] + a.top[2] * up[2], 1, 1e-12, `the top of the view is up at ${lat},${lon}`);
}
// Far out, the Earth turns under you no faster than about 3 degrees a second.
const out = new Camera(), ground = out.speed(35786000) / 6378137;     // radians per second at the surface
ok(ground < Math.PI / 60 * 1.5, 'geostationary: the ground turns slowly enough: ' + (ground * 180 / Math.PI).toFixed(1) + ' degrees a second');
done();
