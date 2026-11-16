/*
 * core/viewport.js — the desktop's geometry. TASKBAR_H must match
 * --taskbar-h in css/base.css.
 */

export const TASKBAR_H = 40;

const MOBILE_QUERY = window.matchMedia('(max-width: 700px)');
export const isMobile = () => MOBILE_QUERY.matches;

/** Usable desktop area (everything above the taskbar). */
export const desktopSize = () => ({ w: window.innerWidth, h: window.innerHeight - TASKBAR_H });
