// Layer 4, drawing: what the camera sees, as the graphics card wants it.
//
// The camera always sits at (0, 0, 0): everything is drawn relative to it,
// with earth-centred axes. So the view is a turn only, never a move, and the
// big numbers are subtracted in full precision before anything reaches the
// graphics card.

export const FOV = 68;                  // degrees, top to bottom, as in Terrain Walker
export const NEAR = 0.1;                // metres
export const FAR = 1e9;                 // metres: past the Moon

// Column-major 4 x 4 matrices, as WebGL wants them.
export function perspective(fovDeg, aspect, near = NEAR, far = FAR) {
  const f = 1 / Math.tan(fovDeg * Math.PI / 360), m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f;
  m[10] = (far + near) / (near - far); m[11] = -1;
  m[14] = 2 * far * near / (near - far);
  return m;
}

// The turn from earth-centred axes to the camera's (x right, y top, -z forward).
export function viewTurn(axes) {
  const { right: r, top: t, fwd: f } = axes, m = new Float32Array(16);
  m[0] = r[0]; m[4] = r[1]; m[8] = r[2];
  m[1] = t[0]; m[5] = t[1]; m[9] = t[2];
  m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
  m[15] = 1;
  return m;
}

// The four sides of the view as planes, in camera-relative earth-centred
// metres: a point p is inside when a*p.x + b*p.y + c*p.z + d >= 0 for every
// side. (No near or far side: the near one is a hair in front of the eye and
// the far one past the Moon.)
export function viewPlanes(axes, fovDeg, aspect) {
  const { right: r, top: t, fwd: f } = axes;
  const ty = Math.tan(fovDeg * Math.PI / 360), tx = ty * aspect;
  const side = (s, axis, tan) => {
    // Normal of the side: points inward. For the right side, inward is
    // forward*tan - right; and so on.
    const n = [0, 1, 2].map((k) => f[k] * tan - s * axis[k]);
    const l = Math.hypot(...n);
    return [n[0] / l, n[1] / l, n[2] / l, 0];
  };
  return [side(1, r, tx), side(-1, r, tx), side(1, t, ty), side(-1, t, ty)];
}
