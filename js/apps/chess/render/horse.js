/*
 * render/horse.js — the outline of the knight's head and neck, as plain [x, y] points.
 * x points forward (the muzzle), y is up; the piece's foot is at y = 0.15. No Three.js here, so
 * the shape can be checked in Node (see tests/chess.test.mjs). PieceFactory extrudes it.
 *
 * Straight segments make the sharp parts (ear tip, chin, muzzle); quadratic curves make the
 * arch of the neck, the throat and the bridge of the nose.
 */

const quad = (from, control, to, steps = 8) => {
  const points = [];
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const k = 1 - u;
    points.push([k * k * from[0] + 2 * k * u * control[0] + u * u * to[0], k * k * from[1] + 2 * k * u * control[1] + u * u * to[1]]);
  }
  return points;
};

/** @returns {number[][]} the closed outline, clockwise from the back of the foot */
export function horseOutline() {
  const pts = [[-0.27, 0.15], [0.25, 0.15]];
  let at = pts[pts.length - 1];
  const curve = (control, to, steps) => { pts.push(...quad(at, control, to, steps)); at = to; };
  const line = (to) => { pts.push(to); at = to; };

  curve([0.31, 0.3], [0.19, 0.46]);          // chest, rising into the throat
  curve([0.1, 0.52], [0.13, 0.6]);           // the hollow under the jaw
  line([0.3, 0.6]);                          // underside of the jaw
  line([0.42, 0.62]);                        // chin
  line([0.45, 0.7]);                         // front of the muzzle
  curve([0.45, 0.78], [0.33, 0.85]);         // bridge of the nose, up to the forehead
  line([0.25, 0.94]);                        // forehead to the base of the ear
  line([0.24, 1.09]);                        // ear tip
  line([0.12, 0.98]);                        // back of the ear
  curve([-0.04, 1.02], [-0.16, 0.8]);        // crest of the mane
  curve([-0.26, 0.6], [-0.31, 0.38]);        // back of the neck
  line([-0.27, 0.15]);
  return pts;
}
