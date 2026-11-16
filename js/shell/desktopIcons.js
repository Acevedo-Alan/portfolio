/*
 * shell/desktopIcons.js — the desktop icons. They live on a grid, can be
 * dragged to any free cell (snapping, never overlapping), and remember where
 * they were left (localStorage). On phones they simply flow in a wrapping
 * row (CSS) and dragging is off.
 *
 * Layout rules:
 *   - saved cells are honoured first (clamped to the current screen);
 *   - icons without a saved cell fill the first free cells, top-to-bottom,
 *     left-to-right;
 *   - dropping on an occupied cell moves the icon to the nearest free one.
 */

import { $, icon, clamp } from '../core/dom.js';
import { isMobile, desktopSize } from '../core/viewport.js';
import * as bus from '../core/bus.js';
import * as storage from '../core/storage.js';
import * as windows from './windowManager.js';
import { translate } from '../i18n/i18n.js';

const CELL_W = 92;
const CELL_H = 88;
const PAD = 8;
const DRAG_THRESHOLD = 5;       // px before a press becomes a drag
const HOVER_TIP_DELAY_MS = 700;
const STORAGE_KEY = 'portfolio-icons';

let apps = [];
const buttons = new Map();       // id -> <button>
const cells = new Map();         // id -> { col, row }
let saved = {};
let suppressClick = false;

export function init(appList) {
  apps = appList;
  saved = storage.getJSON(STORAGE_KEY, {}) || {};
  const container = $('#desktop-icons');

  apps.forEach((app) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'd-icon';
    btn.innerHTML = `${icon(app.icon)}<span data-i18n="${app.title}"></span>`;
    btn.addEventListener('click', () => {
      if (suppressClick) return;
      windows.open(app.id);
    });
    wireHoverTip(btn, app.id);
    wireDrag(btn, app.id, container);
    container.appendChild(btn);
    buttons.set(app.id, btn);
  });

  translate(container);
  layout();
  window.addEventListener('resize', layout);
}

// ---------- Grid ----------

function grid() {
  const { w, h } = desktopSize();
  return {
    cols: Math.max(1, Math.floor((w - PAD) / CELL_W)),
    rows: Math.max(1, Math.floor((h - PAD) / CELL_H)),
  };
}

const clampCell = (cell, g) => ({ col: clamp(cell.col, 0, g.cols - 1), row: clamp(cell.row, 0, g.rows - 1) });
const sameCell = (a, b) => a.col === b.col && a.row === b.row;
const isTaken = (cell, exceptId) => [...cells].some(([id, other]) => id !== exceptId && sameCell(other, cell));

/** Nearest free cell to `cell`, searching outwards in square rings. */
function nearestFree(cell, g, exceptId) {
  const start = clampCell(cell, g);
  if (!isTaken(start, exceptId)) return start;
  for (let d = 1; d <= g.cols + g.rows; d++) {
    for (let dc = -d; dc <= d; dc++) {
      for (let dr = -d; dr <= d; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
        const candidate = { col: start.col + dc, row: start.row + dr };
        const inside = candidate.col >= 0 && candidate.col < g.cols && candidate.row >= 0 && candidate.row < g.rows;
        if (inside && !isTaken(candidate, exceptId)) return candidate;
      }
    }
  }
  return start;
}

/** First free cell in reading order (top-to-bottom, then next column). */
function firstFree(g) {
  for (let col = 0; col < g.cols; col++) {
    for (let row = 0; row < g.rows; row++) {
      if (!isTaken({ col, row })) return { col, row };
    }
  }
  return { col: 0, row: 0 };
}

function layout() {
  if (isMobile()) {
    buttons.forEach((btn) => { btn.style.left = ''; btn.style.top = ''; });
    return;
  }
  const g = grid();
  cells.clear();
  apps.filter((a) => saved[a.id]).forEach((a) => cells.set(a.id, nearestFree(saved[a.id], g, a.id)));
  apps.filter((a) => !saved[a.id]).forEach((a) => cells.set(a.id, firstFree(g)));
  cells.forEach((cell, id) => place(buttons.get(id), cell));
}

function place(btn, cell) {
  btn.style.left = PAD + cell.col * CELL_W + 'px';
  btn.style.top = PAD + cell.row * CELL_H + 'px';
}

// ---------- Interaction ----------

function wireHoverTip(btn, id) {
  let timer = null;
  btn.addEventListener('mouseenter', () => {
    timer = setTimeout(() => bus.emit('icon:hover', { id }), HOVER_TIP_DELAY_MS);
  });
  btn.addEventListener('mouseleave', () => clearTimeout(timer));
  btn.addEventListener('pointerdown', () => clearTimeout(timer));
}

function wireDrag(btn, id, container) {
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || isMobile()) return;
    const origin = container.getBoundingClientRect();
    const rect = btn.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    let dragging = false;
    btn.setPointerCapture(e.pointerId);        // keep receiving moves even if the pointer outruns the icon

    const move = (ev) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD) return;
        dragging = true;
        btn.classList.add('dragging');
      }
      btn.style.left = clamp(ev.clientX - origin.left - offsetX, 0, origin.width - rect.width) + 'px';
      btn.style.top = clamp(ev.clientY - origin.top - offsetY, 0, origin.height - rect.height) + 'px';
    };

    const up = () => {
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', up);
      if (!dragging) return;
      btn.classList.remove('dragging');
      suppressClick = true;                    // the click that follows a drop must not open the app
      setTimeout(() => { suppressClick = false; }, 0);
      drop(btn, id);
    };

    btn.addEventListener('pointermove', move);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  });
}

function drop(btn, id) {
  const g = grid();
  const wanted = {
    col: Math.round((parseFloat(btn.style.left) - PAD) / CELL_W),
    row: Math.round((parseFloat(btn.style.top) - PAD) / CELL_H),
  };
  const cell = nearestFree(wanted, g, id);
  cells.set(id, cell);
  place(btn, cell);
  saved = Object.fromEntries(cells);          // once any icon moves, every icon's spot is remembered
  storage.setJSON(STORAGE_KEY, saved);
}
