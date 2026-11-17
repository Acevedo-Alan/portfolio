/*
 * shell/wizards/dialup.js — the tray's network icon: the contact form,
 * disguised as a dial-up connection wizard.
 *
 * There is no backend. "Dialing" is theatre (with a synthesized modem
 * handshake); on connect the message is handed to the visitor's own email
 * client as a mailto: link. Nothing is sent to any server, and the typed
 * text never leaves the page except through that mailto.
 */

import { t } from '../../i18n/i18n.js';
import { escapeHTML } from '../../core/dom.js';
import { play } from '../../audio/sounds.js';
import { modemDial } from '../../audio/effects.js';
import { openWizard } from '../modal.js';

const EMAIL = 'acevedo.j.alan@gmail.com';
const DIAL_MS = 7500;

export function openDialupWizard() {
  let modem = null;
  let timer = null;
  const stopAll = () => { clearInterval(timer); if (modem) modem.stop(); modem = null; };
  const wiz = openWizard({ titleKey: 'dial-title', iconId: 'dial-up-connection', onClose: stopAll });
  let draft = { name: '', message: '' };

  function form(error = '') {
    wiz.setPage({
      heading: t('dial-h'),
      content: `
        <p>${t('dial-intro')}</p>
        <label class="wiz-field"><span>${t('dial-name')}</span><input id="dial-name" type="text" autocomplete="name" value="${escapeHTML(draft.name)}"></label>
        <label class="wiz-field"><span>${t('dial-message')}</span><textarea id="dial-message" rows="4">${escapeHTML(draft.message)}</textarea></label>
        <p class="wiz-error" role="alert">${error}</p>`,
      buttons: [
        { label: t('dial-connect'), primary: true, onClick: dial },
        { label: t('btn-cancel'), onClick: wiz.close },
      ],
    });
  }

  function dial() {
    draft = {
      name: wiz.el.querySelector('#dial-name').value.trim(),
      message: wiz.el.querySelector('#dial-message').value.trim(),
    };
    if (!draft.name || !draft.message) { form(escapeHTML(t('dial-required'))); return; }

    wiz.setPage({
      heading: t('dial-h'),
      content: '<p id="dial-status"></p><div class="xp-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>',
      buttons: [{ label: t('btn-cancel'), onClick: wiz.close }],
    });
    modem = modemDial(DIAL_MS / 1000);

    const bar = wiz.el.querySelector('.xp-progress');
    const status = wiz.el.querySelector('#dial-status');
    const started = performance.now();
    timer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - started) / DIAL_MS);
      bar.firstElementChild.style.width = progress * 100 + '%';
      bar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
      status.textContent = progress < 0.3 ? t('dial-step1') : progress < 0.7 ? t('dial-step2') : t('dial-step3');
      if (progress >= 1) { clearInterval(timer); connected(); }
    }, 100);
  }

  function connected() {
    play('ding');
    const subject = encodeURIComponent(t('dial-subject'));
    const body = encodeURIComponent(`${draft.message}\n\n— ${draft.name}`);
    const link = document.createElement('a');           // a click on a mailto: link hands off to the visitor's mail client
    link.href = `mailto:${EMAIL}?subject=${subject}&body=${body}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    wiz.setPage({
      heading: t('dial-done-h'),
      content: `<p>${t('dial-done')}</p>`,
      buttons: [{ label: t('wiz-finish'), primary: true, onClick: wiz.close }],
    });
  }

  form();
}
