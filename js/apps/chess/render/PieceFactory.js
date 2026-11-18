/*
 * render/PieceFactory.js — builds the six chess pieces. Each one has its own height, width and
 * detail so they read at a glance, even from a low camera angle:
 *
 *   pawn    small, round head          rook    wide tower with a notched rim
 *   knight  horse head with ears/eye   bishop  tall mitre with a slit and a ball
 *   queen   crown of points and a pearl   king  tallest, with a cross
 *
 * Bodies are lathe profiles (turned like real pieces). Geometries are cached and shared by all
 * pieces of a type; two glossy materials are shared by every piece of a color, plus a small
 * contrasting "accent" material for the slit and the eyes.
 * Pieces stand on y = 0, centered on their square.
 */

import * as THREE from './three.js';
import { horseOutline } from './horse.js';

const V = (r, y) => new THREE.Vector2(r, y);
const SEGMENTS = 48;

/** A round foot, wider for the bigger pieces. */
const foot = (r) => [V(0, 0), V(r, 0), V(r + 0.02, 0.03), V(r + 0.02, 0.08), V(r - 0.04, 0.12), V(r - 0.09, 0.17)];

/** Profiles go from the foot up to the top, as [radius, height] points; the lathe spins them around y. */
const PROFILES = {
  p: [...foot(0.29), V(0.15, 0.24), V(0.11, 0.36), V(0.1, 0.42), V(0.2, 0.46), V(0.2, 0.49), V(0.11, 0.53),
      V(0.15, 0.58), V(0.17, 0.64), V(0.15, 0.7), V(0.09, 0.74), V(0, 0.75)],
  r: [...foot(0.37), V(0.27, 0.25), V(0.25, 0.5), V(0.3, 0.57), V(0.3, 0.62), V(0.34, 0.68), V(0.34, 0.84), V(0.27, 0.84), V(0.27, 0.78), V(0, 0.78)],
  b: [...foot(0.33), V(0.17, 0.26), V(0.11, 0.42), V(0.2, 0.48), V(0.2, 0.52), V(0.1, 0.57), V(0.15, 0.66), V(0.2, 0.78),
      V(0.19, 0.9), V(0.14, 1.01), V(0.07, 1.08), V(0.03, 1.1), V(0, 1.1)],
  q: [...foot(0.36), V(0.2, 0.27), V(0.13, 0.46), V(0.12, 0.62), V(0.22, 0.7), V(0.2, 0.75), V(0.13, 0.8), V(0.17, 0.9),
      V(0.25, 1.04), V(0.29, 1.15), V(0.25, 1.17), V(0.18, 1.12), V(0, 1.1)],
  k: [...foot(0.37), V(0.2, 0.28), V(0.13, 0.48), V(0.13, 0.66), V(0.23, 0.74), V(0.21, 0.8), V(0.14, 0.85), V(0.19, 0.98),
      V(0.27, 1.16), V(0.27, 1.26), V(0.2, 1.3), V(0, 1.3)],
};

/** The horse's head and neck (see horse.js), as a shape to extrude. */
function horseShape() {
  const shape = new THREE.Shape();
  horseOutline().forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  return shape;
}

export class PieceFactory {
  #geometries = new Map();
  #materials = {
    w: new THREE.MeshPhysicalMaterial({ color: 0xf3eee4, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, sheen: 0.4, sheenColor: new THREE.Color(0xffffff) }),
    b: new THREE.MeshPhysicalMaterial({ color: 0x2b2523, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.5 }),
  };
  /** Contrasting detail: dark on the white pieces, light on the black ones. */
  #accents = {
    w: new THREE.MeshStandardMaterial({ color: 0x4a403a, roughness: 0.4 }),
    b: new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.35, metalness: 0.2 }),
  };

  #geometry(key, build) {
    let geometry = this.#geometries.get(key);
    if (!geometry) { geometry = build(); this.#geometries.set(key, geometry); }
    return geometry;
  }

  #mesh(geometry, color, position, accent = false) {
    const mesh = new THREE.Mesh(geometry, (accent ? this.#accents : this.#materials)[color]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (position) mesh.position.set(...position);
    return mesh;
  }

  /**
   * @param {'p'|'n'|'b'|'r'|'q'|'k'} type
   * @param {'w'|'b'} color
   * @returns {THREE.Group} standing on y = 0; knights face the opponent's side
   */
  create(type, color) {
    const group = new THREE.Group();
    const body = new THREE.Group();                         // everything visible; it moves up when the piece is selected
    group.add(body);
    group.userData = { type, color, body };
    const geo = (key, build) => this.#geometry(key, build);
    const add = (...meshes) => body.add(...meshes);

    if (type === 'n') {
      const base = geo('n-base', () => new THREE.LatheGeometry([...foot(0.34), V(0.27, 0.15), V(0, 0.15)], SEGMENTS));
      const head = geo('n-head', () => {
        const g = new THREE.ExtrudeGeometry(horseShape(), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 5, curveSegments: 8 });
        g.translate(0, 0, -0.1);
        return g;
      });
      const eye = geo('n-eye', () => new THREE.SphereGeometry(0.04, 12, 10));
      const nostril = geo('n-nostril', () => new THREE.SphereGeometry(0.022, 8, 6));
      const horse = new THREE.Group();                      // built facing +x, then turned toward the opponent
      horse.add(this.#mesh(head, color),
        this.#mesh(eye, color, [0.27, 0.78, 0.17], true), this.#mesh(eye, color, [0.27, 0.78, -0.17], true),
        this.#mesh(nostril, color, [0.49, 0.69, 0.06], true), this.#mesh(nostril, color, [0.49, 0.69, -0.06], true));
      horse.rotation.y = color === 'w' ? Math.PI / 2 : -Math.PI / 2;     // white looks toward -z, black toward +z
      add(this.#mesh(base, color), horse);
      return group;
    }

    add(this.#mesh(geo(`${type}-body`, () => new THREE.LatheGeometry(PROFILES[type], SEGMENTS)), color));

    if (type === 'r') {
      const merlon = geo('r-merlon', () => new THREE.BoxGeometry(0.15, 0.13, 0.11));
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        const m = this.#mesh(merlon, color, [Math.cos(angle) * 0.285, 0.9, Math.sin(angle) * 0.285]);
        m.rotation.y = -angle;
        add(m);
      }
    } else if (type === 'b') {
      add(this.#mesh(geo('b-ball', () => new THREE.SphereGeometry(0.065, 18, 14)), color, [0, 1.15, 0]));
      const slit = this.#mesh(geo('b-slit', () => new THREE.BoxGeometry(0.34, 0.035, 0.05)), color, [0, 0.93, 0], true);
      slit.rotation.set(0, 0, Math.PI / 4);                 // a diagonal cut across the mitre
      slit.scale.set(1, 1, 1);
      add(slit);
    } else if (type === 'q') {
      const tip = geo('q-tip', () => new THREE.SphereGeometry(0.05, 14, 10));
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        add(this.#mesh(tip, color, [Math.cos(angle) * 0.25, 1.2, Math.sin(angle) * 0.25]));
      }
      add(this.#mesh(geo('q-pearl', () => new THREE.SphereGeometry(0.085, 18, 14)), color, [0, 1.2, 0]));
    } else if (type === 'k') {
      add(this.#mesh(geo('k-bar', () => new THREE.BoxGeometry(0.1, 0.36, 0.1)), color, [0, 1.46, 0]),
        this.#mesh(geo('k-arm', () => new THREE.BoxGeometry(0.28, 0.1, 0.1)), color, [0, 1.5, 0]),
        this.#mesh(geo('k-band', () => new THREE.TorusGeometry(0.235, 0.025, 10, 40).rotateX(Math.PI / 2)), color, [0, 1.2, 0], true));
    }
    return group;
  }

  dispose() {
    this.#geometries.forEach((geometry) => geometry.dispose());
    this.#geometries.clear();
    Object.values(this.#materials).forEach((material) => material.dispose());
    Object.values(this.#accents).forEach((material) => material.dispose());
  }
}
