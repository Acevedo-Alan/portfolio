/*
 * apps/contact.js — the Contact "properties" sheet and the Outlook Express-style composer.
 *
 * The sheet shows each address in a read-only sunken field with Copy / Visit buttons; "Write…" opens the
 * composer window (#win-mail). The site has no backend, so by default Send hands the message to the
 * visitor's mail program through a mailto: link. To send from inside the page instead, set ENDPOINT to a
 * form service that accepts JSON (Formspree, Web3Forms, …); the composer then POSTs there and never leaves.
 */

import { $, $$ } from '../core/dom.js';
import * as bus from '../core/bus.js';
import * as windows from '../shell/windowManager.js';
import { play } from '../audio/sounds.js';
import { t } from '../i18n/i18n.js';

const EMAIL = 'acevedo.j.alan@gmail.com';
const ENDPOINT = '';                    // e.g. 'https://formspree.io/f/xxxxxxxx'

export function mount() {
  const sheet = $('#win-contacto');
  const sheetStatus = $('#ct-status-text', sheet);
  const form = $('#ml-form');
  const from = $('#ml-from');
  const subject = $('#ml-subject');
  const body = $('#ml-body');
  const mailStatus = $('#ml-status-text');
  let sheetMsg = 'ct-idle';
  let mailMsg = 'ml-ready';

  const say = (el, key) => { el.textContent = t(key); return key; };
  sheetMsg = say(sheetStatus, sheetMsg);
  mailMsg = say(mailStatus, mailMsg);
  bus.on('lang:changed', () => { say(sheetStatus, sheetMsg); say(mailStatus, mailMsg); });

  // ---------- the properties sheet ----------

  async function copy(input) {
    input.select();
    let ok = false;
    try { await navigator.clipboard.writeText(input.value); ok = true; } catch { /* fall back below */ }
    if (!ok) { try { ok = document.execCommand('copy'); } catch { /* nothing else to try */ } }
    if (ok) { sheetMsg = say(sheetStatus, 'ct-copied'); play('menu'); }
  }

  $$('.ct-row', sheet).forEach((row) => {
    const input = $('input', row);
    input.addEventListener('focus', () => input.select());
    input.addEventListener('click', () => input.select());
    row.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'copy') copy(input);
      else if (act === 'visit') window.open(row.dataset.href, '_blank', 'noopener');
      else if (act === 'compose') compose();
    });
  });

  // ---------- the composer ----------

  function compose() {
    windows.open('mail');
    setTimeout(() => (subject.value ? body : subject).focus(), 60);
  }

  async function send() {
    if (!subject.value.trim() || !body.value.trim()) {
      mailMsg = say(mailStatus, 'ml-need');
      play('exclamation');
      (subject.value.trim() ? body : subject).focus();
      return;
    }
    const reply = from.value.trim();
    const text = reply ? `${body.value}\n\n— ${reply}` : body.value;

    if (!ENDPOINT) {
      const link = document.createElement('a');           // a click on a mailto: link hands off to the visitor's mail client
      link.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject.value)}&body=${encodeURIComponent(text)}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      mailMsg = say(mailStatus, 'ml-handoff');
      return;
    }

    mailMsg = say(mailStatus, 'ml-sending');
    form.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: reply, subject: subject.value, message: body.value }),
      });
      if (!res.ok) throw new Error(String(res.status));
      subject.value = body.value = '';
      mailMsg = say(mailStatus, 'ml-sent');
      play('ding');
    } catch {
      mailMsg = say(mailStatus, 'ml-failed');
      play('error');
    } finally {
      form.removeAttribute('aria-busy');
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); send(); });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
  });
}
