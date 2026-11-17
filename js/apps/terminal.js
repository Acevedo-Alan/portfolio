/*
 * apps/terminal.js — the Command Prompt window.
 *
 * Commands live in a registry (a Map of name -> handler). To add one, call
 * registerCommand(); nothing in the input/echo/history code changes. Handlers
 * receive ({ args, print }) and return nothing.
 */

import { $, $$, escapeHTML } from '../core/dom.js';
import * as bus from '../core/bus.js';
import { t, dict, setLang } from '../i18n/i18n.js';
import { play } from '../audio/sounds.js';
import * as windows from '../shell/windowManager.js';
import * as bsod from '../shell/bsod.js';
import { APPS } from './registry.js';
import { getStackGroups } from './deviceManager.js';

const PROMPT = 'C:\\Users\\alan&gt;';
const EMAIL = 'acevedo.j.alan@gmail.com';

const commands = new Map();
let body, log, input;

/** Registers `name` (and optional aliases) as a terminal command. */
export function registerCommand(name, handler, { aliases = [] } = {}) {
  [name, ...aliases].forEach((n) => commands.set(n, handler));
}

// ---------- Output ----------

function print(html) {
  if (!html) return;
  const line = document.createElement('div');
  line.className = 'term-line';
  line.innerHTML = html;
  log.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

function echo(text) {
  const line = document.createElement('div');
  line.className = 'term-line term-line--echo';
  line.innerHTML = `<span class="term-prompt-inline" aria-hidden="true">${PROMPT}</span> <span class="term-typed"></span>`;
  line.querySelector('.term-typed').textContent = text;
  log.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

// ---------- Built-in commands ----------

function registerBuiltins() {
  registerCommand('help', () => print(dict()['term-help'].map((line) => `<div>${line}</div>`).join('')));

  // One command per window: `proyectos`, `music`, `bugsweeper`, ... (plus aliases from the registry)
  APPS.filter((app) => app.id !== 'terminal').forEach((app) => {
    registerCommand(app.id, () => {
      print(t('term-goto').replace('%s', t(app.title)));
      windows.open(app.id);
    }, { aliases: app.aliases || [] });
  });

  // Reads the Device Manager tree, so the stack lives in one place.
  registerCommand('skills', () => print(getStackGroups()
    .map((g) => `<div><span class="cmd-hl">${escapeHTML(g.name)}</span>: ${escapeHTML(g.items.join(' · '))}</div>`)
    .join('')));

  registerCommand('contact', () => print($$('.contact-links a')
    .map((a) => `<div>${a.outerHTML}</div>`)
    .join('')));

  registerCommand('clear', () => { log.innerHTML = ''; }, { aliases: ['cls'] });

  registerCommand('lang', ({ args }) => {
    const target = (args[0] || '').toLowerCase();
    if (target === 'es' || target === 'en') {
      setLang(target);
      print(t('term-lang-set').replace('%s', target));
    } else {
      print(t('term-lang-usage'));
    }
  });

  registerCommand('email', () => {
    window.location.href = 'mailto:' + EMAIL;
    print(t('term-email-opening'));
  });

  // Easter eggs: deliberately left out of `help`.
  registerCommand('bsod', () => bsod.show());
  registerCommand('sudo', () => { play('exclamation'); print(t('term-sudo')); });
}

// ---------- Input ----------

function run(raw) {
  const text = raw.trim();
  echo(text);
  if (!text) return;
  const [name, ...args] = text.split(/\s+/);
  const handler = commands.get(name.toLowerCase().replace(/^\//, ''));   // `/music` works like `music`
  if (handler) {
    handler({ args });
  } else {
    play('error');
    print(t('term-not-found').replace('%s', escapeHTML(name)));
  }
}

export function mount() {
  body = $('#term-body');
  log = $('#term-log');
  input = $('#term-input');
  const form = $('#term-form');
  const history = [];
  let cursor = 0;

  registerBuiltins();
  print(t('term-welcome'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value;
    if (value.trim()) { history.push(value.trim()); cursor = history.length; }
    input.value = '';
    run(value);
  });

  // Clicking anywhere in the console focuses the input, like a real terminal.
  body.addEventListener('click', () => {
    if (!window.getSelection().toString()) input.focus({ preventScroll: true });
  });

  // Arrow keys recall history without affecting Tab order.
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    cursor = Math.min(Math.max(cursor + (e.key === 'ArrowUp' ? -1 : 1), 0), history.length);
    input.value = history[cursor] || '';
  });

  bus.on('window:opened', ({ id }) => { if (id === 'terminal') input.focus({ preventScroll: true }); });
}
