// Moving on the round Earth: walking and flying, as in Terrain Walker.
import { Camera, EYE, WALK_SPEED } from '../src/moving/camera.js';
import { metresPerDegree, localFrame } from '../src/geo/earth.js';
import { ok, near, done } from './_check.mjs';

const flat = () => 100;            // the ground everywhere at 100 m
const still = { fwd: 0, right: 0, up: false, down: false, boost: false, run: false };

// Walking north for a second covers walking speed.
let c = new Camera({ lat: 45, lon: -75, h: 100 + EYE, heading: 0, tilt: 0, fly: false });
c.move(1, { ...still, fwd: 1 }, flat);
near((c.lat - 45) * metresPerDegree(45).north, WALK_SPEED, 1e-6, 'a second north covers one second of walking');
near(c.lon, -75, 1e-12, 'walking north keeps the longitude');
c.move(1, { ...still, fwd: 1, run: true }, flat);
near((c.lat - 45) * metresPerDegree(45).north, 3 * WALK_SPEED, 1e-6, 'Shift doubles walking speed');

// Looking up or down never slows you.
const a = new Camera({ lat: 0, lon: 0, h: 5000, tilt: 0 }), b = new Camera({ lat: 0, lon: 0, h: 5000, tilt: -80 });
a.move(1, { ...still, fwd: 1 }, flat); b.move(1, { ...still, fwd: 1 }, flat);
near(a.lat, b.lat, 1e-12, 'tilt does not change the speed over the ground');

// Walking follows the ground, smoothly.
c = new Camera({ lat: 10, lon: 10, h: 120, fly: false });
for (let i = 0; i < 60; i++) c.move(1 / 60, still, flat);
near(c.h, 100 + EYE, 0.01, 'walking settles at eye height above the ground');

// Flying: a quarter of your height a second; never below 1.5 m over the ground.
c = new Camera({ lat: 0, lon: 0, h: 100 + 4000, heading: 90 });
near(c.speed(4000), 1000, 0.01, 'flying at 4 km: 1 km a second');
near(c.speed(10), 75, 0.001, 'never slower than at 300 m');
for (let i = 0; i < 100; i++) c.move(0.1, { ...still, down: true, boost: true }, flat);
near(c.h, 101.5, 1e-9, 'holding "down" stops 1.5 m over the ground');

// East along a parallel keeps the latitude.
c = new Camera({ lat: 60, lon: 10, h: 100 + 1000, heading: 90 });
for (let i = 0; i < 100; i++) c.move(0.1, { ...still, fwd: 1 }, flat);
near(c.lat, 60, 1e-6, 'east keeps the latitude');
ok(c.lon > 10, 'east increases the longitude');

// Over the North Pole: come down the other side, facing south.
c = new Camera({ lat: 89.99999, lon: 0, h: 500000, heading: 0 });
for (let i = 0; i < 50; i++) c.move(0.05, { ...still, fwd: 1 }, flat);
ok(c.lat < 90 && Math.abs(Math.abs(c.lon) - 180) < 1e-6 && Math.abs(c.heading - 180) < 1e-6,
  `over the pole: lat ${c.lat.toFixed(4)} lon ${c.lon} heading ${c.heading}`);

// The wheel scales the speed of whichever way you move, within limits.
c = new Camera({ fly: true });
for (let i = 0; i < 100; i++) c.bump(2);
ok(c.flyMult === 50 && c.walkMult === 1, 'wheel while flying: flying speed only, at most 50 times');
c.fly = false; c.bump(0.1);
ok(c.walkMult === 0.25, 'wheel while walking: walking speed, at least a quarter');

// A level gaze is level where you stand, wherever you are: at right angles to up.
for (const [lat, lon, hd] of [[0, 0, 0], [45, -79, 123], [-70, 150, 270]]) {
  const k = new Camera({ lat, lon, h: 10, heading: hd, tilt: 0 }), x = k.axes(), up = localFrame(lat, lon).up;
  near(x.fwd[0] * up[0] + x.fwd[1] * up[1] + x.fwd[2] * up[2], 0, 1e-12, `level gaze is level at ${lat},${lon}`);
  near(x.top[0] * up[0] + x.top[1] * up[1] + x.top[2] * up[2], 1, 1e-12, `the top of the view is up at ${lat},${lon}`);
}
// Far out, the Earth turns under you no faster than about 3 degrees a second, even at full wheel.
const out = new Camera({ flyMult: 50 }), turn = out.speed(35786000) * 4 / 6378137;
ok(turn < Math.PI / 60 * 4.5, 'geostationary, boosted: ' + (turn * 180 / Math.PI).toFixed(1) + ' degrees a second');
done();
