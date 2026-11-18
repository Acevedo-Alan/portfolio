/*
 * render/Highlights.js — soft glowing marks drawn on the squares: the selected piece, where it
 * can go (green dots, red when it captures), the last move, and a king in check.
 * A small pool of flat planes is reused; nothing is created while playing.
 */

import * as THREE from './three.js';
import { squareToWorld } from './BoardMesh.js';

const COLORS = { selected: 0xffd54a, target: 0x4cff7a, capture: 0xff4a3a, last: 0x5aa8ff, check: 0xff2a1a, mate: 0xff1208 };
const SCALES = { selected: 1, target: 0.5, capture: 1, last: 1, check: 1.15, mate: 1.7 };
const OPACITY = { selected: 0.9, target: 0.95, capture: 0.85, last: 0.45, check: 1, mate: 1 };

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export class Highlights {
  group = new THREE.Group();
  #texture = glowTexture();
  #geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  #pool = [];
  #used = 0;
  #clock = 0;

  #take(kind, square) {
    let mesh = this.#pool[this.#used];
    if (!mesh) {
      mesh = new THREE.Mesh(this.#geometry, new THREE.MeshBasicMaterial({
        map: this.#texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      mesh.renderOrder = 2;
      this.#pool.push(mesh);
      this.group.add(mesh);
    }
    this.#used++;
    mesh.visible = true;
    mesh.material.color.setHex(COLORS[kind]);
    mesh.material.opacity = OPACITY[kind];
    mesh.userData.pulse = kind === 'mate';
    mesh.scale.setScalar(SCALES[kind]);
    mesh.position.copy(squareToWorld(square)).setY(0.012);
  }

  /**
   * @param {{ selected?: string, targets?: {square:string, capture:boolean}[], last?: string[], check?: string, mate?: string }} marks
   */
  set({ selected, targets = [], last = [], check, mate } = {}) {
    this.#used = 0;
    last.forEach((square) => this.#take('last', square));
    if (selected) this.#take('selected', selected);
    targets.forEach(({ square, capture }) => this.#take(capture ? 'capture' : 'target', square));
    if (mate) this.#take('mate', mate);
    if (check) this.#take('check', check);
    for (let i = this.#used; i < this.#pool.length; i++) this.#pool[i].visible = false;
  }

  /** Makes the checkmate mark breathe. */
  update(dt) {
    this.#clock += dt;
    const level = 0.7 + 0.3 * Math.sin(this.#clock * 4);
    for (let i = 0; i < this.#used; i++) {
      const mesh = this.#pool[i];
      if (mesh.userData.pulse) mesh.material.opacity = level;
    }
  }

  dispose() {
    this.#texture.dispose();
    this.#geometry.dispose();
    this.#pool.forEach((mesh) => mesh.material.dispose());
    this.#pool = [];
    this.group.clear();
  }
}
