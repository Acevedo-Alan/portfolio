/*
 * apps/solitaire/ui.js — Klondike Solitaire in a window. Rules live in engine.js.
 *
 * Click-to-move (no drag, so it works with keyboard and touch): click a card to pick it up
 * (with everything stacked on it), then click where it should go; double-click sends a card
 * to its foundation; click the stock to draw. Every face-up card is a real <button> with a
 * spoken name ("King of spades").
 */

import { $ } from '../../core/dom.js';
import * as bus from '../../core/bus.js';
import { t, dict, translate } from '../../i18n/i18n.js';
import { play } from '../../audio/sounds.js';
import * as engine from './engine.js';

const GLYPHS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const DOWN_STEP = 12;    // px between face-down cards in a column
const UP_STEP = 24;      // px between face-up cards
const CARD_H = 88;

export function mount() {
  const root = $('#win-solitaire .sol-body');
  let state = engine.deal();
  let selected = null;     // a "place" as described in engine.js
  let won = false;

  root.innerHTML = `
    <div class="sol-bar">
      <button type="button" class="btn-xp" data-sol="new" data-i18n="sol-new"></button>
      <span class="sol-moves" role="status"></span>
    </div>
    <div class="sol-table" id="sol-table"></div>
    <p class="sol-msg" id="sol-msg" role="status" hidden></p>`;
  translate(root);

  const table = $('#sol-table', root);
  const movesLabel = $('.sol-moves', root);

  const cardName = (card) => t('sol-card')
    .replace('%r', dict()['sol-ranks'][card.rank - 1])
    .replace('%s', dict()['sol-suits'][engine.SUITS.indexOf(card.suit)]);
  const sameSpot = (a, b) => !!a && !!b && a.zone === b.zone && a.index === b.index;

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
    movesLabel.textContent = t('sol-moves').replace('%n', state.moves);
  }

  function message(key) {
    const el = $('#sol-msg', root);
    el.hidden = !key;
    el.textContent = key ? t(key) : '';
  }

  function afterMove() {
    selected = null;
    won = engine.isWon(state);
    render();
    if (won) { play('startup'); message('sol-won'); } else message('');
  }

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

    if (spot.zone === 'stock') { engine.drawFromStock(state); play('menu'); selected = null; render(); return; }

    if (selected) {
      if ((spot.zone === 'tableau' || spot.zone === 'foundation') && engine.move(state, selected, spot)) { play('restore'); afterMove(); return; }
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
    if (engine.autoToFoundation(state, from)) { play('restore'); afterMove(); }
  }

  table.addEventListener('click', onClick);
  table.addEventListener('dblclick', onDoubleClick);
  $('[data-sol="new"]', root).addEventListener('click', () => {
    state = engine.deal();
    won = false;
    selected = null;
    message('');
    render();
    play('menu');
  });
  bus.on('lang:changed', render);
  render();
}
