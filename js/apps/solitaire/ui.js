/*
 * apps/solitaire/ui.js — Klondike Solitaire in a window, laid out like the Windows XP one:
 * a Game / Help menu bar under the title, the table, and a status bar with score and time.
 * Rules and scoring live in engine.js.
 *
 *   Game  Deal (F2) · Undo (Ctrl+Z) · Draw one / Draw three · Exit
 *   Help  Help Topics · About Solitaire
 *
 * Click-to-move (no drag, so it works with keyboard and touch): click a card to pick it up
 * (with everything stacked on it), then click where it should go; double-click sends a card
 * to its foundation; click the stock to draw. Every face-up card is a real <button> with a
 * spoken name ("King of spades"). Winning plays the classic bouncing-cards cascade
 * (skipped when visual effects are off).
 */

import { $, $$ } from '../../core/dom.js';
import * as bus from '../../core/bus.js';
import * as storage from '../../core/storage.js';
import { t, dict, translate } from '../../i18n/i18n.js';
import { play } from '../../audio/sounds.js';
import * as windows from '../../shell/windowManager.js';
import * as motion from '../../shell/motion.js';
import * as engine from './engine.js';

const GLYPHS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const DOWN_STEP = 12;    // px between face-down cards in a column
const UP_STEP = 24;      // px between face-up cards
const CARD_W = 64;
const CARD_H = 88;
const DRAW_KEY = 'portfolio-sol-draw';      // '1' | '3'
const MAX_UNDO = 300;

// The menu bar, as data. `act` names an entry of `actions` below.
const MENUS = [
  { key: 'sol-menu-game', items: [
    { key: 'sol-deal', act: 'deal', hint: 'F2' },
    { key: 'sol-undo', act: 'undo', hint: 'Ctrl+Z' },
    { sep: true },
    { key: 'sol-draw1', act: 'draw1', radio: true },
    { key: 'sol-draw3', act: 'draw3', radio: true },
    { sep: true },
    { key: 'sol-exit', act: 'exit' },
  ] },
  { key: 'sol-menu-help', items: [
    { key: 'sol-help-topics', act: 'help' },
    { sep: true },
    { key: 'sol-about', act: 'about' },
  ] },
];

export function mount() {
  const root = $('#win-solitaire .sol-body');
  const win = $('#win-solitaire');
  let drawCount = storage.get(DRAW_KEY) === '3' ? 3 : 1;
  let state = engine.deal(Math.random, drawCount);
  let selected = null;     // a "place" as described in engine.js
  let won = false;
  let history = [];        // snapshots for Undo
  let seconds = 0;
  let clock = null;
  let cascade = null;      // the running win animation, if any

  root.innerHTML = `
    <div class="sol-menubar" role="menubar" data-i18n-label="sol-menubar">
      ${MENUS.map((menu, m) => `
        <div class="sol-menu">
          <button type="button" class="sol-mbtn" role="menuitem" aria-haspopup="menu" aria-expanded="false" data-menu="${m}" data-i18n="${menu.key}"></button>
          <ul class="sol-dd" role="menu" hidden>
            ${menu.items.map((item) => (item.sep
    ? '<li class="sol-sep" role="separator"><hr></li>'
    : `<li role="none"><button type="button" class="sol-item" role="${item.radio ? 'menuitemradio' : 'menuitem'}" data-act="${item.act}"><span class="sol-check" aria-hidden="true"></span><span data-i18n="${item.key}"></span><kbd>${item.hint || ''}</kbd></button></li>`)).join('')}
          </ul>
        </div>`).join('')}
    </div>
    <div class="sol-stage">
      <div class="sol-table" id="sol-table"></div>
      <canvas class="sol-cascade" hidden aria-hidden="true"></canvas>
      <p class="sol-msg" id="sol-msg" role="status" hidden></p>
      <div class="sol-dialog-wrap" hidden></div>
    </div>
    <div class="sol-status" role="status">
      <span class="sol-score"></span><span class="sol-time"></span><span class="sol-moves"></span>
    </div>`;
  translate(root);

  const table = $('#sol-table', root);
  const stage = $('.sol-stage', root);
  const canvas = $('.sol-cascade', root);
  const dialogWrap = $('.sol-dialog-wrap', root);
  const scoreLabel = $('.sol-score', root);
  const timeLabel = $('.sol-time', root);
  const movesLabel = $('.sol-moves', root);

  const cardName = (card) => t('sol-card')
    .replace('%r', dict()['sol-ranks'][card.rank - 1])
    .replace('%s', dict()['sol-suits'][engine.SUITS.indexOf(card.suit)]);
  const sameSpot = (a, b) => !!a && !!b && a.zone === b.zone && a.index === b.index;

  // ---------- Clock ----------

  function tick() {
    if (windows.getStatus('solitaire') === 'open') { seconds++; paintStatus(); }   // time only passes while the window is up
  }
  function startClock() {
    if (clock || won) return;
    clock = setInterval(tick, 1000);
  }
  function stopClock() {
    clearInterval(clock);
    clock = null;
  }

  // ---------- Rendering ----------

  function cardEl(card, spot, { top = 0, pick = null, picked = false } = {}) {
    const el = document.createElement(card.up ? 'button' : 'div');
    el.className = `sol-card ${card.up ? (engine.isRed(card) ? 'red' : 'black') : 'back'}${picked ? ' picked' : ''}`;
    el.style.top = top + 'px';
    if (!card.up) { el.setAttribute('aria-hidden', 'true'); return el; }
    el.type = 'button';
    el.setAttribute('aria-label', cardName(card));
    el.setAttribute('aria-pressed', String(picked));
    el.innerHTML = `<span class="rk">${RANKS[card.rank - 1]}</span><span class="st">${GLYPHS[card.suit]}</span><span class="big" aria-hidden="true">${GLYPHS[card.suit]}</span>`;
    el.dataset.zone = spot.zone;
    if (spot.index !== undefined) el.dataset.index = spot.index;
    if (pick !== null) el.dataset.pick = pick;
    return el;
  }

  function slotEl(spot, labelKey, extra = '') {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'sol-slot ' + extra;
    el.dataset.zone = spot.zone;
    if (spot.index !== undefined) el.dataset.index = spot.index;
    el.setAttribute('aria-label', t(labelKey));
    return el;
  }

  function paintStatus() {
    scoreLabel.textContent = t('sol-score').replace('%n', state.score);
    timeLabel.textContent = t('sol-time').replace('%n', seconds);
    movesLabel.textContent = t('sol-moves').replace('%n', state.moves);
  }

  function paintMenus() {
    $('[data-act="undo"]', root).disabled = history.length === 0 || won;
    $$('.sol-item[role="menuitemradio"]', root).forEach((item) => {
      const on = (item.dataset.act === 'draw3') === (drawCount === 3);
      item.setAttribute('aria-checked', String(on));
      $('.sol-check', item).textContent = on ? '●' : '';
    });
  }

  function render() {
    table.replaceChildren();
    const top = document.createElement('div');
    top.className = 'sol-top';

    const stock = slotEl({ zone: 'stock' }, state.stock.length ? 'sol-stock' : 'sol-recycle', 'stock');
    stock.classList.toggle('empty', !state.stock.length);
    if (state.stock.length) stock.appendChild(cardEl({ up: false }, {}));
    const waste = document.createElement('div');
    waste.className = 'sol-pile';
    if (state.waste.length) waste.appendChild(cardEl(state.waste[state.waste.length - 1], { zone: 'waste' }, { picked: selected?.zone === 'waste' }));
    top.append(stock, waste);

    const foundations = document.createElement('div');
    foundations.className = 'sol-found';
    state.foundations.forEach((pile, index) => {
      const holder = document.createElement('div');
      holder.className = 'sol-pile';
      holder.appendChild(slotEl({ zone: 'foundation', index }, 'sol-foundation'));
      if (pile.length) holder.appendChild(cardEl(pile[pile.length - 1], { zone: 'foundation', index }, { picked: sameSpot(selected, { zone: 'foundation', index }) }));
      foundations.appendChild(holder);
    });
    top.appendChild(foundations);

    const tableau = document.createElement('div');
    tableau.className = 'sol-tableau';
    state.tableau.forEach((pile, index) => {
      const col = document.createElement('div');
      col.className = 'sol-pile col';
      col.appendChild(slotEl({ zone: 'tableau', index }, 'sol-column'));
      let y = 0;
      pile.forEach((card, i) => {
        const picked = selected?.zone === 'tableau' && selected.index === index && i >= pile.length - selected.count;
        col.appendChild(cardEl(card, { zone: 'tableau', index }, { top: y, pick: i, picked }));
        y += card.up ? UP_STEP : DOWN_STEP;
      });
      col.style.height = (y + CARD_H) + 'px';
      tableau.appendChild(col);
    });

    table.append(top, tableau);
    paintStatus();
    paintMenus();
  }

  function message(key) {
    const el = $('#sol-msg', root);
    el.hidden = !key;
    el.textContent = key ? t(key) : '';
  }

  // ---------- Game flow ----------

  /** Runs `change` on the state; keeps an undo snapshot (for Undo) only if it actually changed something. */
  function attempt(change) {
    const before = structuredClone(state);
    if (!change()) return false;
    history.push(before);
    if (history.length > MAX_UNDO) history.shift();
    startClock();
    return true;
  }

  function afterMove() {
    selected = null;
    won = engine.isWon(state);
    render();
    if (won) celebrate(); else message('');
  }

  function newGame() {
    stopCascade();
    stopClock();
    state = engine.deal(Math.random, drawCount);
    history = [];
    seconds = 0;
    won = false;
    selected = null;
    message('');
    render();
  }

  function undo() {
    if (!history.length || won) { play('error'); return; }
    state = history.pop();
    selected = null;
    render();
    play('menu');
  }

  function celebrate() {
    stopClock();
    play('startup');
    message('sol-won');
    startCascade();
  }

  // ---------- Win animation (the bouncing cards) ----------

  function stopCascade() {
    if (!cascade) return;
    cancelAnimationFrame(cascade.frame);
    cascade = null;
    canvas.hidden = true;
  }

  function startCascade() {
    if (!motion.isOn()) return;
    const rect = stage.getBoundingClientRect();
    canvas.width = Math.round(rect.width);
    canvas.height = Math.round(rect.height);
    canvas.hidden = false;
    const g = canvas.getContext('2d');
    const origins = $$('.sol-found .sol-pile', table).map((pile) => {
      const r = pile.getBoundingClientRect();
      return { x: r.left - rect.left, y: r.top - rect.top };
    });
    // Kings first, like the original: one card per foundation in turn, down to the aces.
    const queue = [];
    for (let rank = 13; rank >= 1; rank--) engine.SUITS.forEach((suit, pile) => queue.push({ rank, suit, pile }));
    let current = null;

    const drawCard = (card, x, y) => {
      const red = card.suit === 'H' || card.suit === 'D';
      g.fillStyle = '#fff';
      g.strokeStyle = '#555';
      g.lineWidth = 1;
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, CARD_W, CARD_H, 6); else g.rect(x, y, CARD_W, CARD_H);
      g.fill();
      g.stroke();
      g.fillStyle = red ? '#C21A1A' : '#111';
      g.font = '700 15px Tahoma, sans-serif';
      g.fillText(RANKS[card.rank - 1], x + 5, y + 17);
      g.font = '26px Tahoma, sans-serif';
      g.fillText(GLYPHS[card.suit], x + CARD_W - 31, y + CARD_H - 8);
    };

    const step = () => {
      if (!current) {
        const next = queue.shift();
        if (!next) { stopCascade(); return; }
        const from = origins[next.pile] || { x: 0, y: 0 };
        current = { ...next, x: from.x, y: from.y, vx: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3), vy: -Math.random() * 4 };
      }
      current.vy += 0.4;
      current.x += current.vx;
      current.y += current.vy;
      if (current.y + CARD_H > canvas.height) { current.y = canvas.height - CARD_H; current.vy = -current.vy * 0.85; }
      drawCard(current, current.x, current.y);
      if (current.x < -CARD_W || current.x > canvas.width) current = null;
      cascade.frame = requestAnimationFrame(step);
    };

    cascade = { frame: 0 };
    cascade.frame = requestAnimationFrame(step);
  }
  canvas.addEventListener('pointerdown', stopCascade);      // click to dismiss the cascade

  // ---------- Dialogs (Help Topics, About) ----------

  function closeDialog() {
    dialogWrap.hidden = true;
    dialogWrap.replaceChildren();
  }

  function openDialog(titleKey, bodyKey) {
    dialogWrap.innerHTML = `
      <div class="sol-dialog" role="dialog" aria-modal="true" aria-labelledby="sol-dlg-title">
        <h3 id="sol-dlg-title">${t(titleKey)}</h3>
        <div class="sol-dlg-body">${dict()[bodyKey]}</div>
        <button type="button" class="btn-xp" data-dlg="ok">${t('sol-ok')}</button>
      </div>`;
    dialogWrap.hidden = false;
    $('[data-dlg="ok"]', dialogWrap).addEventListener('click', closeDialog);
    $('[data-dlg="ok"]', dialogWrap).focus();
  }

  // ---------- Menu bar ----------

  const menuButtons = $$('.sol-mbtn', root);
  const dropdown = (button) => $('.sol-dd', button.parentElement);

  function closeMenus() {
    menuButtons.forEach((button) => {
      button.setAttribute('aria-expanded', 'false');
      dropdown(button).hidden = true;
    });
  }

  function openMenu(button, { focusFirst = false } = {}) {
    closeMenus();
    button.setAttribute('aria-expanded', 'true');
    const list = dropdown(button);
    list.hidden = false;
    if (focusFirst) $('.sol-item:not(:disabled)', list)?.focus();
  }

  const menuIsOpen = () => menuButtons.some((button) => button.getAttribute('aria-expanded') === 'true');

  menuButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-expanded') === 'true') closeMenus(); else openMenu(button);
    });
    button.addEventListener('mouseenter', () => { if (menuIsOpen()) openMenu(button); });   // sweeping across an open menu bar switches menus
    button.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openMenu(button, { focusFirst: true }); }
    });
  });

  $$('.sol-dd', root).forEach((list) => {
    list.addEventListener('keydown', (e) => {
      const items = $$('.sol-item:not(:disabled)', list);
      const at = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(at - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const owner = $('.sol-mbtn', list.parentElement);
        const next = menuButtons[(menuButtons.indexOf(owner) + (e.key === 'ArrowRight' ? 1 : -1) + menuButtons.length) % menuButtons.length];
        openMenu(next, { focusFirst: true });
      }
    });
  });

  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.sol-menubar')) closeMenus(); });
  bus.on('window:focused', ({ id }) => { if (id !== 'solitaire') closeMenus(); });

  // ---------- Actions ----------

  function setDraw(count) {
    if (drawCount === count) return;
    drawCount = count;
    storage.set(DRAW_KEY, String(count));
    newGame();                                  // like XP, a new draw rule starts a new deal
  }

  const actions = {
    deal: () => { newGame(); play('menu'); },
    undo,
    draw1: () => setDraw(1),
    draw3: () => setDraw(3),
    exit: () => windows.close('solitaire'),
    help: () => openDialog('sol-help-title', 'sol-help-text'),
    about: () => openDialog('sol-about', 'sol-about-text'),
  };

  $$('.sol-item', root).forEach((item) => {
    item.addEventListener('click', () => {
      const keepFocus = menuButtons.find((button) => dropdown(button).contains(item));
      closeMenus();
      if (keepFocus) keepFocus.focus();
      actions[item.dataset.act]();
    });
  });

  // F2 deals, Ctrl+Z undoes, Esc closes a menu or dialog (keyboard.js leaves Esc to us while they are open).
  win.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!dialogWrap.hidden) { e.preventDefault(); closeDialog(); }
      else if (menuIsOpen()) { e.preventDefault(); const open = menuButtons.find((b) => b.getAttribute('aria-expanded') === 'true'); closeMenus(); open.focus(); }
      return;
    }
    if (e.key === 'F2') { e.preventDefault(); actions.deal(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });

  // ---------- Input ----------

  const spotOf = (el) => ({ zone: el.dataset.zone, index: el.dataset.index === undefined ? undefined : Number(el.dataset.index) });

  /** The run a click on a tableau card would pick up, or null if it isn't a legal run. */
  function runFrom(index, position) {
    const pile = state.tableau[index];
    const count = pile.length - position;
    const cards = pile.slice(position);
    const ok = cards.every((c, i) => c.up && (i === 0 || (engine.isRed(c) !== engine.isRed(cards[i - 1]) && c.rank === cards[i - 1].rank - 1)));
    return ok ? { zone: 'tableau', index, count } : null;
  }

  function onClick(e) {
    const el = e.target.closest('.sol-card, .sol-slot');
    if (!el || won || !el.dataset.zone) return;
    const spot = spotOf(el);
    const isCard = el.classList.contains('sol-card');

    if (spot.zone === 'stock') {
      if (attempt(() => engine.drawFromStock(state))) play('menu');
      selected = null;
      render();
      return;
    }

    if (selected) {
      if ((spot.zone === 'tableau' || spot.zone === 'foundation') && attempt(() => engine.move(state, selected, spot))) { play('restore'); afterMove(); return; }
      const onPicked = isCard && sameSpot(spot, selected) && (spot.zone !== 'tableau' || Number(el.dataset.pick) >= state.tableau[spot.index].length - selected.count);
      if (onPicked) { selected = null; render(); return; }          // clicking the picked card puts it down
      if (!isCard) { play('error'); return; }                       // an illegal drop on an empty slot
    }
    if (!isCard) return;

    const next = spot.zone === 'tableau' ? runFrom(spot.index, Number(el.dataset.pick)) : spot;
    if (!next) { play('error'); return; }
    selected = next;
    render();
    const again = $('.sol-card.picked', table);
    if (again) again.focus();
  }

  function onDoubleClick(e) {
    const el = e.target.closest('.sol-card');
    if (!el || won || !el.dataset.zone || el.dataset.zone === 'foundation') return;
    const spot = spotOf(el);
    const from = spot.zone === 'tableau' ? { zone: 'tableau', index: spot.index, count: 1 } : spot;
    if (spot.zone === 'tableau' && Number(el.dataset.pick) !== state.tableau[spot.index].length - 1) return;   // top card only
    if (attempt(() => engine.autoToFoundation(state, from))) { play('restore'); afterMove(); }
  }

  table.addEventListener('click', onClick);
  table.addEventListener('dblclick', onDoubleClick);
  bus.on('lang:changed', () => { translate(root); render(); if (won) message('sol-won'); });
  bus.on('window:closed', ({ id }) => { if (id === 'solitaire') { stopCascade(); closeMenus(); closeDialog(); } });
  bus.on('power:down', () => { stopCascade(); stopClock(); });
  render();
}
