/*
 * render/materials.js — glossy marble and wood, made from procedural canvas textures
 * (no image files to download). Every texture it creates is returned so the renderer can dispose it.
 */

import * as THREE from './three.js';

const SIZE = 256;

/** Tiny seeded random so a texture variant looks the same every time. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  draw(canvas.getContext('2d'));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Marble: a flat base color crossed by soft, wandering veins and a little grain. */
function marble(base, vein, seed) {
  return canvasTexture((g) => {
    const rand = rng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, SIZE, SIZE);
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = rand() * SIZE;
      let y = rand() * SIZE;
      let angle = rand() * Math.PI * 2;
      g.strokeStyle = vein;
      g.globalAlpha = 0.1 + rand() * 0.25;
      g.lineWidth = 0.6 + rand() * 2.2;
      g.beginPath();
      g.moveTo(x, y);
      for (let step = 0; step < 14; step++) {
        angle += (rand() - 0.5) * 1.1;
        x += Math.cos(angle) * 22;
        y += Math.sin(angle) * 22;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 0.05;
    for (let i = 0; i < 700; i++) {
      g.fillStyle = rand() > 0.5 ? '#fff' : vein;
      g.fillRect(rand() * SIZE, rand() * SIZE, 1.5, 1.5);
    }
  });
}

/** Wood: long streaks of slightly different brown. */
function wood(base, grain, seed) {
  return canvasTexture((g) => {
    const rand = rng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 80; i++) {
      g.globalAlpha = 0.05 + rand() * 0.18;
      g.strokeStyle = grain;
      g.lineWidth = 0.5 + rand() * 3;
      const x = rand() * SIZE;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (rand() - 0.5) * 30, SIZE * 0.33, x + (rand() - 0.5) * 30, SIZE * 0.66, x + (rand() - 0.5) * 12, SIZE);
      g.stroke();
    }
  });
}

const glossy = (map, extra = {}) => new THREE.MeshPhysicalMaterial({
  map, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, ...extra,
});

/**
 * Everything the board is made of. `light` and `dark` hold a few variants each so the squares
 * don't all show the same veins.
 * @returns {{ light: THREE.Material[], dark: THREE.Material[], frame: THREE.Material, textures: THREE.Texture[] }}
 */
export function createBoardMaterials() {
  const textures = [];
  const make = (texture, extra) => { textures.push(texture); return glossy(texture, extra); };
  const light = [1, 2, 3, 4].map((n) => make(marble('#EEE7DA', '#A89F8E', n * 97)));
  const dark = [1, 2, 3, 4].map((n) => make(marble('#3E2F29', '#150E0B', n * 131)));
  const frameTexture = wood('#5B3A22', '#2A170B', 7);
  textures.push(frameTexture);
  const frame = new THREE.MeshPhysicalMaterial({ map: frameTexture, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  return { light, dark, frame, textures };
}
