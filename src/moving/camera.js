// Layer 5, moving: you. Where you are, which way you look, and how you move.
//
// Position is latitude, longitude and height above the ellipsoid. Which way
// you look is a heading (degrees clockwise from north) and a tilt (degrees
// above level). "Level" and "up" are worked out where you stand, so walking
// on the round Earth feels exactly like walking on a flat one, and a level
// gaze stays level as you travel round the ball.
//
// Two ways to move, as in Terrain Walker: walking, held to the ground, and
// flying, at a speed that follows your height. The numbers are Terrain
// Walker's (config.js there).
//
// The ground height comes from outside (groundAt), never worked out here.

import { toEarth, localFrame, metresPerDegree, wrapLon, A } from '../geo/earth.js';

export const EYE = 1.7;                 // metres: eye height when standing
export const WALK_SPEED = 5.6;          // metres a second (Shift doubles it)
const FLY_K = 0.25, FLY_FLOOR = 300;    // flying: a quarter of your height a second, never below 300 m's worth
const FLY_BOOST = 4;                    // Ctrl
const FLY_LOW = 1.5;                    // metres: the lowest you can fly over the ground
const GROUND_SMOOTH = 12;               // how quickly walking follows the ground (higher is snappier)
const MULT = { fly: [0.1, 50], walk: [0.25, 100] };
const D2R = Math.PI / 180;

export class Camera {
  constructor(at = {}) {
    this.lat = 43.6; this.lon = -79.4; this.h = 1000; this.heading = 0; this.tilt = -10;
    this.fly = true;
    this.flyMult = 1; this.walkMult = 1;   // the wheel scales these
    Object.assign(this, at);
  }

  // Earth-centred position, full precision.
  get earth() { return toEarth(this.lat, this.lon, this.h); }

  // The directions you face: forward, right and the top of your view, as
  // unit vectors in earth-centred axes.
  axes() {
    const f = localFrame(this.lat, this.lon), y = this.heading * D2R, p = this.tilt * D2R;
    const lv = [0, 1, 2].map((k) => Math.sin(y) * f.east[k] + Math.cos(y) * f.north[k]);   // level forward
    const fwd = [0, 1, 2].map((k) => Math.cos(p) * lv[k] + Math.sin(p) * f.up[k]);
    const right = [0, 1, 2].map((k) => Math.cos(y) * f.east[k] - Math.sin(y) * f.north[k]);
    const top = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
    return { fwd, right, top, up: f.up };
  }

  // Flying speed in metres a second at a height above the ground: a quarter
  // of the height a second, so the ground slides past the eye at the same
  // rate at 300 m and in orbit. Far out it eases off, so the Earth turns
  // under you no faster than about 3 degrees a second.
  flySpeed(agl) {
    const v = FLY_K * Math.max(agl, FLY_FLOOR) * this.flyMult;
    const cap = A * 0.05;                  // 0.05 radians a second at the surface: about 3 degrees
    return v / Math.sqrt(1 + (v / cap) ** 2);   // unchanged low down; levels off at the cap far out
  }

  // The speed for the way you are moving now, before Shift or Ctrl.
  speed(agl) { return this.fly ? this.flySpeed(agl) : WALK_SPEED * this.walkMult; }

  // The wheel: faster or slower, for whichever way you are moving.
  bump(factor) {
    const [lo, hi] = MULT[this.fly ? 'fly' : 'walk'];
    if (this.fly) this.flyMult = Math.max(lo, Math.min(hi, this.flyMult * factor));
    else this.walkMult = Math.max(lo, Math.min(hi, this.walkMult * factor));
  }

  // Move by dt seconds of input: { fwd, right } each -1..1 (W S, D A),
  // { up, down, boost, run } true or false.
  // groundAt(lat, lon) gives the ground height or null when not known.
  move(dt, input, groundAt) {
    const g0 = groundAt(this.lat, this.lon);
    const agl = this.h - (g0 === null ? 0 : g0);
    const v = this.speed(agl) * (this.fly ? (input.boost ? FLY_BOOST : 1) : (input.run ? 2 : 1));

    // Across the ground: by heading only, so looking up or down never slows you.
    let f = input.fwd || 0, r = input.right || 0;
    const len = Math.hypot(f, r);
    if (len > 0) {
      f /= len; r /= len;
      const y = this.heading * D2R;
      const n = (f * Math.cos(y) - r * Math.sin(y)) * v * dt;
      const e = (f * Math.sin(y) + r * Math.cos(y)) * v * dt;
      const m = metresPerDegree(this.lat);
      this.lat += n / m.north;
      this.lon += e / Math.max(1e-6, m.east);
      // Past a pole: come down the other side, facing the other way.
      if (this.lat > 90) { this.lat = 180 - this.lat; this.lon += 180; this.heading += 180; }
      if (this.lat < -90) { this.lat = -180 - this.lat; this.lon += 180; this.heading += 180; }
      this.lon = wrapLon(this.lon);
      this.heading = ((this.heading % 360) + 360) % 360;
    }

    // Up and down. The ground is judged at the new position: a fast, low
    // flight can cover a lot of hillside in one frame.
    const g = groundAt(this.lat, this.lon);
    if (this.fly) {
      this.h += ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * v * dt;
      if (g !== null && this.h < g + FLY_LOW) this.h = g + FLY_LOW;
    } else if (g !== null) {
      // Walking follows the ground, smoothed so steps between height samples
      // do not jolt. No gravity yet: walk at a cliff and you ride up it.
      this.h += (g + EYE - this.h) * (1 - Math.exp(-GROUND_SMOOTH * dt));
    }
  }

  // Turn by degrees: heading clockwise, tilt upward.
  look(dHeading, dTilt) {
    this.heading = (((this.heading + dHeading) % 360) + 360) % 360;
    this.tilt = Math.max(-89.9, Math.min(89.9, this.tilt + dTilt));
  }
}
