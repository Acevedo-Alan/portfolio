/*
 * ui/tabs.js — accessible tab strip (role=tablist / tab / tabpanel) with
 * roving tabindex and ArrowLeft/Right/Home/End keys. Reusable by any window.
 */

import { $$ } from '../core/dom.js';

export function initTabs(root) {
  const tabs = $$('[role="tab"]', root);

  const select = (tab, focus = false) => {
    tabs.forEach((other) => {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus();
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const target = {
        ArrowRight: tabs[(i + 1) % tabs.length],
        ArrowLeft: tabs[(i - 1 + tabs.length) % tabs.length],
        Home: tabs[0],
        End: tabs[tabs.length - 1],
      }[e.key];
      if (target) { e.preventDefault(); select(target, true); }
    });
  });

  select(tabs[0]);
}
