import { haptics } from './haptics.js?v=20260419f';
import { hud } from './hud.js?v=20260419f';
import { ui } from './ui.js?v=20260419f';
import { data } from './data.js?v=20260419f';
import { map } from './map.js?v=20260419f';
import { inat } from './inat.js?v=20260419f';
import { identify } from './identify.js?v=20260419f';
import { journal } from './journal.js?v=20260419f';

const app = {
    state: {},
    localSpecies: [],
    haptics, hud, ui, data, map, inat, identify, journal,

    async init() {
        const startedAt = Date.now();

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

        setProgress(100, 'Ready to explore! 🌍');

        // ── 8. Show launch button — user taps to enter ──────────────
        const btn = document.getElementById('loading-launch-btn');
        if (btn) {
            btn.classList.remove('hidden');
            // Small delay so progress bar finishing is visible first
            setTimeout(() => btn.classList.add('launch-ready'), 80);
        }
        // _launchFromSplash() is called by the button onclick
    },

    _launchFromSplash() {
        const ls = document.getElementById('loading-screen');
        if (ls) {
            ls.classList.add('loading-out');
            ls.addEventListener('animationend', () => {
                ls.remove();
                // Handle PWA shortcut deep links (?panel=identify etc.)
                const params = new URLSearchParams(window.location.search);
                const panel  = params.get('panel');
                if (panel && this.ui) this.ui.openPanel(`panel-${panel}`);
            }, { once: true });
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
        '"The clearest way into the Universe is through a forest wilderness." — John Muir',
        '"Those who contemplate the beauty of the earth find reserves of strength." — Rachel Carson',
        '"In wildness is the preservation of the world." — Henry David Thoreau',
        '"Nature is not a place to visit. It is home." — Gary Snyder',
        '"I go to nature to be soothed and healed, and to have my senses put in order." — John Burroughs',
        '"To walk in nature is to witness a thousand miracles." — Mary Davis',
        '"The poetry of the earth is never dead." — John Keats',
        '"If you truly love nature, you will find beauty everywhere." — Vincent van Gogh',
        '"Forget not that the earth delights to feel your bare feet." — Kahlil Gibran',
        '"Look deep into nature, and you will understand everything better." — Einstein',
        '"Birds are indicators of the environment." — Roger Tory Peterson',
        '"The butterfly counts not months but moments, and has time enough." — Tagore',
        '"Knowing trees, I understand the meaning of patience." — Hal Borland',
        '"A weed is no more than a flower in disguise." — James Russell Lowell',
        '"Come forth into the light of things, let Nature be your teacher." — William Wordsworth',
        '"The world is mud-luscious and puddle-wonderful." — e.e. cummings',
        '"Keep close to Nature\'s heart. Break clear away once in a while." — John Muir',
        '"Wilderness is not a luxury but a necessity of the human spirit." — Edward Abbey',
        '"We don\'t inherit the earth from our ancestors — we borrow it from our children."',
        '"An early-morning walk is a blessing for the whole day." — Thoreau',
        '"The butterfly does not look back upon its caterpillar self." — Anonymous',
        '"Every flower is a soul blossoming in nature." — Gérard de Nerval',
    ];

    // Fisher-Yates shuffle for true randomness each session
    const shuffled = [...flavors].sort(() => Math.random() - 0.5);
    let i = 0;

    const flavorEl = document.getElementById('loading-flavor');
    if (flavorEl) {
        flavorEl.textContent = shuffled[0];
        const iv = setInterval(() => {
            i = (i + 1) % shuffled.length;
            flavorEl.style.opacity = '0';
            setTimeout(() => { flavorEl.textContent = shuffled[i]; flavorEl.style.opacity = '1'; }, 300);
        }, 3600);
        const obs = new MutationObserver(() => {
            if (!document.getElementById('loading-screen')) { clearInterval(iv); obs.disconnect(); }
        });
        obs.observe(document.body, { childList: true });
    }

    // ── Register Service Worker ────────────────────────────────────
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/GoOutside/sw.js', { scope: '/GoOutside/' })
            .then((reg) => {
                // When a new SW is waiting, activate it on next navigation
                reg.addEventListener('updatefound', () => {
                    const newSW = reg.installing;
                    if (!newSW) return;
                    newSW.addEventListener('statechange', () => {
                        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                            // New version available — could show a toast here
                            console.log('[SW] Update available — will activate on next load.');
                        }
                    });
                });
            })
            .catch((err) => console.warn('[SW] Registration failed:', err));
    }

    app.init();
};
export default app;
