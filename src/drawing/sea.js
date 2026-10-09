// Layer 4, drawing: the sea and the sky, everywhere at once.
//
// The sea is a shell at sea level round the whole Earth. It is not built from
// triangles (those would sag between their corners, kilometres at a time on a
// ball this big). Instead, for every pixel, the graphics card works out where
// that line of sight meets the ellipsoid, exactly, and draws water there.
// It is drawn before the land. The land then works out, just as exactly,
// whether the sea hides it; if not, it is drawn over the sea. The sea floor
// in the height data is not drawn at all. Lines of sight that miss the
// Earth get the sky: blue near the ground, black in space, with a thin blue
// glow round the edge of the Earth seen from orbit.
//
// The exactness rests on one number worked out in full precision on the main
// thread: how far the camera is outside the ellipsoid (uC below). Everything
// the graphics card does after that is small numbers or a ratio of big ones.

import { program, logDepthC, LOG_DEPTH_GLSL } from './gl.js';
import { A, B } from '../geo/earth.js';
import { FAR } from './view.js';

const K = A / B;     // stretching z by this turns the ellipsoid into a ball of radius A

const VS = `#version 300 es
out vec2 vNdc;
void main() {
  vec2 p = vec2(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0);
  vNdc = p;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uRight, uTop, uFwd, uUp, uSun, uCamE;
uniform vec3 uOcs;            // camera, earth-centred, z stretched by K
uniform float uC;             // |uOcs|^2 - A^2, worked out in full precision
uniform float uTanY, uAspect, uHaze, uSpace;
uniform vec3 uHazeColour;
${LOG_DEPTH_GLSL}
out vec4 colour;
const float A = ${A.toFixed(3)};
const float K = ${K.toFixed(12)};

vec3 sky(vec3 d) {
  float e = dot(d, uUp);
  vec3 day = mix(uHazeColour, vec3(0.30, 0.50, 0.82), smoothstep(-0.05, 0.5, e));
  return mix(day, vec3(0.008, 0.012, 0.03), uSpace);
}

void main() {
  vec3 dc = normalize(vec3(vNdc.x * uTanY * uAspect, vNdc.y * uTanY, -1.0));
  vec3 d = uRight * dc.x + uTop * dc.y - uFwd * dc.z;
  vec3 ds = vec3(d.xy, d.z * K);
  float a = dot(ds, ds), b = dot(ds, uOcs), disc = b * b - a * uC;
  if (uC > 0.0 && b < 0.0 && disc >= 0.0) {
    // Nearer meeting point, in the form that keeps its precision.
    float t = uC / (-b + sqrt(disc));
    vec3 q = d * t;
    vec3 p = q + uCamE;
    vec3 n = normalize(vec3(p.xy, p.z * K * K));
    float fres = pow(1.0 - max(dot(n, -d), 0.0), 5.0);
    vec3 c = mix(vec3(0.03, 0.11, 0.20), sky(reflect(d, n)), 0.08 + 0.75 * fres);
    c += vec3(1.0, 0.95, 0.85) * pow(max(dot(reflect(d, n), uSun), 0.0), 300.0) * 0.8;
    c *= 0.55 + 0.45 * max(dot(n, uSun), 0.0);
    float haze = 1.0 - exp(-t * uHaze);
    colour = vec4(mix(c, uHazeColour, haze * 0.85), 1.0);
    gl_FragDepth = logDepth(t * dot(d, uFwd));
    return;
  }
  // The sky. Seen from space, a glow where the line of sight passes close
  // over the edge of the Earth: (closest distance to the middle)^2 - A^2,
  // divided by 2A, is roughly how high it passes.
  vec3 c = sky(d);
  if (uC > 0.0) {
    float over = (uC - b * b / a) / (2.0 * A);
    c += vec3(0.30, 0.50, 0.95) * exp(-max(over, 0.0) / 12000.0) * uSpace * step(b, 0.0) * 0.9;
  }
  colour = vec4(c, 1.0);
  gl_FragDepth = 1.0;
}`;

export class Sea {
  constructor(gl) {
    this.gl = gl;
    this.prog = program(gl, VS, FS, ['uRight', 'uTop', 'uFwd', 'uUp', 'uSun', 'uCamE', 'uOcs', 'uC', 'uTanY', 'uAspect',
      'uHaze', 'uSpace', 'uHazeColour', 'uLogC']);
    this.vao = gl.createVertexArray();
  }

  // pass: { axes, camE (full precision), sun, haze, hazeColour, space (0 ground .. 1 orbit), tanY, aspect }
  draw(pass) {
    const gl = this.gl, u = this.prog.u, e = pass.camE;
    gl.useProgram(this.prog.p);
    gl.uniform3fv(u.uRight, pass.axes.right); gl.uniform3fv(u.uTop, pass.axes.top);
    gl.uniform3fv(u.uFwd, pass.axes.fwd); gl.uniform3fv(u.uUp, pass.axes.up);
    gl.uniform3fv(u.uSun, pass.sun);
    gl.uniform3f(u.uCamE, e[0], e[1], e[2]);
    gl.uniform3f(u.uOcs, e[0], e[1], e[2] * K);
    gl.uniform1f(u.uC, outside(e));
    gl.uniform1f(u.uTanY, pass.tanY); gl.uniform1f(u.uAspect, pass.aspect);
    gl.uniform1f(u.uHaze, pass.haze); gl.uniform1f(u.uSpace, pass.space);
    gl.uniform3fv(u.uHazeColour, pass.hazeColour);
    gl.uniform1f(u.uLogC, logDepthC(FAR));
    // Drawn FIRST, over every pixel, and leaving no depth behind: the land
    // drawn next decides for itself whether the sea hides it (globe.js), so
    // the two never compare depths.
    gl.depthFunc(gl.ALWAYS);
    gl.depthMask(false);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
  }
}

// How far outside the ellipsoid a point is, as |p stretched|^2 - A^2. Worked
// out as (r - A)(r + A) so the small difference keeps its precision even a
// metre above the sea.
export function outside(e) {
  const r = Math.hypot(e[0], e[1], e[2] * K);
  return (r - A) * (r + A);
}
