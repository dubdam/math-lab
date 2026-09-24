// Controles comunes de los experimentos (ayuda que se desvanece, sonido, panel "?",
// pantalla completa). Cada experimento escucha estos eventos en window:
//   lab:sound     detail: boolean   → prender/apagar su audio (llega dentro del gesto del usuario)
//   lab:info      detail: boolean   → el panel se abrió/cerró
// y puede emitir:
//   lab:show-hud  detail?: number   → mostrar la ayuda unos ms
//   lab:fullscreen                  → alternar pantalla completa

/** true si la tecla no le corresponde al experimento (modificadores, o activa un botón). */
export function ignoreKey(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  return e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter');
}

export function showHud(ms?: number) {
  window.dispatchEvent(new CustomEvent('lab:show-hud', { detail: ms }));
}

export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

export function initLabUi() {
  const help = document.getElementById('help')!;
  const back = document.querySelector('.back') as HTMLElement;
  const soundBtn = document.getElementById('sound-btn') as HTMLButtonElement;
  const infoBtn = document.getElementById('info-btn') as HTMLButtonElement;
  const info = document.getElementById('info')!;
  const infoClose = document.getElementById('info-close') as HTMLButtonElement;

  let hudTimer = 0;
  function hud(ms = 5000) {
    help.classList.remove('hidden');
    back.classList.remove('hidden');
    clearTimeout(hudTimer);
    hudTimer = window.setTimeout(() => {
      help.classList.add('hidden');
      back.classList.add('hidden');
    }, ms);
  }

  let soundOn = false;
  function toggleSound() {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.textContent = soundOn ? 'sonido: sí' : 'sonido: no';
    window.dispatchEvent(new CustomEvent('lab:sound', { detail: soundOn }));
  }

  function setInfo(open: boolean) {
    info.hidden = !open;
    infoBtn.setAttribute('aria-expanded', String(open));
    (open ? infoClose : infoBtn).focus();
    window.dispatchEvent(new CustomEvent('lab:info', { detail: open }));
  }

  soundBtn.addEventListener('click', toggleSound);
  infoBtn.addEventListener('click', () => setInfo(info.hidden));
  infoClose.addEventListener('click', () => setInfo(false));
  window.addEventListener('lab:show-hud', (e) => hud((e as CustomEvent).detail));
  window.addEventListener('lab:fullscreen', toggleFullscreen);

  window.addEventListener('keydown', (e) => {
    if (ignoreKey(e)) return;
    switch (e.key.toLowerCase()) {
      case 's': toggleSound(); break;
      case '?': setInfo(info.hidden); break;
      case 'escape': if (!info.hidden) setInfo(false); break;
      case 'h': hud(); break;
      case 'f': toggleFullscreen(); break;
    }
  });

  hud(6000);
}
