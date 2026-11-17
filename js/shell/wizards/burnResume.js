/*
 * shell/wizards/burnResume.js — the "Burn Resume" CD-burning wizard.
 *
 * Theatre on purpose: a fake progress bar with a synthesized CD-drive hum,
 * ending in a real download of RESUME_URL. If that file isn't published, the
 * wizard says so and points to the Contact window instead of failing.
 *
 * To publish the résumé, put the PDF at resume/Alan-Acevedo-CV.pdf.
 */

import { t } from '../../i18n/i18n.js';
import { play } from '../../audio/sounds.js';
import { cdHum } from '../../audio/effects.js';
import { openWizard } from '../modal.js';
import * as windows from '../windowManager.js';

export const RESUME_URL = 'resume/Alan-Acevedo-CV.pdf';
const BURN_MS = 7000;

async function resumeIsPublished() {
  try {
    const response = await fetch(RESUME_URL, { method: 'HEAD', cache: 'no-store' });
    return response.ok;
  } catch (e) {
    return false;                              // offline, file://, or blocked
  }
}

function download() {
  const link = document.createElement('a');
  link.href = RESUME_URL;
  link.download = RESUME_URL.split('/').pop();
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function openBurnWizard() {
  const published = resumeIsPublished();       // start checking while the wizard is on its first page
  let hum = null;
  let timer = null;
  const stopAll = () => { clearInterval(timer); if (hum) hum.stop(); hum = null; };
  const wiz = openWizard({ titleKey: 'burn-title', iconId: 'copy-to-disc', onClose: stopAll });

  const welcome = () => wiz.setPage({
    heading: t('burn-intro-h'),
    content: `<p>${t('burn-intro')}</p>`,
    buttons: [
      { label: t('wiz-next'), primary: true, onClick: burn },
      { label: t('btn-cancel'), onClick: wiz.close },
    ],
  });

  function burn() {
    wiz.setPage({
      heading: t('burn-progress-h'),
      content: '<p id="burn-status"></p><div class="xp-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>',
      buttons: [{ label: t('btn-cancel'), onClick: wiz.close }],
    });
    hum = cdHum(BURN_MS / 1000 + 0.4);

    const bar = wiz.el.querySelector('.xp-progress');
    const status = wiz.el.querySelector('#burn-status');
    const started = performance.now();
    timer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - started) / BURN_MS);
      bar.firstElementChild.style.width = progress * 100 + '%';
      bar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
      status.textContent = progress < 0.25 ? t('burn-prepare') : progress < 0.9 ? t('burn-write') : t('burn-finish');
      if (progress >= 1) { clearInterval(timer); done(); }
    }, 100);
  }

  async function done() {
    const ok = await published;
    play('ding');
    if (ok) {
      download();
      wiz.setPage({
        heading: t('burn-done-h'),
        content: `<p>${t('burn-done')}</p>`,
        buttons: [{ label: t('wiz-finish'), primary: true, onClick: wiz.close }],
      });
    } else {
      wiz.setPage({
        heading: t('burn-missing-h'),
        content: `<p>${t('burn-missing')}</p>`,
        buttons: [
          { label: t('burn-open-contact'), primary: true, onClick: () => { wiz.close(); windows.open('contacto'); } },
          { label: t('wiz-finish'), onClick: wiz.close },
        ],
      });
    }
  }

  welcome();
}
