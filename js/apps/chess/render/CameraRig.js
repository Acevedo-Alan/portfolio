/*
 * render/CameraRig.js — a small orbit camera around the board: drag to turn, wheel to zoom.
 * The angles are limited so you can't dive under the board or lose it. Movement eases toward
 * the target values, so it feels smooth. It reports whether the last pointer press was a drag,
 * so picking can tell a click from a turn of the camera.
 */

import * as THREE from './three.js';

const MIN_POLAR = THREE.MathUtils.degToRad(20);
const MAX_POLAR = THREE.MathUtils.degToRad(72);
const MIN_DISTANCE = 8;
const MAX_DISTANCE = 18;
const DRAG_PIXELS = 5;          // moving less than this is a click, not a drag

export class CameraRig {
  /** @type {THREE.PerspectiveCamera} */
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  /** True when the last press moved far enough to count as a camera drag. */
  dragged = false;
  /** While true the camera drifts around its target (until the player drags). */
  autoOrbit = false;

  #canvas;
  #azimuth = 0;  #polar = THREE.MathUtils.degToRad(52);  #distance = 13;
  #goalAzimuth = 0;  #goalPolar = this.#polar;  #goalDistance = this.#distance;
  #pointer = null;            // { id, x, y, startX, startY } while a button is held
  #target = new THREE.Vector3();
  #goalTarget = new THREE.Vector3();
  #off = [];                  // functions that remove each listener

  constructor(canvas) {
    this.#canvas = canvas;
    const on = (type, fn, options) => {
      canvas.addEventListener(type, fn, options);
      this.#off.push(() => canvas.removeEventListener(type, fn, options));
    };
    on('pointerdown', (e) => this.#down(e));
    on('pointermove', (e) => this.#move(e));
    on('pointerup', (e) => this.#up(e));
    on('pointercancel', (e) => this.#up(e));
    on('wheel', (e) => this.#wheel(e), { passive: false });
    this.update(1);
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Keeps the angles within one turn, so going back to a side never spins several times. */
  #unwind() {
    const turns = Math.round(this.#azimuth / (Math.PI * 2)) * Math.PI * 2;
    this.#azimuth -= turns;
    this.#goalAzimuth -= turns;
  }

  /** Swings around to look from black's side, or back to white's. */
  turnTo(white) { this.#unwind(); this.#goalAzimuth = white ? 0 : Math.PI; }

  /** Eases toward a point on the board and a little closer to it; null goes back to the whole board. */
  focusOn(point) {
    if (point) {
      this.#goalTarget.copy(point).multiplyScalar(0.5);
      this.#goalDistance = 9.5;
      this.#goalPolar = THREE.MathUtils.degToRad(46);
    } else {
      this.#goalTarget.set(0, 0, 0);
      this.#goalDistance = 13;
      this.#goalPolar = THREE.MathUtils.degToRad(52);
    }
  }

  /** Stops the orbit and returns to the default view (a new game starts). */
  release() { this.autoOrbit = false; this.focusOn(null); this.#unwind(); }

  #down(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.dragged = false;
    this.autoOrbit = false;                              // the player takes over
    this.#pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
    this.#canvas.setPointerCapture(e.pointerId);
  }

  #move(e) {
    const p = this.#pointer;
    if (!p || e.pointerId !== p.id) return;
    if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > DRAG_PIXELS) this.dragged = true;
    if (!this.dragged) return;
    this.#goalAzimuth -= (e.clientX - p.x) * 0.006;
    this.#goalPolar = THREE.MathUtils.clamp(this.#goalPolar - (e.clientY - p.y) * 0.004, MIN_POLAR, MAX_POLAR);
    p.x = e.clientX;
    p.y = e.clientY;
  }

  #up(e) {
    if (this.#pointer && e.pointerId === this.#pointer.id) {
      if (this.#canvas.hasPointerCapture(e.pointerId)) this.#canvas.releasePointerCapture(e.pointerId);
      this.#pointer = null;
    }
  }

  #wheel(e) {
    e.preventDefault();
    this.#goalDistance = THREE.MathUtils.clamp(this.#goalDistance * (1 + Math.sign(e.deltaY) * 0.08), MIN_DISTANCE, MAX_DISTANCE);
  }

  /** @param {number} k how much of the remaining distance to cover this frame (0..1) */
  update(k, dt = 0) {
    if (this.autoOrbit && !this.#pointer) this.#goalAzimuth += dt * 0.4;
    this.#target.lerp(this.#goalTarget, k);
    this.#azimuth += (this.#goalAzimuth - this.#azimuth) * k;
    this.#polar += (this.#goalPolar - this.#polar) * k;
    this.#distance += (this.#goalDistance - this.#distance) * k;
    const flat = Math.sin(this.#polar) * this.#distance;
    this.camera.position.set(this.#target.x + Math.sin(this.#azimuth) * flat, this.#target.y + Math.cos(this.#polar) * this.#distance, this.#target.z + Math.cos(this.#azimuth) * flat);
    this.camera.lookAt(this.#target);
  }

  dispose() {
    this.#off.forEach((remove) => remove());
    this.#off = [];
    this.#pointer = null;
  }
}
