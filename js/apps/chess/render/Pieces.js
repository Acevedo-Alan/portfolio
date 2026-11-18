/*
 * render/Pieces.js — the pieces on the board and their animation.
 * The renderer doesn't know chess: it is told "put these pieces here" (setPosition) or
 * given simple operations to play out (apply), which ChessGame.ops() produces:
 *   { type: 'capture', square }            a piece disappears
 *   { type: 'move', from, to }             a piece slides
 *   { type: 'promote', square, piece, color }  a pawn becomes another piece
 */

import * as THREE from './three.js';
import { PieceFactory } from './PieceFactory.js';
import { squareToWorld } from './BoardMesh.js';

const smooth = (u) => u * u * (3 - 2 * u);

export class Pieces {
  /** Every piece is a child of this group, with userData.square kept up to date. */
  group = new THREE.Group();
  #factory = new PieceFactory();
  #bySquare = new Map();
  #anims = [];
  #lifted = null;          // the piece raised because it is selected
  #easing = new Set();     // pieces whose body is still moving toward its lift target

  #spawn(square, type, color) {
    const piece = this.#factory.create(type, color);
    piece.position.copy(squareToWorld(square));
    piece.userData.square = square;
    this.group.add(piece);
    this.#bySquare.set(square, piece);
  }

  /** Raises the piece on `square` a little (the selected one); pass null to put it back down. */
  setLifted(square) {
    const next = square ? this.#bySquare.get(square) || null : null;
    if (next === this.#lifted) return;
    if (this.#lifted) this.#easing.add(this.#lifted);
    this.#lifted = next;
    if (next) this.#easing.add(next);
  }

  /** Replaces everything on the board. @param {{square:string, type:string, color:string}[]} list */
  setPosition(list) {
    this.#anims = [];
    this.#easing.clear();
    this.#lifted = null;
    this.#bySquare.clear();
    this.group.clear();
    list.forEach(({ square, type, color }) => this.#spawn(square, type, color));
  }

  /** Plays the operations with sliding and fading. Resolves when the last animation ends. */
  apply(ops) {
    return new Promise((resolve) => {
      let pending = 1;                                      // the extra 1 is released at the end, so an empty list still resolves
      const promotions = ops.filter((op) => op.type === 'promote');
      const end = () => {
        if (--pending > 0) return;
        promotions.forEach((op) => {
          const old = this.#bySquare.get(op.square);
          if (old) this.group.remove(old);
          this.#bySquare.delete(op.square);
          this.#spawn(op.square, op.piece, op.color);
        });
        resolve();
      };
      const run = (duration, delay, step, after) => {
        pending++;
        this.#anims.push({ t: -delay, duration, step, after: () => { after(); end(); } });
      };

      // Captured pieces are detached first so the mover can take over their square, then shrink away.
      ops.filter((op) => op.type === 'capture').forEach((op) => {
        const victim = this.#bySquare.get(op.square);
        if (!victim) return;
        this.#bySquare.delete(op.square);
        run(0.3, 0.12, (u) => victim.scale.setScalar(Math.max(0.001, 1 - smooth(u))), () => this.group.remove(victim));
      });

      ops.filter((op) => op.type === 'move').forEach((op) => {
        const piece = this.#bySquare.get(op.from);
        if (!piece) return;
        this.#bySquare.delete(op.from);
        this.#bySquare.set(op.to, piece);
        piece.userData.square = op.to;
        const a = squareToWorld(op.from);
        const b = squareToWorld(op.to);
        const arc = piece.userData.type === 'n' ? 0.9 : 0.3;     // knights jump
        run(Math.min(0.75, 0.3 + a.distanceTo(b) * 0.06), 0, (u) => {
          piece.position.lerpVectors(a, b, smooth(u));
          piece.position.y = Math.sin(Math.PI * u) * arc;
        }, () => piece.position.copy(b));
      });
      end();
    });
  }

  update(dt) {
    this.#easing.forEach((piece) => {
      const goal = piece === this.#lifted ? 0.14 : 0;
      const body = piece.userData.body;
      body.position.y += (goal - body.position.y) * Math.min(1, dt * 16);
      if (Math.abs(goal - body.position.y) < 0.002) { body.position.y = goal; this.#easing.delete(piece); }
    });
    if (!this.#anims.length) return;
    for (let i = this.#anims.length - 1; i >= 0; i--) {
      const anim = this.#anims[i];
      anim.t += dt;
      if (anim.t < 0) continue;
      const u = Math.min(1, anim.t / anim.duration);
      anim.step(u);
      if (u >= 1) { this.#anims.splice(i, 1); anim.after(); }
    }
  }

  /** Re-skins every piece with simple materials (used when the glossy shader can't compile). */
  useSimpleMaterials() {
    const { old, simple } = this.#factory.useSimpleMaterials();
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material === old.w) o.material = simple.w;
      else if (o.material === old.b) o.material = simple.b;
    });
    Object.values(old).forEach((m) => m.dispose());
  }

  dispose() {
    this.#anims = [];
    this.#easing.clear();
    this.#lifted = null;
    this.#bySquare.clear();
    this.group.clear();
    this.#factory.dispose();
  }
}
