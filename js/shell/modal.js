/*
 * shell/modal.js — an XP-style wizard dialog (blue side panel, heading, body,
 * button row) shown over a dimmed desktop. Used by the CD-burning and dial-up
 * wizards; knows nothing about either.
 *
 * Accessibility: role=dialog + aria-modal, focus moves in and is trapped, Esc
 * cancels, focus returns to where it was, and the rest of the page is made
 * `inert` while the dialog is open.
 */

import { $, $$, icon, escapeHTML } from '../core/dom.js';
import { t } from '../i18n/i18n.js';
import { play } from '../audio/sounds.js';

const INERT_SELECTORS = ['#desktop', '.taskbar', '#start-menu', '.mascot', '#balloon', '#vol-pop'];
const CLOSE_GLYPH = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>';
const FOCUSABLE = 'button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])';

let active = null;

/**
 * Opens a wizard. Returns { el, close, setPage }.
 *   titleKey  i18n key for the title bar
 *   iconId    XP icon name shown in the title bar and side panel
 *   onClose   called once when the wizard closes (cancel, finish or Esc)
 */
export function openWizard({ titleKey, iconId, onClose = () => {} }) {
  if (active) active.close();
  const previouslyFocused = document.activeElement;

  const backdrop = document.createElement('div');
  backdrop.className = 'xp-backdrop';
  backdrop.innerHTML = `
    <div class="window active xp-modal" role="dialog" aria-modal="true" aria-labelledby="xp-modal-title">
      <div class="titlebar">
        ${icon(iconId, 't-ico')}<span class="t-text" id="xp-modal-title">${escapeHTML(t(titleKey))}</span>
        <div class="t-btns"><button type="button" class="wb wb-close" data-cancel aria-label="${escapeHTML(t('win-close'))}">${CLOSE_GLYPH}</button></div>
      </div>
      <div class="wiz">
        <div class="wiz-side" aria-hidden="true">${icon(iconId)}</div>
        <div class="wiz-main"><h3 class="wiz-h" id="wiz-heading"></h3><div class="wiz-body" id="wiz-body" aria-live="polite"></div></div>
      </div>
      <div class="wiz-buttons"></div>
    </div>`;
  document.body.appendChild(backdrop);
  const dialog = $('.xp-modal', backdrop);
  INERT_SELECTORS.forEach((sel) => { const el = $(sel); if (el) el.inert = true; });
  play('exclamation');

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown, true);
    backdrop.remove();
    INERT_SELECTORS.forEach((sel) => { const el = $(sel); if (el) el.inert = false; });
    active = null;
    onClose();
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = $$(FOCUSABLE, dialog).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKeydown, true);
  $('[data-cancel]', dialog).addEventListener('click', close);

  /**
   * Shows a page: `heading` (text), `content` (HTML string or Node) and
   * `buttons` ([{ label, primary, disabled, onClick }]). Focus goes to the
   * primary button (or the first field).
   */
  function setPage({ heading, content, buttons = [] }) {
    $('#wiz-heading', dialog).textContent = heading;
    const body = $('#wiz-body', dialog);
    body.replaceChildren();
    if (typeof content === 'string') body.innerHTML = content; else if (content) body.appendChild(content);

    const row = $('.wiz-buttons', dialog);
    row.replaceChildren();
    buttons.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-xp' + (b.primary ? ' principal-d' : '');
      btn.textContent = b.label;
      btn.disabled = !!b.disabled;
      btn.addEventListener('click', () => b.onClick && b.onClick());
      row.appendChild(btn);
    });
    const target = $('input, textarea', body) || $('.principal-d', row) || $('button', row);
    if (target) target.focus();
  }

  active = { close };
  return { el: dialog, close, setPage };
}
