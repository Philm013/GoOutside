import { haptics } from './haptics.js?v=20260418d';
import { hud } from './hud.js?v=20260418d';
import { ui } from './ui.js?v=20260418d';
import { data } from './data.js?v=20260418d';
import { map } from './map.js?v=20260418d';
import { inat } from './inat.js?v=20260418d';
import { identify } from './identify.js?v=20260418d';
import { journal } from './journal.js?v=20260418d';

const app = {
    state: {},
    localSpecies: [],
    haptics, hud, ui, data, map, inat, identify, journal,

    async init() {
        const startedAt = Date.now();
        const MIN_SPLASH_MS = 3200; // always show splash for at least this long

        // ── Progress bar helpers ────────────────────────────────────
        const progressBar = document.getElementById('loading-progress-bar');
        const statusEl    = document.getElementById('loading-status');
        let _pct = 0;
        const setProgress = (pct, label) => {
            _pct = pct;
            if (progressBar) progressBar.style.width = pct + '%';
            if (statusEl) statusEl.textContent = label;
        };

        // ── 1. Load saved state ─────────────────────────────────────
        setProgress(10, 'Restoring your field notes…');
        const raw = JSON.parse(localStorage.getItem('EDE_State_V4') || 'null')
            || JSON.parse(localStorage.getItem('NQ_State_FINAL_V3') || 'null')
            || null;
        this.state = this.data.normalizeState(raw || {});

        // ── 2. Boot UI modules ──────────────────────────────────────
        setProgress(20, 'Setting up your field guide…');
        this.hud.init(this);
        this.ui.init(this);
        this.map.init(this);
        this.identify.init(this);
        this.journal.init(this);

        document.getElementById('journal-search')?.addEventListener('input', () => {
            this.journal._renderTimeline();
        });
        document.getElementById('species-selector-search')?.addEventListener('input', () => {
            this.ui._renderSpeciesSelectorBody();
        });

        // ── 3. Get location ─────────────────────────────────────────
        setProgress(35, 'Finding your location…');
        const pos = await this._getLocation();

        // ── 4. Preload iNaturalist data in parallel ─────────────────
        setProgress(50, 'Loading what\'s in season near you…');
        if (pos) {
            const { lat, lng } = pos;
            // Prime the map marker immediately so user appears without waiting for watchPosition
            this.map._onPosition(lat, lng);
            const [seasonal, nearby] = await Promise.allSettled([
                this.inat.seasonalSpecies(lat, lng, { limit: 200 }),
                this.inat.nearbyObservations(lat, lng, { limit: 50, days: 14 }),
            ]);
            if (seasonal.status === 'fulfilled' && seasonal.value.length) {
                this.localSpecies = seasonal.value;
                setProgress(75, 'Found ' + seasonal.value.length + ' species nearby…');
            } else {
                setProgress(75, 'Checking local wildlife…');
            }
            // Pre-populate map community layer
            if (nearby.status === 'fulfilled' && nearby.value.length) {
                this._preloadedObs = nearby.value;
            }
        } else {
            setProgress(75, 'Location unavailable — using global data…');
        }

        // ── 5. Warm the home sheet ──────────────────────────────────
        setProgress(88, 'Preparing your nature journal…');
        await this.hud.refreshHomeSheet();

        // ── 6. Render UI ────────────────────────────────────────────
        setProgress(96, 'Almost ready…');
        this.ui.renderHUDStats();
        this.ui.openPanel('map');

        // ── 7. Apply pre-loaded observations to map if available ────
        if (this._preloadedObs && this.map._addCommunityPin) {
            this._preloadedObs.forEach(o => this.map._addCommunityPin(o));
        }

        setProgress(100, 'Welcome to Earth Day Everyday 🌍');

        // ── 8. Dismiss — wait for minimum splash time ───────────────
        const elapsed = Date.now() - startedAt;
        const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
        await new Promise(r => setTimeout(r, wait));

        const ls = document.getElementById('loading-screen');
        if (ls) {
            ls.classList.add('loading-out');
            ls.addEventListener('animationend', () => ls.remove(), { once: true });
        }
    },

    // Request geolocation with a 6s timeout; resolves null on error/timeout
    _getLocation() {
        return new Promise(resolve => {
            if (!navigator.geolocation) return resolve(null);
            const timer = setTimeout(() => resolve(null), 6000);
            navigator.geolocation.getCurrentPosition(
                (p) => { clearTimeout(timer); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
                ()  => { clearTimeout(timer); resolve(null); },
                { enableHighAccuracy: true, timeout: 6000 }
            );
        });
    },

    saveState() {
        localStorage.setItem('EDE_State_V4', JSON.stringify(this.state));
    }
};

window.app = app;
window.onload = () => {
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
    const flavorEl = document.getElementById('loading-flavor');
    if (flavorEl) {
        let i = 0;
        flavorEl.textContent = flavors[0];
        const iv = setInterval(() => {
            i = (i + 1) % flavors.length;
            flavorEl.style.opacity = '0';
            setTimeout(() => { flavorEl.textContent = flavors[i]; flavorEl.style.opacity = '1'; }, 300);
        }, 3200);
        const obs = new MutationObserver(() => {
            if (!document.getElementById('loading-screen')) { clearInterval(iv); obs.disconnect(); }
        });
        obs.observe(document.body, { childList: true });
    }
    app.init();
};
export default app;
