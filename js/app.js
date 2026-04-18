import { haptics } from './haptics.js';
import { hud } from './hud.js';
import { ui } from './ui.js';
import { data } from './data.js';
import { map } from './map.js';
import { inat } from './inat.js';
import { identify } from './identify.js';
import { journal } from './journal.js';

const app = {
    state: {},
    localSpecies: [],
    haptics, hud, ui, data, map, inat, identify, journal,

    async init() {
        const raw = JSON.parse(localStorage.getItem('EDE_State_V4') || 'null')
            || JSON.parse(localStorage.getItem('NQ_State_FINAL_V3') || 'null')
            || null;
        this.state = this.data.normalizeState(raw || {});

        this.hud.init(this);
        this.ui.init(this);
        this.map.init(this);
        this.identify.init(this);
        this.journal.init(this);

        // Search listeners
        document.getElementById('journal-search')?.addEventListener('input', () => {
            this.journal._renderTimeline();
        });
        document.getElementById('species-selector-search')?.addEventListener('input', () => {
            this.ui._renderSpeciesSelectorBody();
        });

        this.ui.renderHUDStats();
        this.ui.openPanel('map');

        // Dismiss loading screen
        const ls = document.getElementById('loading-screen');
        if (ls) {
            ls.classList.add('loading-out');
            ls.addEventListener('animationend', () => ls.remove(), { once: true });
        }
    },

    saveState() {
        localStorage.setItem('EDE_State_V4', JSON.stringify(this.state));
    }
};

window.app = app;
window.onload = () => {
    // Rotate flavor text while loading
    const flavors = [
        '"In every walk with nature, one receives far more than he seeks." — John Muir',
        '"Look deep into nature, and then you will understand everything better." — Einstein',
        '"The earth has music for those who listen." — Shakespeare',
        '"Not all those who wander are lost — some are just birdwatching."',
        '"Adopt the pace of nature: her secret is patience." — Emerson',
        '"What is the use of a house if you haven\'t got a tolerable planet to put it on?" — Thoreau',
        '"One touch of nature makes the whole world kin." — Shakespeare',
        '"Study nature, love nature, stay close to nature. It will never fail you." — F.L. Wright',
    ];
    const el = document.getElementById('loading-flavor');
    if (el) {
        let i = 0;
        el.textContent = flavors[0];
        const iv = setInterval(() => {
            i = (i + 1) % flavors.length;
            el.style.opacity = 0;
            setTimeout(() => { el.textContent = flavors[i]; el.style.opacity = 1; }, 300);
        }, 2800);
        // Clean up interval once loading screen is removed
        const obs = new MutationObserver(() => { if (!document.getElementById('loading-screen')) { clearInterval(iv); obs.disconnect(); } });
        obs.observe(document.body, { childList: true });
    }
    app.init();
};
export default app;
