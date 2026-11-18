/*
 * render/BoardMesh.js — the 8x8 marble board and its wooden frame.
 * One unit = one square. The board is centered on the origin, its top face is at y = 0,
 * white's side faces +z (toward the default camera) and file "a" is on the left (-x).
 */

import * as THREE from './three.js';
import { createBoardMaterials } from './materials.js';

export const SQUARE = 1;
const THICKNESS = 0.25;
const FRAME_WIDTH = 0.55;

/** "e4" -> world position of the middle of that square's top face. */
export function squareToWorld(square) {
  const file = square.charCodeAt(0) - 97;           // a..h -> 0..7
  const rank = Number(square[1]) - 1;               // 1..8  -> 0..7
  return new THREE.Vector3((file - 3.5) * SQUARE, 0, (3.5 - rank) * SQUARE);
}

/** Inverse of squareToWorld: a point on the board plane -> "e4", or null if it is off the board. */
export function worldToSquare(point) {
  const file = Math.floor(point.x / SQUARE + 4);
  const rank = Math.floor(4 - point.z / SQUARE);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return String.fromCharCode(97 + file) + (rank + 1);
}

export class BoardMesh {
  /** @type {THREE.Group} */
  group = new THREE.Group();
  /** @type {THREE.Mesh[]} the 64 squares, which picking tests against */
  squares = [];
  #materials = createBoardMaterials();
  #labelTextures = [];

  constructor() {
    const { light, dark, frame } = this.#materials;
    const tile = new THREE.BoxGeometry(SQUARE, THICKNESS, SQUARE);
    for (let file = 0; file < 8; file++) {
      for (let rank = 0; rank < 8; rank++) {
        const isDark = (file + rank) % 2 === 0;       // a1 is dark
        const pool = isDark ? dark : light;
        const mesh = new THREE.Mesh(tile, pool[(file * 3 + rank * 5) % pool.length]);
        const name = String.fromCharCode(97 + file) + (rank + 1);
        mesh.position.copy(squareToWorld(name)).setY(-THICKNESS / 2);
        mesh.receiveShadow = true;
        mesh.userData.square = name;
        this.squares.push(mesh);
        this.group.add(mesh);
      }
    }

    // Four boards around the playing area make the frame.
    const inner = 8 * SQUARE;
    const outer = inner + FRAME_WIDTH * 2;
    const height = THICKNESS + 0.08;
    const y = -THICKNESS / 2 + 0.04;
    const side = new THREE.BoxGeometry(outer, height, FRAME_WIDTH);
    const end = new THREE.BoxGeometry(FRAME_WIDTH, height, inner);
    const place = (geometry, x, z) => {
      const mesh = new THREE.Mesh(geometry, frame);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    const offset = (inner + FRAME_WIDTH) / 2;
    place(side, 0, offset);
    place(side, 0, -offset);
    place(end, offset, 0);
    place(end, -offset, 0);
    this.#addLabels(offset);
  }

  /** Letters a-h along the bottom edge and numbers 1-8 along the left, as sprites so they face the camera from any side. */
  #addLabels(edge) {
    const label = (text, x, z) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const g = canvas.getContext('2d');
      g.font = '700 44px Tahoma, Verdana, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#E8D9B8';
      g.fillText(text, 32, 34);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.#labelTextures.push(texture);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
      sprite.scale.setScalar(0.3);
      sprite.position.set(x, 0.07, z);
      this.group.add(sprite);
    };
    for (let i = 0; i < 8; i++) {
      label(String.fromCharCode(97 + i), (i - 3.5) * SQUARE, edge);
      label(String(i + 1), -edge, (3.5 - i) * SQUARE);
    }
  }

  /** Frees the textures; geometries and materials are freed by the renderer walking the scene. */
  dispose() {
    this.#materials.textures.forEach((texture) => texture.dispose());
    this.#labelTextures.forEach((texture) => texture.dispose());
  }
}
