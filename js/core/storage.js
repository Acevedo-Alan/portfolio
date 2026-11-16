/*
 * core/storage.js — localStorage that never throws (private windows, blocked
 * site data). Everything stored here is a per-visitor convenience.
 */

export function get(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

export function set(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable: ignore */ }
}

export function getJSON(key, fallback) {
  const raw = get(key);
  if (raw === null) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}

export function setJSON(key, value) {
  set(key, JSON.stringify(value));
}
