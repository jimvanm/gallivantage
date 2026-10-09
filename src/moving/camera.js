// Layer 5, moving: you. Where you are, which way you look, and how you move.
//
// Position is latitude, longitude and height above the ellipsoid. Which way
// you look is a heading (degrees clockwise from north) and a tilt (degrees
// above level). "Level" and "up" are worked out where you stand, so walking
// on the round Earth feels exactly like walking on a flat one, and a level
// gaze stays level as you travel round the ball.
//
// The ground height comes from outside (groundAt), never worked out here.

import { toEarth, localFrame, metresPerDegree, wrapLon, A } from '../geo/earth.js';

export const EYE = 1.7;                 // metres: eye height when standing
const D2R = Math.PI / 180;

export class Camera {
  constructor(at = {}) {
    this.lat = 43.6; this.lon = -79.4; this.h = 1000; this.heading = 0; this.tilt = -10;
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

  // How fast to travel, in metres per second over the ground: about your
  // height above it per second (the ground slides past at the same rate in
  // the eye whether you are walking or in orbit), but never slower than a
  // brisk walk. Far out, it eases off so the Earth turns under you no faster
  // than about 3 degrees a second.
  speed(agl) {
    const v = Math.max(4, 0.8 * Math.max(0, agl));
    const cap = A * 0.05;                  // 0.05 radians a second: about 3 degrees, a turn every two minutes
    return v / (1 + v / cap);
  }

  // Move by dt seconds of input: { fwd, right, up } each -1..1, fast (bool).
  // groundAt(lat, lon) gives the ground height or null when not known.
  move(dt, input, groundAt) {
    const g = groundAt(this.lat, this.lon);
    const ground = g === null ? 0 : g;
    const agl = this.h - ground;
    const v = this.speed(agl) * (input.fast ? 5 : 1) * dt;
    const y = this.heading * D2R;
    const n = (input.fwd * Math.cos(y) - input.right * Math.sin(y)) * v;
    const e = (input.fwd * Math.sin(y) + input.right * Math.cos(y)) * v;
    const m = metresPerDegree(this.lat);
    this.lat += n / m.north;
    this.lon += e / Math.max(1e-6, m.east);
    // Past a pole: come down the other side, facing the other way.
    if (this.lat > 90) { this.lat = 180 - this.lat; this.lon += 180; this.heading += 180; }
    if (this.lat < -90) { this.lat = -180 - this.lat; this.lon += 180; this.heading += 180; }
    this.lon = wrapLon(this.lon);
    this.heading = ((this.heading % 360) + 360) % 360;
    // Up and down: in proportion to height above the ground, so it feels the
    // same at every height.
    if (input.up) this.h = ground + Math.max(EYE, agl * Math.exp(input.up * 1.2 * dt * (input.fast ? 3 : 1)) + input.up * 2 * dt);
    this.keepAbove(groundAt);
  }

  // Never below eye height over the ground.
  keepAbove(groundAt) {
    const g = groundAt(this.lat, this.lon);
    if (g !== null && this.h < g + EYE) this.h = g + EYE;
  }

  look(dHeading, dTilt) {
    this.heading = (((this.heading + dHeading) % 360) + 360) % 360;
    this.tilt = Math.max(-90, Math.min(90, this.tilt + dTilt));
  }
}
