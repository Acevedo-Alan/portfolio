/*
 * core/bus.js — a minimal publish/subscribe event bus.
 *
 * Lets modules react to each other without importing each other (the window
 * manager announces "window:opened"; the taskbar, mascot and balloon each
 * listen). Events used in this app:
 *
 *   window:opened     { id, quiet, restored }
 *   window:focused    { id | null }
 *   window:minimized  { id }
 *   window:closed     { id }
 *   icon:hover        { id }
 *   lang:changed      'es' | 'en'
 *   sound:muted       boolean
 *   startmenu:opened  / startmenu:close
 */

const listeners = new Map();

/** Subscribes to `event`. Returns an unsubscribe function. */
export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event).delete(handler);
}

export function emit(event, payload) {
  (listeners.get(event) || []).forEach((handler) => handler(payload));
}
