/*
 * render/ChessRenderer.js — the 3D scene. Knows nothing about chess rules: it draws a board,
 * lights it, and runs the render loop. Usage:
 *
 *   const game = new ChessRenderer(canvas);
 *   ...
 *   game.dispose();      // when the window closes: frees all GPU memory and stops the loop
 *
 * dispose() is final. A canvas whose WebGL context was released can't be reused, so the caller
 * creates a new canvas (and a new ChessRenderer) the next time the window opens.
 */

import * as THREE from './three.js';
import { BoardMesh } from './BoardMesh.js';
import { CameraRig } from './CameraRig.js';
import { Pieces } from './Pieces.js';
import { Highlights } from './Highlights.js';
import { squareToWorld } from './BoardMesh.js';

/** A tiny scene of light panels, baked once into reflections so the glossy surfaces have something to mirror. */
function makeEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x30343c);
  const panel = (w, h, x, y, z, intensity) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity), side: THREE.DoubleSide }));
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  panel(14, 8, 0, 12, 0, 4);
  panel(6, 10, -12, 5, 4, 2.5);
  panel(6, 10, 12, 5, -4, 1.8);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.04);
  pmrem.dispose();
  scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return target;
}

export class ChessRenderer {
  scene = new THREE.Scene();
  board;
  rig;
  pieces = new Pieces();
  highlights = new Highlights();
  /** Called with a square name ('e4') when the board or a piece is clicked (not dragged). @type {((square: string) => void) | null} */
  onSquareClick = null;
  /** Called with the square under the pointer ('e4'), or null off the board, as the mouse moves. @type {((square: string|null) => void) | null} */
  onSquareHover = null;

  #canvas;
  #renderer;
  #envTarget;
  #resizeObserver;
  #updaters = new Set();       // functions called every frame with the seconds since the last one
  #last = 0;
  #disposed = false;
  #raycaster = new THREE.Raycaster();
  #onPointerUp = (e) => { if (e.button === 0 && !this.rig.dragged && this.onSquareClick) { const square = this.#squareAt(e); if (square) this.onSquareClick(square); } };
  #hoverQueued = false;
  #onPointerMove = (e) => {
    if (!this.onSquareHover || e.buttons || this.#hoverQueued) return;
    this.#hoverQueued = true;                                 // at most one picking test per frame
    requestAnimationFrame(() => { this.#hoverQueued = false; if (!this.#disposed && this.onSquareHover) this.onSquareHover(this.#squareAt(e)); });
  };

  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.#canvas = canvas;
    this.#renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    const renderer = this.#renderer;
    renderer.setClearColor(0x000000, 0);                    // the window's CSS background shows through
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    let downgraded = false;
    renderer.debug.onShaderError = () => {                   // the glossy piece shader failed (seen on some Macs)
      if (downgraded || this.#disposed) return;
      downgraded = true;
      console.warn('Piece shader failed to compile; using simple materials.');
      this.pieces.useSimpleMaterials();
    };

    this.#envTarget = makeEnvironment(renderer);
    this.scene.environment = this.#envTarget.texture;
    this.scene.environmentIntensity = 0.7;

    this.board = new BoardMesh();
    this.scene.add(this.board.group, this.highlights.group, this.pieces.group);
    this.addUpdater((dt) => { this.pieces.update(dt); this.highlights.update(dt); });
    canvas.addEventListener('pointerup', this.#onPointerUp);
    canvas.addEventListener('pointermove', this.#onPointerMove);
    this.#addLights();
    this.#addFloor();

    this.rig = new CameraRig(canvas);
    this.#resizeObserver = new ResizeObserver(() => this.resize());
    this.#resizeObserver.observe(canvas.parentElement || canvas);
    this.resize();
    renderer.setAnimationLoop((time) => this.#frame(time));
  }

  /** Slowly circles the camera around a square (the checkmated king) or the whole board (null). Dragging stops it. */
  orbitAround(square) {
    this.rig.focusOn(square ? squareToWorld(square) : null);
    this.rig.autoOrbit = true;
  }

  /** Where a square is in the world: [x, y, z]. */
  squareWorld(square) { return squareToWorld(square).toArray(); }

  /** The camera's position and direction, for placing the listener of the spatial sounds. */
  listenerPose() {
    const camera = this.rig.camera;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    return { position: camera.position.toArray(), forward: forward.toArray(), up: camera.up.toArray() };
  }

  /** Runs `fn(dt)` every frame (animations use this). Returns a function that stops it. */
  addUpdater(fn) {
    this.#updaters.add(fn);
    return () => this.#updaters.delete(fn);
  }

  /** The square under a pointer event, or null. */
  #squareAt(e) {
    const box = this.#canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1);
    this.#raycaster.setFromCamera(ndc, this.rig.camera);
    const hits = this.#raycaster.intersectObjects([...this.pieces.group.children, ...this.board.squares], true);
    for (const hit of hits) {
      for (let o = hit.object; o; o = o.parent) {
        if (o.userData.square) return o.userData.square;
      }
    }
    return null;
  }

  resize() {
    if (this.#disposed) return;
    const host = this.#canvas.parentElement || this.#canvas;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.#renderer.setSize(width, height, false);          // false: CSS decides the canvas size
    this.rig.setAspect(width / height);
  }

  #addLights() {
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2a20, 0.55));
    // The key light: a spot a little off-center, so the pieces and the frame cast defined shadows
    // on the marble and the board shades toward the corners.
    const spot = new THREE.SpotLight(0xfff1dc, 560, 0, 0.55, 0.55, 2);
    spot.position.set(-4, 12, 6);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.camera.near = 5;
    spot.shadow.camera.far = 28;
    spot.shadow.radius = 4;
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    this.scene.add(spot);
    const fill = new THREE.DirectionalLight(0x9db8ff, 0.6);
    fill.position.set(6, 5, -6);
    this.scene.add(fill);
  }

  /** An invisible floor that only shows the board's shadow. */
  #addFloor() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.4 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.26;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  #frame(time) {
    const dt = Math.min((time - this.#last) / 1000, 0.1) || 0;
    this.#last = time;
    if (this.#canvas.getClientRects().length === 0) return;   // window minimized or hidden: skip drawing
    this.rig.update(1 - Math.exp(-dt * 10), dt);
    this.#updaters.forEach((fn) => fn(dt));
    this.#renderer.render(this.scene, this.rig.camera);
  }

  /** Stops the loop, removes every listener and frees all geometry, materials, textures and the WebGL context. */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#renderer.setAnimationLoop(null);
    this.#resizeObserver.disconnect();
    this.#updaters.clear();
    this.#canvas.removeEventListener('pointerup', this.#onPointerUp);
    this.#canvas.removeEventListener('pointermove', this.#onPointerMove);
    this.onSquareClick = null;
    this.onSquareHover = null;
    this.rig.dispose();
    this.board.dispose();
    this.pieces.dispose();
    this.highlights.dispose();

    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const materials = [].concat(object.material || []);
      materials.forEach((material) => {
        Object.values(material).forEach((value) => { if (value && value.isTexture) value.dispose(); });
        material.dispose();
      });
    });
    this.scene.clear();
    this.#envTarget.dispose();
    this.#renderer.dispose();
    this.#renderer.forceContextLoss();                     // hand the GPU context back right now
  }
}
