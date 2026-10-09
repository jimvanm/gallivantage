// Small WebGL2 helpers. No libraries.

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(label + ' shader failed:\n' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

// A shader program, and its uniforms by name.
export function program(gl, vs, fs, names) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, 'vertex'));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, 'fragment'));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link failed:\n' + gl.getProgramInfoLog(p));
  const u = {};
  for (const n of names) u[n] = gl.getUniformLocation(p, n);
  return { p, u };
}

// Depth spread evenly over distance by its logarithm, so the same depth
// buffer sorts a blade of grass at 1 m and a mountain at 300 km. Shaders
// write gl_FragDepth = log2(1 + w) * LOG_C * 0.5, where w is the distance
// along the view.
export const logDepthC = (far) => 2 / Math.log2(far + 1);

export const LOG_DEPTH_GLSL = `
uniform float uLogC;
float logDepth(float w) { return log2(1.0 + max(w, 0.0)) * uLogC * 0.5; }
`;
