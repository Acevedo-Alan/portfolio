/*
 * apps/chess/ui.js — Chess Titans-style 3D chess against Stockfish, in a window.
 *
 * Parts, kept apart: logic/ChessGame (rules, chess.js), logic/Engine (Stockfish in a Web Worker),
 * logic/judge (is a move a blunder?), sounds, and render/ChessRenderer (Three.js). This file only
 * connects them to the window: Game menu, board, promotion picker, move list and status.
 *
 * Everything is created when the window opens and released when it closes, Logs Off or the PC
 * turns off: the 3D scene is disposed, the engine's Worker is terminated, the audio context is
 * closed. Each opening uses a fresh <canvas>, because a canvas whose WebGL context was released
 * can't be reused. If the engine can't start (file://, blocked Worker), the game still works for
 * two players (without move feedback).
 *
 * The menu bar reuses the Solitaire menu styles (.sol-menubar, .sol-dd, .sol-item, ...).
 */

import { $, $$, icon } from '../../core/dom.js';
import * as bus from '../../core/bus.js';
import * as storage from '../../core/storage.js';
import * as windows from '../../shell/windowManager.js';
import { t, translate, getLang } from '../../i18n/i18n.js';
import { judge } from './logic/judge.js';
import { capturedBy, balance } from './logic/material.js';
import { play as playShell } from '../../audio/sounds.js';
import { ChessSounds } from './sounds.js';

const LEVELS = {
  easy: { skill: 3, movetime: 250 },
  medium: { skill: 10, movetime: 700 },
  hard: { skill: 20, movetime: 1500 },
};
const K_LEVEL = 'portfolio-chess-level';
const K_SIDE = 'portfolio-chess-side';

/** Marks written after a move in the move list, and which sound each verdict plays. */
const VERDICTS = {
  blunder: { mark: '??', sound: 'blunder' },
  missedMate: { mark: '??', sound: 'missed' },
  mistake: { mark: '?', sound: 'mistake' },
  inaccuracy: { mark: '?!', sound: null },
};

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];
const GLYPHS = { w: { p: '♙', q: '♕', r: '♖', b: '♗', n: '♘' }, b: { p: '♟', q: '♛', r: '♜', b: '♝', n: '♞' } };
/** The classic Windows warning sign: a yellow triangle with an exclamation mark. */
const WARNING_ICON = `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">
  <defs><linearGradient id="chess-warn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF58A"/><stop offset="1" stop-color="#F0B000"/></linearGradient></defs>
  <path d="M16 2.6 30 28.6H2z" fill="url(#chess-warn)" stroke="#3A2A00" stroke-width="1.6" stroke-linejoin="round"/>
  <rect x="14.5" y="11" width="3" height="9.5" rx="1.3" fill="#1A1A1A"/><circle cx="16" cy="24" r="1.8" fill="#1A1A1A"/>
</svg>`;
const SPANISH_LETTERS = { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' };

/** Standard notation, with the Spanish piece letters (R, D, T, A, C) when the page is in Spanish. */
function localSan(san) {
  if (getLang() !== 'es') return san;
  return san.replace(/^[KQRBN]/, (c) => SPANISH_LETTERS[c]).replace(/=([QRBN])/, (_, c) => `=${SPANISH_LETTERS[c]}`);
}

const MENU = [
  { key: 'chess-new', act: 'new', hint: 'F2' },
  { key: 'chess-undo', act: 'undo', hint: 'Ctrl+Z' },
  { key: 'chess-resign', act: 'resign' },
  { sep: true },
  { key: 'chess-level-easy', act: 'level:easy', radio: true },
  { key: 'chess-level-medium', act: 'level:medium', radio: true },
  { key: 'chess-level-hard', act: 'level:hard', radio: true },
  { sep: true },
  { key: 'chess-play-white', act: 'side:w', radio: true },
  { key: 'chess-play-black', act: 'side:b', radio: true },
  { sep: true },
  { key: 'chess-exit', act: 'exit' },
];

export function mount() {
  const root = $('#win-chess .chess-body');
  const win = $('#win-chess');
  root.innerHTML = `
    <div class="sol-menubar" role="menubar" data-i18n-label="chess-menubar">
      <div class="sol-menu">
        <button type="button" class="sol-mbtn" role="menuitem" aria-haspopup="menu" aria-expanded="false" data-i18n="chess-menu-game"></button>
        <ul class="sol-dd" role="menu" hidden>
          ${MENU.map((item) => (item.sep
    ? '<li class="sol-sep" role="separator"><hr></li>'
    : `<li role="none"><button type="button" class="sol-item" role="${item.radio ? 'menuitemradio' : 'menuitem'}" data-act="${item.act}"><span class="sol-check" aria-hidden="true"></span><span data-i18n="${item.key}"></span><kbd>${item.hint || ''}</kbd></button></li>`)).join('')}
        </ul>
      </div>
    </div>
    <div class="chess-main">
      <div class="chess-stage" id="chess-stage">
        <p class="chess-note" id="chess-note" role="status"></p>
        <div class="chess-tip" id="chess-tip" role="status" hidden></div>
        <div class="chess-promo" id="chess-promo" role="dialog" aria-modal="true" data-i18n-label="chess-promote" hidden>
          <div class="chess-promo-box">
            <p data-i18n="chess-promote"></p>
            <div class="chess-promo-row"></div>
          </div>
        </div>
        <div class="chess-over" id="chess-over" hidden>
          <div class="xpd" role="alertdialog" aria-modal="true" aria-labelledby="chess-over-title" aria-describedby="chess-over-text">
            <div class="titlebar xpd-bar">
              <span class="t-text" data-i18n="box-chess"></span>
              <button type="button" class="wb wb-close" id="chess-over-x" data-i18n-label="chess-close"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1 9 9M9 1 1 9" stroke="#fff" stroke-width="2" fill="none"/></svg></button>
            </div>
            <div class="xpd-body">
              <span class="xpd-icon" id="chess-over-icon" aria-hidden="true"></span>
              <div class="xpd-msg"><strong id="chess-over-title"></strong><span id="chess-over-text"></span></div>
            </div>
            <div class="xpd-buttons" id="chess-over-row"></div>
          </div>
        </div>
      </div>
      <aside class="chess-moves" aria-labelledby="chess-moves-title">
        <h3 id="chess-moves-title" data-i18n="chess-moves"></h3>
        <ol class="chess-list" id="chess-list"></ol>
        <div class="chess-tray" id="chess-tray">
          <div class="chess-cap" data-side="w"><span class="chess-cap-name" data-i18n="chess-tray-w"></span><span class="chess-cap-pieces"></span><span class="chess-cap-diff"></span></div>
          <div class="chess-cap" data-side="b"><span class="chess-cap-name" data-i18n="chess-tray-b"></span><span class="chess-cap-pieces"></span><span class="chess-cap-diff"></span></div>
        </div>
      </aside>
    </div>
    <div class="chess-status" id="chess-status" role="status" aria-live="polite"></div>`;
  translate(root);

  const stage = $('#chess-stage', root);
  const note = $('#chess-note', root);
  const tip = $('#chess-tip', root);
  const promoEl = $('#chess-promo', root);
  const promoRow = $('.chess-promo-row', root);
  const list = $('#chess-list', root);
  const overEl = $('#chess-over', root);
  const overTitle = $('#chess-over-title', root);
  const overText = $('#chess-over-text', root);
  const overRow = $('#chess-over-row', root);
  const overIcon = $('#chess-over-icon', root);
  const overClose = $('#chess-over-x', root);
  const caps = { w: $('.chess-cap[data-side="w"]', root), b: $('.chess-cap[data-side="b"]', root) };
  const statusEl = $('#chess-status', root);
  const menuButton = $('.sol-mbtn', root);
  const dropdown = $('.sol-dd', root);

  let level = storage.get(K_LEVEL, 'medium');
  if (!(level in LEVELS)) level = 'medium';
  let side = storage.get(K_SIDE, 'w') === 'b' ? 'b' : 'w';

  let renderer = null;
  let canvas = null;
  let game = null;           // ChessGame
  let engine = null;         // Engine, or null when it couldn't start (two-player fallback)
  let sounds = null;
  let human = 'w';
  let busy = false;          // an animation or the engine is working: clicks wait
  let selected = null;
  let promo = null;          // { from, to } while the promotion picker is open
  let resigned = null;       // the color that resigned, or null
  let bannerFor = null;      // what the result banner is showing: 'result', 'resign' (the confirmation) or null
  let last = [];             // [from, to] of the latest move, for the blue marks
  let verdicts = new Map();  // ply index -> { kind, best } for the player's judged moves
  let beforeJudge = null;    // promise: the engine's opinion of the position the player is about to move from
  let tipTimer = null;
  let session = 0;           // bumped on open/close/new game/undo so late answers are dropped

  const say = (key) => { note.textContent = key ? t(key) : ''; note.hidden = !key; };
  const versusEngine = () => engine !== null;

  // ---------- Painting ----------

  /** How the game ended, or null while it goes on. winner is 'w', 'b' or null for a draw. */
  function outcome() {
    if (!game) return null;
    if (resigned) return { winner: resigned === 'w' ? 'b' : 'w', reason: 'resign' };
    const result = game.result;
    if (result === 'checkmate') return { winner: game.turn === 'w' ? 'b' : 'w', reason: 'mate' };
    if (result === 'stalemate') return { winner: null, reason: 'stalemate' };
    if (result) return { winner: null, reason: game.drawReason || 'fifty' };
    return null;
  }

  const over = () => outcome() !== null;

  function titleKey(end) {
    if (!end.winner) return 'chess-t-draw';
    if (!versusEngine()) return end.winner === 'w' ? 'chess-t-white' : 'chess-t-black';
    return end.winner === human ? 'chess-t-win' : 'chess-t-lose';
  }

  function statusText() {
    if (!game) return '';
    const end = outcome();
    if (end) return `${t(titleKey(end))} · ${t(`chess-r-${end.reason}`)}`;
    let text;
    if (!versusEngine()) text = t(game.turn === 'w' ? 'chess-white-turn' : 'chess-black-turn');
    else text = busy && game.turn !== human ? t('chess-thinking') : t('chess-your-turn');
    return game.inCheck ? `${text} · ${t('chess-check')}` : text;
  }

  function paintMoves() {
    const moves = game ? game.history() : [];
    list.replaceChildren();
    for (let i = 0; i < moves.length; i += 2) {
      const row = document.createElement('li');
      const number = document.createElement('span');
      number.className = 'chess-n';
      number.textContent = `${i / 2 + 1}.`;
      row.appendChild(number);
      [i, i + 1].forEach((ply) => {
        const cell = document.createElement('span');
        cell.className = 'chess-m';
        if (moves[ply]) {
          const verdict = verdicts.get(ply);
          cell.textContent = localSan(moves[ply].san) + (verdict ? ` ${VERDICTS[verdict.kind].mark}` : '');
          if (verdict) {
            cell.classList.add(`v-${verdict.kind}`);
            cell.title = t(`chess-j-${verdict.kind}`) + (verdict.best ? ` · ${t('chess-best').replace('%m', localSan(verdict.best))}` : '');
          }
          if (ply === moves.length - 1) cell.classList.add('now');
        }
        row.appendChild(cell);
      });
      list.appendChild(row);
    }
    list.scrollTop = list.scrollHeight;
    paintTray(moves);
  }

  /** What each side has captured, with the material lead next to the side that is ahead. */
  function paintTray(moves) {
    const got = capturedBy(moves);
    const lead = balance(got);
    ['w', 'b'].forEach((color) => {
      const against = color === 'w' ? 'b' : 'w';                        // white captures black pieces
      $('.chess-cap-pieces', caps[color]).textContent = got[color].map((piece) => GLYPHS[against][piece]).join('');
      const ahead = color === 'w' ? lead : -lead;
      $('.chess-cap-diff', caps[color]).textContent = ahead > 0 ? `+${ahead}` : '';
    });
  }

  function paintMenu() {
    $$('.sol-item', root).forEach((item) => {
      const [kind, value] = item.dataset.act.split(':');
      if (item.dataset.act === 'undo') item.disabled = busy || !game || !game.canUndo;
      if (item.dataset.act === 'resign') item.disabled = busy || !game || over();
      if (kind === 'side') item.disabled = !versusEngine();
      if (item.getAttribute('role') === 'menuitemradio') {
        const on = kind === 'level' ? value === level : value === side;
        item.setAttribute('aria-checked', String(on));
        $('.sol-check', item).textContent = on ? '●' : '';
      }
    });
  }

  function refresh() {
    if (!renderer || !game) return;
    const targets = selected ? game.movesFrom(selected) : [];
    const end = outcome();
    const mate = end && end.reason === 'mate' ? game.checkedKing() : null;       // the king that was mated glows red
    renderer.highlights.set({ selected, targets, last, check: mate ? null : game.checkedKing(), mate });
    renderer.pieces.setLifted(selected);
    statusEl.textContent = statusText();
    paintMoves();
    paintMenu();
  }

  /** The balloon over the board: what the verdict was and what would have been better. */
  function showTip(kind, best) {
    clearTimeout(tipTimer);
    tip.className = `chess-tip v-${kind}`;
    tip.textContent = t(`chess-j-${kind}`) + (best ? ` ${t('chess-best').replace('%m', localSan(best))}` : '');
    tip.hidden = false;
    tipTimer = setTimeout(() => { tip.hidden = true; }, 5000);
  }

  function hideTip() { clearTimeout(tipTimer); tip.hidden = true; }

  // ---------- Result banner and resigning ----------

  function openBanner(kind, title, text, buttons, { warning = false, chime = null } = {}) {
    bannerFor = kind;
    overTitle.textContent = title;
    overText.textContent = text;
    overIcon.innerHTML = warning ? WARNING_ICON : icon('information');
    overRow.replaceChildren(...buttons.map(({ act, key, primary }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = primary ? 'btn-xp principal-d' : 'btn-xp';
      button.dataset.act = act;
      button.textContent = t(key);
      return button;
    }));
    overEl.hidden = false;
    overRow.firstChild.focus();
    if (chime) playShell(chime);
  }

  function closeBanner() {
    bannerFor = null;
    overEl.hidden = true;
  }

  /** Closes the dialog; after a finished game the camera then circles the final position. */
  function dismissBanner() {
    const finished = bannerFor === 'result';
    closeBanner();
    if (finished && renderer) {
      const end = outcome();
      renderer.orbitAround(end && end.reason === 'mate' ? game.checkedKing() : null);
    }
  }

  /** At the end of a game: who won and why, with the classic Windows sound for the news. */
  function maybeBanner() {
    const end = outcome();
    if (!end || bannerFor) return;
    const lost = end.winner !== null && (versusEngine() ? end.winner !== human : false);
    const chime = end.winner === null ? 'exclamation' : lost ? 'error' : 'ding';
    openBanner('result', t(titleKey(end)), t(`chess-r-${end.reason}`), [
      { act: 'new', key: 'chess-new', primary: true },
      { act: 'view', key: 'chess-view' },
    ], { warning: lost, chime });
  }

  function askResign() {
    if (busy || !game || over() || bannerFor) return;
    closeMenu();
    openBanner('resign', t('chess-resign-ask'), t('chess-resign-text'), [
      { act: 'resign', key: 'chess-resign' },
      { act: 'cancel', key: 'chess-cancel', primary: true },
    ], { warning: true, chime: 'exclamation' });
  }

  overRow.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    const act = button.dataset.act;
    if (act === 'view') { dismissBanner(); return; }
    closeBanner();
    if (act === 'new') { if (renderer) newGame(); }
    else if (act === 'resign') {
      resigned = versusEngine() ? human : game.turn;
      selected = null;
      refresh();
      maybeBanner();
    }
  });
  overClose.addEventListener('click', () => (bannerFor === 'result' ? dismissBanner() : closeBanner()));

  // ---------- Playing ----------

  /** Plays a game sound from the square where the piece landed, heard from where the camera is. */
  function soundFor(move) {
    sounds.setListener(renderer.listenerPose());
    const where = { piece: move.piece, at: renderer.squareWorld(move.to) };
    if (move.san.endsWith('+') || move.san.endsWith('#')) return sounds.play('check', where);
    if (move.promotion) return sounds.play('promotion', where);
    return sounds.play(move.captured || move.flags.includes('e') ? 'capture' : 'move', where);
  }

  /** The engine's opinion of the position the player is about to move from (see judge.js). */
  function prepareJudging() {
    beforeJudge = versusEngine() && game && !over() && game.turn === human ? engine.analyze(game.fen).catch(() => null) : null;
  }

  /** Plays a result of ChessGame.move() on screen; resolves true when it ended (false if the game was reset meanwhile). */
  async function show(played, mine) {
    busy = true;
    selected = null;
    refresh();
    await renderer.pieces.apply(played.ops);
    if (mine !== session) return false;
    soundFor(played.move);
    last = [played.move.from, played.move.to];
    busy = false;
    prepareJudging();
    refresh();
    maybeBanner();
    return true;
  }

  async function engineTurn() {
    if (!versusEngine() || over() || game.turn === human) return;
    const mine = session;
    busy = true;
    refresh();
    let uci;
    try {
      uci = await engine.bestMove(game.fen, LEVELS[level]);
    } catch (e) {
      console.error('Engine failed', e);
    }
    if (mine !== session) return;
    const played = uci && game.moveUci(uci);
    if (!played) { busy = false; refresh(); return; }
    await show(played, mine);
  }

  async function playHuman(from, to, promotion) {
    const mine = session;
    const fenBefore = game.fen;
    const before = beforeJudge;
    const played = game.move(from, to, promotion);
    if (!played) return;
    const ply = game.history().length - 1;
    const after = versusEngine() && !over() ? engine.analyze(game.fen).catch(() => null) : null;
    if (!(await show(played, mine))) return;
    if (after && before) {
      busy = true;                                          // the answer comes with the engine's own analysis, so wait for it
      refresh();
      const [was, now] = await Promise.all([before, after]);
      if (mine !== session) return;
      const kind = judge(was, now);
      if (kind) {
        const best = was && was.best && was.best !== played.move.from + played.move.to + (played.move.promotion || '') ? ChessGameClass.sanOf(fenBefore, was.best) : null;
        verdicts.set(ply, { kind, best });
        showTip(kind, best);
        if (VERDICTS[kind].sound) sounds.play(VERDICTS[kind].sound);
      }
      busy = false;
    }
    refresh();
    engineTurn();
  }

  // ---------- Promotion picker ----------

  function askPromotion(from, to) {
    promo = { from, to };
    promoRow.replaceChildren(...PROMOTION_PIECES.map((piece) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chess-promo-btn';
      button.dataset.piece = piece;
      button.innerHTML = `<span class="g" aria-hidden="true">${GLYPHS[game.turn][piece]}</span><span>${t(`chess-piece-${piece}`)}</span>`;
      return button;
    }));
    promoEl.hidden = false;
    promoRow.firstChild.focus();
  }

  function closePromotion() {
    promo = null;
    promoEl.hidden = true;
  }

  promoRow.addEventListener('click', (e) => {
    const button = e.target.closest('.chess-promo-btn');
    if (!button || !promo) return;
    const { from, to } = promo;
    closePromotion();
    playHuman(from, to, button.dataset.piece);
  });
  promoEl.addEventListener('pointerdown', (e) => { if (e.target === promoEl) { closePromotion(); } });

  // ---------- Input ----------

  function onSquare(square) {
    if (promo) { closePromotion(); return; }
    if (busy || !game || over()) return;
    if (versusEngine() && game.turn !== human) return;
    if (selected && game.movesFrom(selected).some((m) => m.square === square)) {
      if (game.isPromotion(selected, square)) askPromotion(selected, square);
      else playHuman(selected, square, 'q');
      return;
    }
    selected = game.colorAt(square) === game.turn && square !== selected ? square : null;
    refresh();
  }

  /** A hand cursor over what a click would do: one of your pieces, or a square the selected piece can go to. */
  function onHover(square) {
    if (!canvas) return;
    const mine = !busy && !promo && game && !over() && (!versusEngine() || game.turn === human);
    const clickable = mine && square && (game.colorAt(square) === game.turn || (selected && game.movesFrom(selected).some((m) => m.square === square)));
    canvas.style.cursor = clickable ? 'pointer' : '';
  }

  function newGame() {
    session++;
    busy = false;
    selected = null;
    last = [];
    verdicts = new Map();
    closePromotion();
    closeBanner();
    resigned = null;
    hideTip();
    human = versusEngine() ? side : 'w';
    game.reset();
    if (engine) engine.newGame();
    renderer.pieces.setPosition(game.position());
    renderer.rig.release();
    renderer.rig.turnTo(human === 'w');
    prepareJudging();
    refresh();
    engineTurn();
  }

  function undo() {
    if (busy || !game || !game.canUndo) return;
    session++;
    game.undo();
    if (versusEngine() && game.turn !== human && game.canUndo) game.undo();
    const kept = game.history().length;
    verdicts = new Map([...verdicts].filter(([ply]) => ply < kept));
    selected = null;
    last = [];
    closePromotion();
    closeBanner();
    resigned = null;
    hideTip();
    renderer.rig.release();
    renderer.pieces.setPosition(game.position());
    prepareJudging();
    refresh();
    engineTurn();
  }

  // ---------- Window lifecycle ----------

  let ChessGameClass = null;

  async function open() {
    if (renderer || canvas) return;
    const mine = ++session;
    say('chess-loading');
    try {
      const [{ ChessRenderer }, { ChessGame }] = await Promise.all([import('./render/ChessRenderer.js'), import('./logic/ChessGame.js')]);
      if (mine !== session) return;                         // closed while Three.js was downloading
      ChessGameClass = ChessGame;
      canvas = document.createElement('canvas');
      canvas.className = 'chess-canvas';
      canvas.setAttribute('aria-label', t('box-chess'));
      stage.prepend(canvas);
      renderer = new ChessRenderer(canvas);
      game = new ChessGame();
      renderer.onSquareClick = onSquare;
      renderer.onSquareHover = onHover;
      sounds = new ChessSounds();
      sounds.load();
    } catch (e) {
      console.error('Chess could not start', e);
      teardown();
      say(e instanceof TypeError ? 'chess-offline' : 'chess-nowebgl');
      return;
    }
    say('');
    // The engine starts after the board is already on screen; until it is ready the game waits.
    try {
      const { Engine } = await import('./logic/Engine.js');
      const candidate = new Engine();
      engine = candidate;
      await candidate.init();
    } catch (e) {
      console.warn('Stockfish could not start; two-player mode.', e);
      if (engine) engine.dispose();
      engine = null;
    }
    if (mine !== session || !renderer) { if (engine) { engine.dispose(); engine = null; } return; }
    newGame();
  }

  function teardown() {
    clearTimeout(tipTimer);
    if (engine) { engine.dispose(); engine = null; }
    if (sounds) { sounds.dispose(); sounds = null; }
    if (renderer) { renderer.dispose(); renderer = null; }
    if (canvas) { canvas.remove(); canvas = null; }
    game = null;
    busy = false;
    selected = null;
    last = [];
    verdicts = new Map();
    beforeJudge = null;
  }

  function close() {
    session++;
    teardown();
    closePromotion();
    closeBanner();
    resigned = null;
    hideTip();
    say('');
    statusEl.textContent = '';
    list.replaceChildren();
  }

  // ---------- Menu ----------

  const menuIsOpen = () => menuButton.getAttribute('aria-expanded') === 'true';
  function closeMenu() { menuButton.setAttribute('aria-expanded', 'false'); dropdown.hidden = true; }
  function openMenu(focusFirst = false) {
    paintMenu();
    menuButton.setAttribute('aria-expanded', 'true');
    dropdown.hidden = false;
    if (focusFirst) $('.sol-item:not(:disabled)', dropdown)?.focus();
  }

  menuButton.addEventListener('click', () => (menuIsOpen() ? closeMenu() : openMenu()));
  menuButton.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openMenu(true); }
  });
  dropdown.addEventListener('keydown', (e) => {
    const items = $$('.sol-item:not(:disabled)', dropdown);
    const at = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(at - 1 + items.length) % items.length].focus(); }
  });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#win-chess .sol-menubar')) closeMenu(); });
  bus.on('window:focused', ({ id }) => { if (id !== 'chess') closeMenu(); });

  const actions = {
    new: () => { if (renderer) newGame(); },
    undo,
    resign: askResign,
    exit: () => windows.close('chess'),
  };
  $$('.sol-item', root).forEach((item) => {
    item.addEventListener('click', () => {
      closeMenu();
      menuButton.focus();
      const [kind, value] = item.dataset.act.split(':');
      if (kind === 'level') { level = value; storage.set(K_LEVEL, level); paintMenu(); }
      else if (kind === 'side') { side = value; storage.set(K_SIDE, side); if (renderer) newGame(); else paintMenu(); }
      else actions[kind]();
    });
  });

  // F2 starts a new game, Ctrl+Z undoes, Esc closes the picker or the menu (keyboard.js leaves Esc to us while they are open).
  win.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!overEl.hidden) { e.preventDefault(); if (bannerFor === 'result') dismissBanner(); else closeBanner(); }
      else if (!promoEl.hidden) { e.preventDefault(); closePromotion(); }
      else if (menuIsOpen()) { e.preventDefault(); closeMenu(); menuButton.focus(); }
      return;
    }
    if (e.key === 'F2') { e.preventDefault(); actions.new(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });

  bus.on('window:opened', ({ id }) => { if (id === 'chess') open(); });
  bus.on('window:closed', ({ id }) => { if (id === 'chess') close(); });
  bus.on('power:down', close);
  bus.on('lang:changed', () => { if (game) { statusEl.textContent = statusText(); paintMoves(); } });
  paintMenu();
  if (windows.getStatus('chess') !== 'closed') open();      // mount() runs after the first "opened" event
}
