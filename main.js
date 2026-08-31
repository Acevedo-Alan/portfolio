/*
 * main.js
 * Interactive behavior for the portfolio: language switching, the
 * dark/light theme toggle, scroll-based nav highlighting, fade-in-on-scroll,
 * and the themed project thumbnail reveals (HEXA / Lana & Lino).
 *
 * Loaded with `defer` after i18n.js, so by the time this file runs the DOM
 * is fully parsed and the global `i18n` dictionary is available. The only
 * script that runs earlier is the tiny inline snippet in index.html's
 * <head> that sets data-theme before first paint (kept inline/blocking on
 * purpose, to avoid a flash of the wrong theme).
 */

// ---------- Language ----------

function currentLangDict() {
  const lang = document.documentElement.lang || 'es';
  return i18n[lang] || i18n.es;
}

function setLang(lang) {
  document.documentElement.lang = lang;

  const esBtn = document.getElementById('btn-es');
  const enBtn = document.getElementById('btn-en');
  const isEs = lang === 'es';
  const dict = i18n[lang];

  esBtn.classList.toggle('active', isEs);
  enBtn.classList.toggle('active', !isEs);
  esBtn.setAttribute('aria-pressed', String(isEs));
  enBtn.setAttribute('aria-pressed', String(!isEs));
  esBtn.setAttribute('aria-label', dict['lang-es-label']);
  enBtn.setAttribute('aria-label', dict['lang-en-label']);

  try { localStorage.setItem('portfolio-lang', lang); } catch (e) {}

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key] !== undefined) el.innerHTML = dict[key];
  });
  document.querySelectorAll('[data-i18n-list]').forEach((el) => {
    const key = el.getAttribute('data-i18n-list');
    const items = dict[key];
    if (items) el.innerHTML = items.map((t) => `<li>${t}</li>`).join('');
  });

  // The theme button's label/title is language-dependent too.
  updateThemeButtonState();

  // Same for the terminal output region's accessible name.
  const log = document.getElementById('term-log');
  if (log) log.setAttribute('aria-label', dict['term-log-label'] || '');
}

// ---------- Theme (dark/light) ----------

function updateThemeButtonState() {
  const btn = document.getElementById('theme-toggle');
  const icon = document.getElementById('theme-icon');
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const isLight = theme === 'light';
  const dict = currentLangDict();

  if (icon) icon.textContent = isLight ? '☀' : '☾';
  if (btn) {
    btn.setAttribute('aria-pressed', String(isLight));
    const label = isLight ? dict['theme-to-dark'] : dict['theme-to-light'];
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('portfolio-theme', theme); } catch (e) {}
  updateThemeButtonState();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ---------- Init ----------

let storedLang = null;
try { storedLang = localStorage.getItem('portfolio-lang'); } catch (e) {}
setLang(storedLang || 'es');

// The <head> inline snippet already applied the correct data-theme
// attribute before paint; this just syncs the toggle button's label/icon
// and persists the resolved value.
applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');

document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
document.getElementById('btn-es').addEventListener('click', () => setLang('es'));
document.getElementById('btn-en').addEventListener('click', () => setLang('en'));

// ---------- ASCII name banner: scale-to-fit ----------
// The literal ASCII-art name is a fixed grid of monospace characters —
// unlike ordinary text it can't reflow or shrink via font-size media
// queries without breaking its letterforms, so the only way to keep it
// from overflowing on a narrower container is a uniform transform:
// scale(). Below 520px the CSS media query swaps in the two-line
// first-name/last-name split instead of scaling the single-line version
// indefinitely (see .ascii-fit--split in styles.css); this only handles
// fitting whichever group is currently visible.

const ASCII_MIN_SCALE = 0.5;

function fitAsciiGroup(group) {
  const pres = Array.from(group.querySelectorAll('.ascii-art'));
  if (!pres.length) return;

  // Reset before measuring, so a previous scale doesn't affect the
  // "natural" (unscaled) size read back below.
  pres.forEach((pre) => { pre.style.transform = 'none'; });

  const containerWidth = group.clientWidth;
  if (!containerWidth) return; // hidden group (the other breakpoint's), nothing to fit

  const naturalWidth = Math.max(...pres.map((pre) => pre.scrollWidth));
  const naturalHeight = pres.reduce((sum, pre) => sum + pre.scrollHeight, 0);
  if (!naturalWidth) return;

  const scale = Math.max(ASCII_MIN_SCALE, Math.min(1, containerWidth / naturalWidth));
  pres.forEach((pre) => { pre.style.transform = `scale(${scale})`; });
  // transform: scale() shrinks the paint but not the layout box, so
  // without this the group would keep reserving its full unscaled
  // height and leave a gap beneath the now-smaller art.
  group.style.height = `${naturalHeight * scale}px`;
}

const asciiGroups = document.querySelectorAll('.ascii-fit');
if (asciiGroups.length) {
  asciiGroups.forEach(fitAsciiGroup);
  if ('ResizeObserver' in window) {
    const asciiResizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => fitAsciiGroup(entry.target));
    });
    asciiGroups.forEach((group) => asciiResizeObserver.observe(group));
  } else {
    window.addEventListener('resize', () => asciiGroups.forEach(fitAsciiGroup));
  }
}

// ---------- Active nav highlighting ----------

const sections = document.querySelectorAll('main section');
// Matches links in both the desktop and mobile nav (see .cmdnav--desktop /
// .cmdnav--mobile in index.html) — they share the .cmdnav class and each
// carry the same data-section values, so a single querySelectorAll here
// keeps both in sync regardless of which one is currently visible.
const navLinks = document.querySelectorAll('.cmdnav a');
const navObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      navLinks.forEach((l) => l.classList.remove('active'));
      const links = document.querySelectorAll(`.cmdnav a[data-section="${entry.target.id}"]`);
      links.forEach((l) => l.classList.add('active'));
    }
  });
}, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
sections.forEach((s) => navObserver.observe(s));

// ---------- Fade-in on scroll ----------
// (with a safety fallback for browsers without IntersectionObserver)

const fadeEls = document.querySelectorAll('.fade-in');
if ('IntersectionObserver' in window) {
  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  fadeEls.forEach((el) => fadeObserver.observe(el));

  // Landing directly on a deep link (e.g. a URL ending in #contacto)
  // relies on the browser's own anchor-scroll to bring that section into
  // view — IntersectionObserver reacts to that scroll the same as any
  // other, but its very first check can run before that scroll happens,
  // so don't make the visitor wait a frame for the observer to catch up:
  // reveal the target section immediately.
  if (location.hash) {
    let target = null;
    try { target = document.querySelector(location.hash); } catch (e) {}
    if (target) {
      target.querySelectorAll('.fade-in').forEach((el) => {
        el.classList.add('in');
        fadeObserver.unobserve(el);
      });
    }
  }
} else {
  fadeEls.forEach((el) => el.classList.add('in'));
}

// ---------- Interactive terminal ----------
// A real command line wired to the exact same setLang()/applyTheme()
// functions the header buttons call, and to the exact same <nav> anchors
// the nav bar uses for scrolling — nothing here duplicates that logic.

const NAV_COMMANDS = ['whoami', 'stack', 'experiencia', 'proyectos', 'educacion', 'contacto'];

const termLog = document.getElementById('term-log');
const termForm = document.getElementById('term-form');
const termInput = document.getElementById('term-input');

function termPrint(html) {
  if (!termLog || !html) return;
  const line = document.createElement('div');
  line.className = 'term-line';
  line.innerHTML = html;
  termLog.appendChild(line);
  termLog.scrollTop = termLog.scrollHeight;
}

function termEcho(text) {
  if (!termLog) return;
  const line = document.createElement('div');
  line.className = 'term-line term-line--echo';
  line.innerHTML = '<span class="term-prompt-inline" aria-hidden="true"><span class="user">alan@portfolio</span><span class="sep">:</span><span class="path">~</span><span class="sep">$</span></span> <span class="term-typed"></span>';
  line.querySelector('.term-typed').textContent = text;
  termLog.appendChild(line);
  termLog.scrollTop = termLog.scrollHeight;
}

// Reuses the real nav anchors (and therefore the browser's native anchor
// scrolling + the existing IntersectionObserver active-highlighting) instead
// of re-implementing scroll-to-section.
function goToSection(id) {
  const link = Array.from(navLinks).find((l) => l.dataset.section === id);
  if (link) link.click();
}

function runCommand(raw) {
  const trimmed = raw.trim();
  termEcho(trimmed);
  if (!trimmed) return;

  const [cmd, ...args] = trimmed.split(/\s+/);
  const cmdLower = cmd.toLowerCase();
  const dict = currentLangDict();

  if (cmdLower === 'help') {
    termPrint((dict['term-help'] || []).map((line) => `<div>${line}</div>`).join(''));
    return;
  }

  if (NAV_COMMANDS.includes(cmdLower)) {
    goToSection(cmdLower);
    termPrint((dict['term-goto'] || '').replace('%s', cmdLower));
    return;
  }

  if (cmdLower === 'clear') {
    termLog.innerHTML = '';
    return;
  }

  if (cmdLower === 'lang') {
    const target = (args[0] || '').toLowerCase();
    if (target === 'es' || target === 'en') {
      setLang(target);
      termPrint((currentLangDict()['term-lang-set'] || '').replace('%s', target));
    } else {
      termPrint(dict['term-lang-usage']);
    }
    return;
  }

  if (cmdLower === 'theme') {
    const target = (args[0] || '').toLowerCase();
    if (target === 'dark' || target === 'light') {
      applyTheme(target);
      termPrint((dict['term-theme-set'] || '').replace('%s', target));
    } else {
      termPrint(dict['term-theme-usage']);
    }
    return;
  }

  if (cmdLower === 'email') {
    window.location.href = 'mailto:acevedo.j.alan@gmail.com';
    termPrint(dict['term-email-opening']);
    return;
  }

  // Easter egg — deliberately left out of the `help` listing, same as a
  // real shell's `sudo` joke: it's meant to be stumbled into, not
  // advertised.
  if (cmdLower === 'sudo') {
    termPrint(dict['term-sudo']);
    return;
  }

  termPrint((dict['term-not-found'] || '').replace('%s', cmd));
}

if (termForm && termInput) {
  let termHistory = [];
  let termHistoryIndex = 0;

  termPrint(currentLangDict()['term-welcome']);

  termForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = termInput.value;
    if (value.trim()) {
      termHistory.push(value.trim());
      termHistoryIndex = termHistory.length;
    }
    termInput.value = '';
    runCommand(value);
  });

  // Command history recall. Purely a keyboard convenience — it does not
  // change tab order or trap focus, so tabbing away from the input works
  // exactly as it would for any other text field.
  termInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      if (termHistoryIndex > 0) {
        termHistoryIndex -= 1;
        termInput.value = termHistory[termHistoryIndex] || '';
      }
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (termHistoryIndex < termHistory.length) {
        termHistoryIndex += 1;
        termInput.value = termHistory[termHistoryIndex] || '';
      }
      e.preventDefault();
    }
  });
}