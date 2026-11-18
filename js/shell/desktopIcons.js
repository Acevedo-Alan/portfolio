/*
 * shell/desktopIcons.js — the desktop icons. They live on a grid, can be
 * dragged to any free cell (snapping, never overlapping), and remember where
 * they were left (localStorage). A click selects an icon the classic XP way
 * (blue-tinted icon, dark-blue label, dotted outline) and opens its app.
 * Drag on empty desktop to draw a selection rectangle; Ctrl+click or Ctrl+drag adds to the
 * selection, and dragging any selected icon moves the whole group.
 * "Arrange Icons By" (context menu) re-sorts them, and two toggles live beside it:
 *   Auto Arrange   icons always pack from the top-left in order; dragging one re-orders the line-up
 *   Align to Grid  on (default) icons snap to cells; off, they stay exactly where they are dropped
 * Dropping icons on the Recycle Bin opens it instead of moving them. On phones the icons flow
 * in a wrapping row (CSS) and dragging is off.
 *
 * Layout rules (Auto Arrange off):
 *   - saved cells are honoured first (clamped to the current screen);
 *   - icons without a saved cell fill the first free cells, top-to-bottom,
 *     left-to-right;
 *   - dropping on an occupied cell moves the icon to the nearest free one.
 * Saved entries are { col, row } for a grid cell or { x, y } for a free pixel position.
 */

import { $, icon, clamp } from '../core/dom.js';
import { isMobile, desktopSize } from '../core/viewport.js';
import * as bus from '../core/bus.js';
import * as storage from '../core/storage.js';
import * as windows from './windowManager.js';
import { play } from '../audio/sounds.js';
import { translate, t, getLang } from '../i18n/i18n.js';
import { GROUP_ORDER } from '../apps/registry.js';

const CELL_W = 92;
const CELL_H = 88;
const PAD = 8;
const DRAG_THRESHOLD = 5;       // px before a press becomes a drag
const HOVER_TIP_DELAY_MS = 700;
const STORAGE_KEY = 'portfolio-icons';
const AUTO_KEY = 'portfolio-icons-auto';       // '1' = Auto Arrange on
const GRID_KEY = 'portfolio-icons-grid';       // '0' = Align to Grid off (default on)
const ORDER_KEY = 'portfolio-icons-order';     // the line-up while Auto Arrange is on
const BIN_ID = 'papelera';

let apps = [];
let container = null;
const buttons = new Map();       // id -> <button>
const cells = new Map();         // id -> { col, row }   icons on the grid
const free = new Map();          // id -> { x, y }       icons placed at an exact spot (Align to Grid off)
let saved = {};
const selected = new Set();      // ids of the selected icons
let suppressClick = false;
let autoArrange = false;
let alignToGrid = true;

export function init(appList) {
  apps = appList.filter((app) => app.desktop !== false);
  saved = storage.getJSON(STORAGE_KEY, {}) || {};
  autoArrange = storage.get(AUTO_KEY) === '1';
  alignToGrid = storage.get(GRID_KEY) !== '0';
  container = $('#desktop-icons');

  const order = storage.getJSON(ORDER_KEY, null);
  if (autoArrange && Array.isArray(order)) {
    const rank = (app) => (order.includes(app.id) ? order.indexOf(app.id) : order.length);
    apps = [...apps].sort((a, b) => rank(a) - rank(b));
  }

  apps.forEach((app) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'd-icon';
    btn.dataset.app = app.id;
    btn.dataset.group = app.group || '';
    btn.innerHTML = `<span class="d-glyph">${icon(app.icon)}</span><span class="d-label" data-i18n="${app.title}"></span>`;
    btn.addEventListener('click', (e) => {
      if (suppressClick || e.ctrlKey || e.metaKey) return;      // Ctrl+click only toggles the selection
      select(app.id);
      windows.open(app.id);
    });
    btn.addEventListener('contextmenu', () => { if (!selected.has(app.id)) select(app.id); });
    wireHoverTip(btn, app.id);
    wireDrag(btn, app.id);
    container.appendChild(btn);
    buttons.set(app.id, btn);
  });

  // Clicking anywhere that isn't an icon (or a context menu) clears the selection.
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.d-icon') && !e.target.closest('.ctx-menu') && !e.ctrlKey && !e.metaKey) select(null);
  });
  wireBand();

  translate(container);
  layout();
  window.addEventListener('resize', layout);
}

// ---------- Selection ----------

/** Selects exactly `ids` (a single id, an array, or null for none). */
function select(ids) {
  selected.clear();
  [].concat(ids ?? []).forEach((id) => selected.add(id));
  paintSelection();
}

function paintSelection() {
  buttons.forEach((btn, id) => btn.classList.toggle('selected', selected.has(id)));
}

// ---------- Selection rectangle ----------

/** Drag on the empty desktop to draw a rectangle; every icon it touches gets selected. */
function wireBand() {
  const desktop = $('#desktop');
  desktop.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || isMobile() || (e.target !== desktop && e.target !== container)) return;
    const origin = container.getBoundingClientRect();
    const base = e.ctrlKey || e.metaKey ? new Set(selected) : new Set();   // Ctrl keeps the current selection
    const band = document.createElement('div');
    band.className = 'd-band';
    let drawing = false;
    desktop.setPointerCapture(e.pointerId);

    const move = (ev) => {
      if (!drawing) {
        if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD) return;
        drawing = true;
        container.appendChild(band);
      }
      const left = Math.min(e.clientX, ev.clientX);
      const top = Math.min(e.clientY, ev.clientY);
      const right = Math.max(e.clientX, ev.clientX);
      const bottom = Math.max(e.clientY, ev.clientY);
      Object.assign(band.style, { left: left - origin.left + 'px', top: top - origin.top + 'px', width: right - left + 'px', height: bottom - top + 'px' });
      selected.clear();
      base.forEach((id) => selected.add(id));
      buttons.forEach((btn, id) => {
        const r = btn.getBoundingClientRect();
        if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) selected.add(id);
      });
      paintSelection();
    };

    const up = () => {
      desktop.removeEventListener('pointermove', move);
      desktop.removeEventListener('pointerup', up);
      desktop.removeEventListener('pointercancel', up);
      band.remove();
    };
    desktop.addEventListener('pointermove', move);
    desktop.addEventListener('pointerup', up);
    desktop.addEventListener('pointercancel', up);
  });
}

// ---------- Arranging ----------

const byName = (a, b) => t(a.title).localeCompare(t(b.title), getLang());
const COMPARATORS = {
  name: byName,
  size: (a, b) => a.w * a.h - b.w * b.h || byName(a, b),                 // by window area, smallest first
  type: (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || byName(a, b),
};

/** Re-sorts the icons by 'name' | 'size' | 'type' and lays them out in that order. */
export function arrangeBy(mode) {
  apps = [...apps].sort(COMPARATORS[mode] || COMPARATORS.name);
  reorderDom();                                                          // DOM order drives the phone layout
  if (isMobile()) return;
  packInOrder();
}

/** Re-applies the saved layout (the "Refresh" menu item). */
export const refresh = layout;

export const isAutoArrange = () => autoArrange;
export const isAlignToGrid = () => alignToGrid;

export function toggleAutoArrange() {
  autoArrange = !autoArrange;
  storage.set(AUTO_KEY, autoArrange ? '1' : '0');
  if (autoArrange && !isMobile()) {
    apps = [...apps].sort((a, b) => positionKey(a.id) - positionKey(b.id));   // keep the order they currently read in
    reorderDom();
  }
  layout();
}

export function toggleAlignToGrid() {
  alignToGrid = !alignToGrid;
  storage.set(GRID_KEY, alignToGrid ? '1' : '0');
  if (!alignToGrid || isMobile() || autoArrange) return;
  const g = grid();                                                      // turning it back on: snap loose icons to cells
  [...free.keys()].forEach((id) => {
    free.delete(id);
    const cell = nearestFree(cellFromPx(buttons.get(id)), g, id);
    cells.set(id, cell);
    place(buttons.get(id), cell);
  });
  persist();
}

/** Column-major reading order of an icon's current position (used to keep the order when Auto Arrange turns on). */
function positionKey(id) {
  const cell = cellFromPx(buttons.get(id));
  return cell.col * 1000 + cell.row;
}

function reorderDom() {
  apps.forEach((app) => container.appendChild(buttons.get(app.id)));
}

/** Puts every icon in the grid in the current `apps` order, and remembers it. */
function packInOrder() {
  const g = grid();
  cells.clear();
  free.clear();
  apps.forEach((app) => cells.set(app.id, firstFree(g)));
  cells.forEach((cell, id) => place(buttons.get(id), cell));
  persist();
}

function persist() {
  saved = { ...Object.fromEntries(cells), ...Object.fromEntries(free) };
  storage.setJSON(STORAGE_KEY, saved);
  if (autoArrange) storage.setJSON(ORDER_KEY, apps.map((app) => app.id));
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

/** The grid cell closest to where a button currently sits. */
const cellFromPx = (btn) => ({
  col: Math.round((parseFloat(btn.style.left) - PAD) / CELL_W),
  row: Math.round((parseFloat(btn.style.top) - PAD) / CELL_H),
});

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
  if (autoArrange) { packInOrder(); return; }
  const g = grid();
  const { w, h } = desktopSize();
  cells.clear();
  free.clear();
  apps.filter((a) => saved[a.id] && 'x' in saved[a.id]).forEach((a) => {
    const btn = buttons.get(a.id);
    const spot = { x: clamp(saved[a.id].x, 0, Math.max(0, w - (btn.offsetWidth || CELL_W))), y: clamp(saved[a.id].y, 0, Math.max(0, h - (btn.offsetHeight || CELL_H))) };
    free.set(a.id, spot);
    btn.style.left = spot.x + 'px';
    btn.style.top = spot.y + 'px';
  });
  apps.filter((a) => saved[a.id] && !('x' in saved[a.id])).forEach((a) => cells.set(a.id, nearestFree(saved[a.id], g, a.id)));
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

function wireDrag(btn, id) {
  btn.addEventListener('pointerdown', (e) => {
    if (e.button === 0 || e.button === 2) {                     // press selects (left or right button)
      if (e.ctrlKey || e.metaKey) { selected.has(id) ? selected.delete(id) : selected.add(id); paintSelection(); }
      else if (!selected.has(id)) select(id);                   // pressing inside a group keeps the group, so it can be dragged
    }
    if (e.button !== 0 || isMobile() || e.ctrlKey || e.metaKey || !selected.has(id)) return;
    const origin = container.getBoundingClientRect();
    const group = [...selected].filter((other) => buttons.has(other));
    const start = new Map(group.map((other) => {
      const b = buttons.get(other);
      return [other, { left: parseFloat(b.style.left), top: parseFloat(b.style.top), w: b.offsetWidth, h: b.offsetHeight }];
    }));
    const bin = buttons.get(BIN_ID);
    let dragging = false;
    let overBin = false;
    btn.setPointerCapture(e.pointerId);        // keep receiving moves even if the pointer outruns the icon

    const move = (ev) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < DRAG_THRESHOLD) return;
        dragging = true;
        group.forEach((other) => buttons.get(other).classList.add('dragging'));
      }
      const dx = ev.clientX - e.clientX;
      const dy = ev.clientY - e.clientY;
      group.forEach((other) => {
        const from = start.get(other);
        const b = buttons.get(other);
        b.style.left = clamp(from.left + dx, 0, origin.width - from.w) + 'px';
        b.style.top = clamp(from.top + dy, 0, origin.height - from.h) + 'px';
      });
      overBin = !!bin && !group.includes(BIN_ID) && pointerIn(ev, bin);
      bin?.classList.toggle('drop-target', overBin);
    };

    const up = () => {
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', up);
      bin?.classList.remove('drop-target');
      if (!dragging) return;
      group.forEach((other) => buttons.get(other).classList.remove('dragging'));
      suppressClick = true;                    // the click that follows a drop must not open the app
      setTimeout(() => { suppressClick = false; }, 0);
      if (overBin) sendToBin(group, start); else drop(group, id, start);
    };

    btn.addEventListener('pointermove', move);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  });
}

const pointerIn = (ev, el) => {
  const r = el.getBoundingClientRect();
  return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
};

/** Dropping on the Recycle Bin: the icons spring back to where they were and the bin opens (nothing is deleted). */
function sendToBin(group, start) {
  group.forEach((id) => {
    const from = start.get(id);
    const btn = buttons.get(id);
    btn.style.left = from.left + 'px';
    btn.style.top = from.top + 'px';
  });
  play('exclamation');
  windows.open(BIN_ID);
}

/** Settles dragged icons where they were dropped, according to the arrange settings. */
function drop(group, grabbedId, start) {
  const g = grid();
  const grabbed = buttons.get(grabbedId);

  if (autoArrange) {                           // re-order the line-up: the icons land where the pointer's cell falls in it
    const wanted = cellFromPx(grabbed);
    const index = clamp(clamp(wanted.col, 0, g.cols - 1) * g.rows + clamp(wanted.row, 0, g.rows - 1), 0, apps.length - group.length);
    const moved = apps.filter((app) => group.includes(app.id));
    const rest = apps.filter((app) => !group.includes(app.id));
    apps = [...rest.slice(0, index), ...moved, ...rest.slice(index)];
    reorderDom();
    packInOrder();
    return;
  }

  if (!alignToGrid) {                          // stay exactly where they were dropped
    group.forEach((id) => {
      const btn = buttons.get(id);
      cells.delete(id);
      free.set(id, { x: parseFloat(btn.style.left), y: parseFloat(btn.style.top) });
    });
    persist();
    return;
  }

  const startCell = (id) => ({
    col: Math.round((start.get(id).left - PAD) / CELL_W),
    row: Math.round((start.get(id).top - PAD) / CELL_H),
  });
  const wanted = cellFromPx(grabbed);
  const before = startCell(grabbedId);
  const shift = { col: wanted.col - before.col, row: wanted.row - before.row };
  const targets = group.map((id) => [id, { col: startCell(id).col + shift.col, row: startCell(id).row + shift.row }]);
  group.forEach((id) => { cells.delete(id); free.delete(id); });   // free their old cells so they can land on each other's
  targets.forEach(([id, target]) => {
    const cell = nearestFree(target, g, id);
    cells.set(id, cell);
    place(buttons.get(id), cell);
  });
  persist();
}
