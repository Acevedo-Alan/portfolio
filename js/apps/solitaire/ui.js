/*
 * apps/solitaire/ui.js — Spider Solitaire in a window, laid out like the Windows XP one: a Game / Help
 * menu bar, ten columns on the felt, the finished runs bottom-left, the score box bottom-centre and
 * the five stock deals bottom-right. Rules and scoring live in engine.js.
 *
 *   Game  New game (F2) · Undo (Ctrl+Z) · Show a possible move (M) · Beginner / Intermediate / Advanced · Exit
 *   Help  Help Topics · About
 *
 * Move cards by dragging them, or by clicking a card (it is picked up with everything on it) and then
 * the column it should go to. Click the stock to deal a row. Every face-up card is a real <button> with a
 * spoken name ("King of spades"). Winning plays the bouncing-cards cascade (skipped when effects are off).
 */

import { $, $$ } from '../../core/dom.js';
import * as bus from '../../core/bus.js';
import * as storage from '../../core/storage.js';
import { t, dict, translate } from '../../i18n/i18n.js';
import { play } from '../../audio/sounds.js';
import * as windows from '../../shell/windowManager.js';
import * as motion from '../../shell/motion.js';
import * as engine from './engine.js';
import * as cardSound from '../../audio/cards.js';
import * as mascot from '../../shell/mascot.js';

const GLYPHS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_W = 60;
const CARD_H = 82;
const DOWN_STEP = 8;       // px between face-down cards in a column
const UP_STEP = 22;        // px between face-up cards
const MIN_DOWN = 4;        // columns squeeze down to these when they get long
const MIN_UP = 14;
const BOTTOM_H = CARD_H + 24;      // room kept under the columns for the stock, score and finished runs
const TOP_PAD = 12;
const DRAG_THRESHOLD = 5;
const LEVEL_KEY = 'portfolio-spider-suits';       // '1' | '2' | '4'
const MAX_UNDO = 500;
const STOCK_STEP = 10;      // px each remaining stock deal sticks out to the left of the next
const STATS_KEY = 'portfolio-spider-stats';
const WIN_DIALOG_DELAY_MS = 4200;     // the fireworks get a few seconds before the summary appears
const EASTER_EGG_SECONDS = 600;       // Patito comments if the win took ten minutes or more

// The menu bar, as data. `act` names an entry of `actions` below.
const MENUS = [
  { key: 'sol-menu-game', items: [
    { key: 'sol-deal', act: 'deal', hint: 'F2' },
    { key: 'sol-undo', act: 'undo', hint: 'Ctrl+Z' },
    { key: 'sol-hint', act: 'hint', hint: 'M' },
    { key: 'sol-stats', act: 'stats' },
    { sep: true },
    { key: 'sol-lvl1', act: 'level1', radio: true },
    { key: 'sol-lvl2', act: 'level2', radio: true },
    { key: 'sol-lvl4', act: 'level4', radio: true },
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
  let suits = [1, 2, 4].includes(Number(storage.get(LEVEL_KEY))) ? Number(storage.get(LEVEL_KEY)) : 1;
  let state = engine.deal(Math.random, suits);
  let selected = null;     // { col, position }: a picked-up run
  let won = false;
  let history = [];        // snapshots for Undo
  let seconds = 0;
  let clock = null;
  let cascade = null;      // the running win animation, if any
  let hintIndex = 0;
  let hintTimer = null;
  let messageTimer = null;
  let suppressClick = false;
  let started = false;     // the current game has had its first move (counts as played)
  let stats = storage.getJSON(STATS_KEY, {}) || {};

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
      <div class="sol-ghost" hidden></div>
      <div class="sol-fly" aria-hidden="true"></div>
      <canvas class="sol-cascade" hidden aria-hidden="true"></canvas>
      <p class="sol-msg" id="sol-msg" role="status" hidden></p>
      <div class="sol-dialog-wrap" hidden></div>
    </div>
    `;
  translate(root);

  const table = $('#sol-table', root);
  const stage = $('.sol-stage', root);
  const ghost = $('.sol-ghost', root);
  const canvas = $('.sol-cascade', root);
  const dialogWrap = $('.sol-dialog-wrap', root);

  const cardName = (card) => t('sol-card')
    .replace('%r', dict()['sol-ranks'][card.rank - 1])
    .replace('%s', dict()['sol-suits'][engine.SUITS.indexOf(card.suit)]);

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

  const formatTime = (total) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

  // ---------- Rendering ----------

  // Like XP: the rank in the top-left corner, the suit in the top-right one.
  const faceHTML = (card) => `<span class="cn tl"><b>${RANKS[card.rank - 1]}</b></span><span class="cn tr" aria-hidden="true"><i>${GLYPHS[card.suit]}</i></span><span class="big" aria-hidden="true">${GLYPHS[card.suit]}</span>`;

  function cardEl(card, col, position, top, picked) {
    const el = document.createElement(card.up ? 'button' : 'div');
    el.className = `sol-card ${card.up ? `up ${engine.isRed(card) ? 'red' : 'black'}` : 'back'}${picked ? ' picked' : ''}`;
    el.style.top = top + 'px';
    el.dataset.col = col;
    el.dataset.pos = position;
    if (!card.up) { el.setAttribute('aria-hidden', 'true'); return el; }
    el.type = 'button';
    el.setAttribute('aria-label', cardName(card));
    el.setAttribute('aria-pressed', String(picked));
    el.innerHTML = faceHTML(card);
    return el;
  }

  /** Vertical gaps for a column: the standard steps, squeezed when the pile would run past the table. */
  function stepsFor(pile, avail) {
    const previous = pile.slice(0, -1);
    const downs = previous.filter((c) => !c.up).length;
    const ups = previous.length - downs;
    const need = downs * DOWN_STEP + ups * UP_STEP;
    if (need + CARD_H <= avail) return { down: DOWN_STEP, up: UP_STEP };
    const f = Math.max(0, avail - CARD_H) / need;
    return { down: Math.max(MIN_DOWN, DOWN_STEP * f), up: Math.max(MIN_UP, UP_STEP * f) };
  }

  function paintStatus() {
    const box = $('.sol-scorebox', table);
    if (!box) return;
    const clock = formatTime(seconds);
    box.replaceChildren(...[t('sol-score').replace('%n', state.score), t('sol-moves').replace('%n', state.moves), t('sol-time').replace('%n', clock)].map((line) => {
      const row = document.createElement('div');
      row.textContent = line;
      return row;
    }));
  }

  function paintMenus() {
    $('[data-act="undo"]', root).disabled = history.length === 0 || won;
    $$('.sol-item[role="menuitemradio"]', root).forEach((item) => {
      const on = item.dataset.act === `level${suits}`;
      item.setAttribute('aria-checked', String(on));
      $('.sol-check', item).textContent = on ? '●' : '';
    });
  }

  function render() {
    clearHint();
    table.replaceChildren();
    const avail = (stage.clientHeight || 500) - TOP_PAD - BOTTOM_H;

    const tableau = document.createElement('div');
    tableau.className = 'sol-tableau';
    state.tableau.forEach((pile, col) => {
      const el = document.createElement('div');
      el.className = 'sol-col';
      el.dataset.col = col;
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'sol-slot';
      slot.dataset.col = col;
      slot.setAttribute('aria-label', t('sol-column'));
      el.appendChild(slot);
      const { down, up } = stepsFor(pile, avail);
      let y = 0;
      pile.forEach((card, i) => {
        const picked = !!selected && selected.col === col && i >= selected.position;
        el.appendChild(cardEl(card, col, i, y, picked));
        y += card.up ? up : down;
      });
      el.style.height = (Math.max(y - (pile.length && pile[pile.length - 1].up ? up : down), 0) + CARD_H) + 'px';
      tableau.appendChild(el);
    });

    const bottom = document.createElement('div');
    bottom.className = 'sol-bottom';

    const done = document.createElement('div');
    done.className = 'sol-done';
    done.style.width = (CARD_W + Math.max(state.completed.length - 1, 0) * 12) + 'px';
    done.setAttribute('aria-label', t('sol-done').replace('%n', state.completed.length));
    state.completed.forEach((suit, i) => {
      const k = document.createElement('div');
      k.className = `sol-card up ${suit === 'H' || suit === 'D' ? 'red' : 'black'}`;
      k.style.left = i * 12 + 'px';
      k.setAttribute('aria-hidden', 'true');
      k.innerHTML = faceHTML({ suit, rank: 13 });
      done.appendChild(k);
    });

    const box = document.createElement('div');
    box.className = 'sol-scorebox';
    box.addEventListener('click', showHint);
    box.title = t('sol-hint');

    const stock = document.createElement('button');
    stock.type = 'button';
    stock.className = 'sol-stock' + (state.stock.length ? '' : ' empty');
    stock.style.width = (CARD_W + Math.max(state.stock.length - 1, 0) * STOCK_STEP) + 'px';
    stock.setAttribute('aria-label', t(state.stock.length ? 'sol-stock' : 'sol-stock-empty'));
    state.stock.forEach((_, i) => {
      const back = document.createElement('div');
      back.className = 'sol-card back';
      back.style.left = i * STOCK_STEP + 'px';
      stock.appendChild(back);
    });

    bottom.append(done, box, stock);
    table.append(tableau, bottom);
    paintStatus();
    paintMenus();
  }

  /** A short line over the felt (hints, refusals); `ms` 0 keeps it until cleared. */
  function message(key, ms = 0) {
    clearTimeout(messageTimer);
    const el = $('#sol-msg', root);
    el.hidden = !key;
    el.textContent = key ? t(key) : '';
    if (key && ms) messageTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  // ---------- Statistics (per difficulty, kept in localStorage) ----------

  const statsFor = (n) => (stats[n] ||= { played: 0, won: 0, streak: 0, best: 0 });
  const saveStats = () => storage.setJSON(STATS_KEY, stats);

  /** Called when the current game ends without a win (a new deal, or a new difficulty): the streak is gone. */
  function abandonGame() {
    if (!started || won) return;
    statsFor(state.suits).streak = 0;
    saveStats();
  }

  function recordWin() {
    const s = statsFor(state.suits);
    s.won++;
    s.streak++;
    s.best = Math.max(s.best, state.score);
    saveStats();
  }

  function openStats() {
    const rows = [1, 2, 4].map((n) => {
      const s = statsFor(n);
      return `<tr><th scope="row">${t(`sol-lvl${n}`)}</th><td>${s.played}</td><td>${s.won}</td><td>${s.streak}</td><td>${s.best || '—'}</td></tr>`;
    }).join('');
    openDialog('sol-stats-title', `<table class="sol-stats"><thead><tr><th></th><th>${t('sol-st-played')}</th><th>${t('sol-st-won')}</th><th>${t('sol-st-streak')}</th><th>${t('sol-st-best')}</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  // ---------- Game flow ----------

  /** Runs `change` on the state; keeps an undo snapshot (for Undo) only if it succeeded. */
  function attempt(change) {
    const before = structuredClone(state);
    const result = change();
    if (!result.ok) return result;
    history.push(before);
    if (history.length > MAX_UNDO) history.shift();
    if (!started) { started = true; statsFor(state.suits).played++; saveStats(); }
    startClock();
    hintIndex = 0;
    return result;
  }

  function afterMove(result, { dealt = false } = {}) {
    selected = null;
    won = engine.isWon(state);
    render();
    if (dealt) animateDeal();
    if (result?.completed) {
      if (!won) cardSound.arpeggio();                  // a win has its own fanfare
      animateRuns(result.runs);
    }
    if (won) {
      const record = state.score > statsFor(state.suits).best;
      recordWin();
      celebrate(record);
    }
  }

  // ---------- Card animations (skipped when visual effects are off) ----------

  const stageRect = () => stage.getBoundingClientRect();

  /** The ten cards of a deal fly from the stock to their columns, one after another. */
  function animateDeal() {
    if (!motion.isOn()) return;
    const from = $('.sol-stock', table).getBoundingClientRect();
    const originX = from.right - CARD_W;
    $$('.sol-col', table).forEach((col, i) => {
      const card = $$('.sol-card', col).pop();
      if (!card) return;
      const to = card.getBoundingClientRect();
      card.style.zIndex = 10;
      const flight = card.animate(
        [{ transform: `translate(${originX - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }],
        { duration: 260, delay: i * 30, easing: 'ease-out', fill: 'backwards' },
      );
      flight.finished.then(() => { card.style.zIndex = ''; }).catch(() => {});
      setTimeout(cardSound.slide, i * 30);
    });
  }

  /** A finished run (K to A) hops card by card from its column to the finished-runs corner. */
  function animateRuns(runs) {
    if (!motion.isOn() || !runs?.length) return;
    const fly = $('.sol-fly', root);
    const base = stageRect();
    const done = $$('.sol-done .sol-card', table);
    runs.forEach((run, r) => {
      const target = done[state.completed.length - runs.length + r];
      if (!target) return;
      const column = $(`.sol-col[data-col="${run.col}"]`, table).getBoundingClientRect();
      const end = target.getBoundingClientRect();
      const startX = column.left - base.left;
      const startY = Math.max(column.bottom - base.top - CARD_H, 0);
      const dx = end.left - column.left;
      const dy = end.top - (base.top + startY);
      target.style.visibility = 'hidden';
      const total = 13 * 45 + 480;
      setTimeout(() => { target.style.visibility = ''; }, total);
      for (let i = 0; i < 13; i++) {
        const card = { suit: run.suit, rank: 13 - i, up: true };
        const el = document.createElement('div');
        el.className = `sol-card up ${engine.isRed(card) ? 'red' : 'black'}`;
        el.style.cssText = `left:${startX}px;top:${startY}px;z-index:${20 + i}`;
        el.innerHTML = faceHTML(card);
        fly.appendChild(el);
        el.animate(
          [{ transform: 'none' }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 70}px)`, offset: 0.5 }, { transform: `translate(${dx}px, ${dy}px)` }],
          { duration: 480, delay: i * 45, easing: 'ease-in-out', fill: 'both' },
        ).finished.then(() => el.remove()).catch(() => el.remove());
      }
    });
  }

  function newGame() {
    abandonGame();
    stopCascade();
    stopClock();
    started = false;
    $('.sol-fly', root).replaceChildren();
    state = engine.deal(Math.random, suits);
    history = [];
    seconds = 0;
    won = false;
    selected = null;
    hintIndex = 0;
    message('');
    render();
  }

  function undo() {
    if (!history.length || won) { cardSound.thud(); return; }
    state = history.pop();
    engine.chargeUndo(state);
    selected = null;
    hintIndex = 0;
    render();
    play('menu');
  }

  function dealRow() {
    if (won) return;
    if (!state.stock.length) { cardSound.thud(); return; }
    if (!engine.canDeal(state)) {
      play('exclamation');
      blinkEmptyColumns();
      openDialog('sol-empty-title', dict()['sol-empty-text']);
      return;
    }
    const result = attempt(() => engine.deal10(state));
    if (result.ok) afterMove(result, { dealt: true });
  }

  /** Why dealing was refused: the empty columns flash for a moment. */
  function blinkEmptyColumns() {
    const slots = $$('.sol-col', table).filter((c) => !$('.sol-card', c)).map((c) => $('.sol-slot', c));
    slots.forEach((slot) => slot.classList.add('blink'));
    setTimeout(() => slots.forEach((slot) => slot.classList.remove('blink')), 1100);
  }

  function setLevel(count) {
    suits = count;
    storage.set(LEVEL_KEY, String(count));
    newGame();                                   // a new difficulty starts a new deal
  }

  /** The win: fanfare and fireworks, then the classic Win32 summary dialog ("Play another game?"). */
  function celebrate(record) {
    stopClock();
    const fireworks = motion.isOn();
    setTimeout(cardSound.fanfare, fireworks ? 650 : 0);        // with the first burst
    startCascade();
    setTimeout(() => { if (won) openWinDialog(record); }, fireworks ? WIN_DIALOG_DELAY_MS : 600);
  }

  function openWinDialog(record) {
    const lines = [t('sol-score').replace('%n', state.score), t('sol-moves').replace('%n', state.moves), t('sol-time').replace('%n', formatTime(seconds))];
    openDialog('sol-win-title', `<p>${t('sol-won')}</p><p class="sol-win-stats">${lines.join('<br>')}</p>${record ? `<p class="sol-record">${t('sol-record')}</p>` : ''}<p>${t('sol-again')}</p>`, {
      buttons: [{ label: t('sol-yes'), run: newGame }, { label: t('sol-no') }],
    });
    if (seconds >= EASTER_EGG_SECONDS) {
      mascot.offer(t('sol-patito').replace('%n', Math.floor(seconds / 60)), { label: t('sol-patito-btn'), run: () => { closeDialog(); windows.open('proyectos'); } });
    }
  }

  // ---------- Hints ----------

  function clearHint() {
    clearTimeout(hintTimer);
    $$('.hint', root).forEach((el) => el.classList.remove('hint'));
  }

  /** Flashes the run to move (inverted colours), then the column it can go to. */
  function showHint() {
    if (won) return;
    clearHint();
    message('');
    const list = engine.hints(state);
    if (!list.length) { message(engine.canDeal(state) ? 'sol-hint-deal' : 'sol-hint-none', 2600); cardSound.thud(); return; }
    const pick = list[hintIndex % list.length];
    hintIndex++;
    $$(`.sol-card[data-col="${pick.from.col}"]`, table)
      .filter((el) => Number(el.dataset.pos) >= pick.from.position)
      .forEach((el) => el.classList.add('hint'));
    hintTimer = setTimeout(() => {
      clearHint();
      const column = $(`.sol-col[data-col="${pick.to}"]`, table);
      const target = $$('.sol-card', column).pop() || $('.sol-slot', column);
      target.classList.add('hint');
      hintTimer = setTimeout(clearHint, 700);
    }, 300);
  }

  // ---------- Win animation (pixel fireworks over the felt) ----------

  function stopCascade() {
    if (!cascade) return;
    cancelAnimationFrame(cascade.frame);
    cascade = null;
    canvas.hidden = true;
  }

  const COLORS = ['#FFD84A', '#FF5A4A', '#6CE06C', '#5AB4FF', '#FF8FE8', '#FFFFFF'];

  function startCascade() {
    if (!motion.isOn()) return;
    const rect = stage.getBoundingClientRect();
    canvas.width = Math.round(rect.width);
    canvas.height = Math.round(rect.height);
    canvas.hidden = false;
    const g = canvas.getContext('2d');
    const sparks = [];
    let frames = 0;
    const LAST_BURST = 60 * 9;

    const burst = () => {
      const x = canvas.width * (0.15 + Math.random() * 0.7);
      const y = canvas.height * (0.12 + Math.random() * 0.45);
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      for (let i = 0; i < 46; i++) {
        const angle = (Math.PI * 2 * i) / 46;
        const speed = 1.2 + Math.random() * 2.4;
        sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 55 + Math.random() * 35, age: 0, color });
      }
      cardSound.pop();
    };

    const step = () => {
      if (frames < LAST_BURST && frames % 26 === 0) burst();
      frames++;
      g.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.vy += 0.045;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.age++;
        if (p.age > p.life) { sparks.splice(i, 1); continue; }
        g.globalAlpha = 1 - p.age / p.life;
        g.fillStyle = p.color;
        g.fillRect(Math.round(p.x / 3) * 3, Math.round(p.y / 3) * 3, 3, 3);      // chunky "pixel" sparks
      }
      g.globalAlpha = 1;
      if (frames >= LAST_BURST && !sparks.length) { stopCascade(); return; }
      cascade.frame = requestAnimationFrame(step);
    };

    cascade = { frame: 0 };
    // let the last run land in its corner before the show starts
    cascade.frame = requestAnimationFrame(function wait() {
      if (frames++ < 40) { cascade.frame = requestAnimationFrame(wait); return; }
      frames = 0;
      step();
    });
  }
  canvas.addEventListener('pointerdown', stopCascade);      // click to dismiss the fireworks

  // ---------- Dialogs (difficulty, Help Topics, About, "can't deal") ----------

  function closeDialog() {
    dialogWrap.hidden = true;
    dialogWrap.replaceChildren();
  }

  function openDialog(titleKey, bodyHTML, { cancel = false, buttons = null } = {}) {
    closeMenus();
    dialogWrap.innerHTML = `
      <div class="sol-dialog" role="dialog" aria-modal="true" aria-labelledby="sol-dlg-title">
        <div class="sol-dlg-title"><strong id="sol-dlg-title">${t(titleKey)}</strong><button type="button" class="sol-dlg-x" data-dlg="cancel" aria-label="${t('win-close')}">×</button></div>
        <div class="sol-dlg-main">
          <div class="sol-dlg-body">${bodyHTML}</div>
          <div class="sol-dlg-btns">
            ${buttons
    ? buttons.map((b, i) => `<button type="button" class="btn-xp" data-dlg="custom" data-i="${i}">${b.label}</button>`).join('')
    : `<button type="button" class="btn-xp" data-dlg="ok">${t('sol-ok')}</button>${cancel ? `<button type="button" class="btn-xp" data-dlg="cancel">${t('btn-cancel')}</button>` : ''}`}
          </div>
        </div>
      </div>`;
    dialogWrap.hidden = false;
    $$('[data-dlg="cancel"]', dialogWrap).forEach((b) => b.addEventListener('click', closeDialog));
    $$('[data-dlg="custom"]', dialogWrap).forEach((b) => b.addEventListener('click', () => {
      closeDialog();
      buttons[Number(b.dataset.i)].run?.();
    }));
    const ok = $('[data-dlg="ok"]', dialogWrap) || $('[data-dlg="custom"]', dialogWrap);
    if (ok.dataset.dlg === 'ok') ok.addEventListener('click', closeDialog);
    ok.focus();
    return ok;
  }

  /** The difficulty chooser shown when the game opens (and from New game). */
  function openLevelDialog() {
    const radios = [1, 2, 4].map((n) => `<label class="sol-radio"><input type="radio" name="sol-level" value="${n}"${n === suits ? ' checked' : ''}> <span>${t(`sol-lvl${n}`)}</span></label>`).join('');
    const ok = openDialog('sol-level-title', `<p>${t('sol-level-text')}</p>${radios}`, { cancel: true });
    ok.addEventListener('click', () => {
      const chosen = Number($('input[name="sol-level"]:checked', dialogWrap)?.value || suits);
      setLevel(chosen);
    }, { once: true });
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

  const actions = {
    deal: () => { openLevelDialog(); play('menu'); },
    undo,
    hint: showHint,
    stats: openStats,
    level1: () => setLevel(1),
    level2: () => setLevel(2),
    level4: () => setLevel(4),
    exit: () => windows.close('solitaire'),
    help: () => openDialog('sol-help-title', dict()['sol-help-text']),
    about: () => openDialog('sol-about', dict()['sol-about-text']),
  };

  $$('.sol-item', root).forEach((item) => {
    item.addEventListener('click', () => {
      const keepFocus = menuButtons.find((button) => dropdown(button).contains(item));
      closeMenus();
      if (keepFocus) keepFocus.focus();
      actions[item.dataset.act]();
    });
  });

  // F2 starts a new game, Ctrl+Z undoes, M shows a hint, Esc closes a menu or dialog (keyboard.js leaves Esc to us while they are open).
  win.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!dialogWrap.hidden) { e.preventDefault(); closeDialog(); }
      else if (menuIsOpen()) { e.preventDefault(); const open = menuButtons.find((b) => b.getAttribute('aria-expanded') === 'true'); closeMenus(); open.focus(); }
      return;
    }
    if (!dialogWrap.hidden) return;
    if (e.key === 'F2') { e.preventDefault(); actions.deal(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'm') { e.preventDefault(); showHint(); }
  });

  // ---------- Input: click to pick up and drop, or drag ----------

  const colOf = (el) => Number(el.dataset.col);

  /** Moves the selected run (or a dragged one) onto column `to`; returns true on success. */
  function drop(from, to) {
    const result = attempt(() => engine.move(state, from, to));
    if (!result.ok) { cardSound.thud(); return false; }
    cardSound.slide();
    afterMove(result);
    return true;
  }

  function onClick(e) {
    if (suppressClick || won) return;
    if (e.target.closest('.sol-stock')) { selected = null; dealRow(); return; }
    const el = e.target.closest('[data-col]');
    if (!el) return;
    const col = colOf(el);
    const isFaceUp = el.classList.contains('up');
    const position = Number(el.dataset.pos);

    if (selected) {
      const onPicked = selected.col === col && isFaceUp && position >= selected.position;
      if (onPicked) { selected = null; render(); return; }                       // clicking the picked card puts it down
      if (drop(selected, col)) return;
      if (!(isFaceUp && engine.isRun(state.tableau[col], position))) return;     // illegal drop: keep the pick
    }
    if (!isFaceUp) return;
    if (!engine.isRun(state.tableau[col], position)) { cardSound.thud(); return; }
    selected = { col, position };
    render();
    $('.sol-card.picked', table)?.focus();
  }

  /** Pressing on a legal run starts a drag once the pointer has moved a few pixels. */
  function onPointerDown(e) {
    if (e.button !== 0 || won) return;
    const el = e.target.closest('.sol-card.up[data-col]');
    if (!el) return;
    const col = colOf(el);
    const position = Number(el.dataset.pos);
    if (!engine.isRun(state.tableau[col], position)) return;
    const stageRect = stage.getBoundingClientRect();
    const lifted = $$(`.sol-card[data-col="${col}"]`, table).filter((c) => Number(c.dataset.pos) >= position);
    const first = lifted[0].getBoundingClientRect();
    let dragging = false;

    const move = (ev) => {
      const dx = ev.clientX - e.clientX;
      const dy = ev.clientY - e.clientY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging = true;
        selected = null;
        ghost.replaceChildren(...lifted.map((c) => {
          const copy = c.cloneNode(true);
          copy.classList.remove('picked');
          copy.style.left = '0';
          copy.style.top = (c.getBoundingClientRect().top - first.top) + 'px';
          return copy;
        }));
        ghost.style.left = (first.left - stageRect.left) + 'px';
        ghost.style.top = (first.top - stageRect.top) + 'px';
        ghost.hidden = false;
        lifted.forEach((c) => c.classList.add('lifted'));
      }
      ghost.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!dragging) return;                                    // a plain click: onClick takes it from here
      ghost.hidden = true;
      ghost.style.transform = '';
      ghost.replaceChildren();
      suppressClick = true;                                     // the click that follows a drop must not pick anything up
      setTimeout(() => { suppressClick = false; }, 0);
      const centre = first.left + CARD_W / 2 + (ev.clientX - e.clientX);
      const target = $$('.sol-col', table).find((c) => {
        const r = c.getBoundingClientRect();
        return centre >= r.left - 4 && centre <= r.right + 4;
      });
      if (ev.type === 'pointercancel' || !target || !drop({ col, position }, colOf(target))) {
        lifted.forEach((c) => c.classList.remove('lifted'));
        if (target && ev.type !== 'pointercancel') render();
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  table.addEventListener('click', onClick);
  table.addEventListener('pointerdown', onPointerDown);
  bus.on('lang:changed', () => { translate(root); render(); });
  bus.on('window:closed', ({ id }) => { if (id === 'solitaire') { stopCascade(); closeMenus(); closeDialog(); } });
  bus.on('power:down', () => { stopCascade(); stopClock(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (stage.clientHeight) render(); }).observe(stage);

  render();
  openLevelDialog();                                            // the initial difficulty modal
}
