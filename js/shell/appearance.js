/*
 * shell/appearance.js — the desktop's look: wallpaper, color theme and the
 * user picture. Wallpaper and theme are attributes on <html> (data-wallpaper,
 * data-theme) and the picture is a CSS variable (--user-tile) that the Start
 * menu portrait and the welcome screen read, so applying a change is one line
 * and previews are free.
 *
 * Wallpapers are defined in css/desktop.css, the Zune theme in
 * css/theme-zune.css, the pictures are in imgs/xp-tiles/. Add one by adding
 * it here and its CSS/file.
 */

import * as bus from '../core/bus.js';
import * as storage from '../core/storage.js';

export const WALLPAPERS = ['bliss', 'autumn', 'azul', 'moon'];
export const THEMES = ['luna', 'zune'];
export const TILES = [
  'duck', 'airplane', 'ball', 'beach', 'car', 'cat', 'chess', 'dog',
  'drip', 'fish', 'guest', 'guitar', 'kick', 'lift-off', 'red-flower', 'snowflake',
];
export const tileUrl = (name) => `imgs/xp-tiles/${name}.jpg`;

const WALLPAPER_KEY = 'portfolio-wallpaper';
const THEME_KEY = 'portfolio-xp-theme';           // not 'portfolio-theme': the old terminal site stored dark/light there
const TILE_KEY = 'portfolio-user-tile';
const THEME_COLORS = { luna: '#245EDC', zune: '#1B1B1E' };

const pick = (value, allowed) => (allowed.includes(value) ? value : allowed[0]);

let current = {
  wallpaper: pick(storage.get(WALLPAPER_KEY), WALLPAPERS),
  theme: pick(storage.get(THEME_KEY), THEMES),
  tile: pick(storage.get(TILE_KEY), TILES),
};

export const get = () => ({ ...current });

function apply() {
  const root = document.documentElement;
  root.dataset.wallpaper = current.wallpaper;
  root.dataset.theme = current.theme;
  // A url() inside a CSS variable resolves against the stylesheet that uses it (css/…), not the page,
  // so hand the stylesheets an absolute URL.
  root.style.setProperty('--user-tile', `url("${new URL(tileUrl(current.tile), document.baseURI).href}")`);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[current.theme]);
}

/** Sets and persists any of { wallpaper, theme, tile }. */
export function set(next) {
  current = {
    wallpaper: pick(next.wallpaper || current.wallpaper, WALLPAPERS),
    theme: pick(next.theme || current.theme, THEMES),
    tile: pick(next.tile || current.tile, TILES),
  };
  storage.set(WALLPAPER_KEY, current.wallpaper);
  storage.set(THEME_KEY, current.theme);
  storage.set(TILE_KEY, current.tile);
  apply();
  bus.emit('appearance:changed', get());
}

export function init() {
  apply();
}
