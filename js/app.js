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
    },

    saveState() {
        localStorage.setItem('EDE_State_V4', JSON.stringify(this.state));
    }
};

window.app = app;
window.onload = () => app.init();
export default app;
