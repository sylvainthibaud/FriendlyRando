// Petit bouquetin dessiné en SVG (vue de profil, tourné vers la droite).
// Les pattes s'animent quand l'élément porte la classe "walking" ; "flip" le retourne vers la gauche.

const FUR = '#b8875a';
const FUR_FAR = '#8a6446';
const LINE = '#3b2a1e';

const leg = (x, phase, far) => `
  <g class="leg leg-${phase}">
    <rect x="${x}" y="31" width="4.2" height="18" rx="2" fill="${far ? FUR_FAR : FUR}" stroke="${LINE}" stroke-width="1.2"/>
    <rect x="${x - 0.4}" y="47.5" width="5" height="4" rx="1.4" fill="${LINE}"/>
  </g>`;

const SVG = `
<svg class="ibex" viewBox="0 0 64 58" width="60" height="54" aria-hidden="true">
  <ellipse class="ibex-shadow" cx="31" cy="54" rx="19" ry="3.2"/>
  <g class="ibex-body">
    ${leg(18, 'a', true)}
    ${leg(40, 'b', true)}
    <path d="M15.5 25.5 q-4.5 -2 -4.8 2.6" stroke="${LINE}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M14 29 C14 21, 23 19, 31 19.5 C39 20, 45.5 20.5, 47 25.5 C48.5 32, 42 36, 32 36 C22 36, 14 35, 14 29 Z"
      fill="${FUR}" stroke="${LINE}" stroke-width="1.6"/>
    <path d="M20 32.5 C26 35, 37 35, 42.5 31.5" stroke="#ead2ac" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M40 22.5 C42.5 16.5, 45.5 12.5, 48.5 11.5 L53 16.5 C50 19.5, 47.5 24.5, 45.5 27.5 Z"
      fill="${FUR}" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M48.5 10.5 C46 2.5, 38 0, 30.5 4" stroke="${LINE}" stroke-width="5.6" fill="none" stroke-linecap="round"/>
    <path d="M48.5 10.5 C46 2.5, 38 0, 30.5 4" stroke="#9c8263" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="1.5 1.7"/>
    <path d="M46.5 9.5 C51 7.5, 56 9.5, 59 13.5 C60 15.5, 58.5 17.5, 55.5 17.5 C52 17.5, 49 16.5, 46.5 14.5 Z"
      fill="#c99b6e" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>
    <ellipse cx="46.5" cy="12" rx="3" ry="1.5" transform="rotate(-25 46.5 12)" fill="${FUR}" stroke="${LINE}" stroke-width="1.1"/>
    <circle cx="52.6" cy="12.2" r="1.25" fill="#1a120c"/>
    <path d="M55.5 17.3 L54.6 21.8 L53 17.6 Z" fill="${LINE}"/>
    ${leg(22, 'b', false)}
    ${leg(37, 'a', false)}
  </g>
</svg>`;

export function createIbex() {
  const el = document.createElement('div');
  el.className = 'player';
  el.innerHTML = `<div class="player-ring"></div>${SVG}`;
  return el;
}
