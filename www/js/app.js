import { haptics } from './haptics.js';
import { hud } from './hud.js';
import { multiplayer } from './multiplayer.js';
import { ui } from './ui.js';
import { game } from './game.js';
import { data } from './data.js';
import { map } from './map.js';

const app = {
    state: {},
    localSpecies: [],
    haptics,
    hud,
    multiplayer,
    ui,
    game,
    data,
    map,

    async init() {
        const stored = localStorage.getItem('NQ_State_FINAL_V2');
        this.state = stored ? JSON.parse(stored) : this.data.defaultState();
        
        // Initialize modules
        this.hud.init(this);
        this.ui.init(this);
        this.game.init(this);
        this.map.init(this);
        this.multiplayer.init(this);

        // Global search listeners
        ['fieldguide-search', 'inventory-search', 'species-selector-search'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    const panel = id.split('-')[0];
                    if (panel === 'fieldguide') this.ui.renderFieldGuide(true);
                    else if (panel === 'inventory') this.ui.renderInventory();
                    else this.ui.renderGrid('species-selector-body', this.localSpecies, 'species-selector-search', 'species-selector-tabs', true);
                });
            }
        });

        this.ui.renderProfile();
        this.ui.openPanel('map');
    },

    saveState() {
        localStorage.setItem('NQ_State_FINAL_V2', JSON.stringify(this.state));
    }
};

// Expose app to window for inline onclick handlers (to maintain compatibility with current HTML)
window.app = app;

window.onload = () => app.init();

export default app;
