export const hud = {
    homeSheetOpen: false,
    _snapState: 'peek',

    init(app) {
        this.app = app;
        this.initCompass();
        this._initHomeSheet();
    },

    async initCompass() {
        if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
            try {
                if (await DeviceOrientationEvent.requestPermission() === "granted") {
                    window.addEventListener("deviceorientation", this.handleOrientation.bind(this));
                }
            } catch (e) {}
        } else if ("ondeviceorientation" in window) {
            window.addEventListener("deviceorientation", this.handleOrientation.bind(this));
        }
    },

    handleOrientation(e) {
        const alpha = e.webkitCompassHeading || e.alpha;
        if (alpha) {
            const needle = document.getElementById("compass-needle");
            if (needle) needle.style.transform = "rotate(" + alpha + "deg)";
        }
    },

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
        if (this.app.haptics) this.app.haptics.vibrate();
    },

    renderHUDStats() {
        const s = this.app.state;
        const lv = this.app.data.calcLevel(s.discoveryPoints);
        const season = this.app.data.currentSeason();
        const el = document.getElementById("hud-stats-bar");
        if (el) {
            el.innerHTML =
                '<span class="hud-stat">' + season.icon + " " + season.name + "</span>" +
                '<span class="hud-stat text-brand">' + String.fromCodePoint(0x1F30D) + " Lv." + lv.level + "</span>" +
                '<span class="hud-stat">' + String.fromCodePoint(0x1F525) + " " + s.streak + "</span>";
        }
        const avEl = document.getElementById("hud-avatar");
        if (avEl) avEl.textContent = s.avatar;
    },

    // Public: snap to peek from anywhere (call on selection/nav)
    peekHomeSheet() {
        this._snapTo('peek');
    },

    _initHomeSheet() {
        const sheet   = document.getElementById("home-sheet");
        const handle  = document.getElementById("home-sheet-handle");
        const content = document.getElementById("home-sheet-content");
        if (!sheet || !handle) return;

        // ── Snap points ─────────────────────────────────────────────
        const STATES = ['peek', 'mid', 'full'];
        const SNAPS = {
            peek: () => window.innerHeight - 148,
            mid:  () => window.innerHeight - 340,
            full: () => Math.max(72, window.innerHeight - 560),
        };

        // ── Content scroll: only allowed at full ────────────────────
        const updateScroll = (state) => {
            if (!content) return;
            content.style.overflowY = state === 'full' ? 'auto' : 'hidden';
        };

        // ── Snap animation ──────────────────────────────────────────
        this._snapTo = (state, fast = false) => {
            this._snapState = state;
            this.homeSheetOpen = state !== 'peek';
            const dur = fast ? '0.22s' : '0.38s';
            const ease = fast
                ? 'cubic-bezier(0.22,1,0.36,1)'          // fast: smooth decelerate
                : 'cubic-bezier(0.34,1.38,0.64,1)';      // normal: slight spring
            sheet.style.transition = `top ${dur} ${ease}`;
            sheet.style.top = SNAPS[state]() + 'px';
            updateScroll(state);
            // Update handle bar width as visual cue
            const bar = document.getElementById("home-sheet-handle-bar");
            if (bar) bar.style.width = state === 'peek' ? '44px' : state === 'mid' ? '36px' : '28px';
        };

        // ── Velocity tracking ───────────────────────────────────────
        let history = [];  // [{y, t}]
        const trackPoint = (y) => {
            const now = Date.now();
            history.push({ y, t: now });
            if (history.length > 6) history.shift();
        };
        const getVelocity = () => {
            // px/ms over last ~80ms window
            const cutoff = Date.now() - 80;
            const recent = history.filter(p => p.t >= cutoff);
            if (recent.length < 2) return 0;
            const first = recent[0], last = recent[recent.length - 1];
            const dt = last.t - first.t;
            return dt > 0 ? (last.y - first.y) / dt : 0;
        };

        // ── Snap decision on release ─────────────────────────────────
        let startY = 0, startTop = 0, active = false, startState = 'peek';
        const getTop = () => parseFloat(sheet.style.top) || SNAPS.peek();

        const snapOnRelease = () => {
            const vel = getVelocity();     // positive = downward (closing)
            const idx = STATES.indexOf(startState);
            const FAST = 0.45;             // px/ms threshold

            if (vel < -FAST) {
                // Flick up: advance one step
                this._snapTo(STATES[Math.min(idx + 1, STATES.length - 1)], true);
            } else if (vel > FAST) {
                // Flick down: retreat one step
                this._snapTo(STATES[Math.max(idx - 1, 0)], true);
            } else {
                // Slow drag: nearest snap point by position
                const top = getTop();
                const nearest = STATES.reduce((best, s) =>
                    Math.abs(SNAPS[s]() - top) < Math.abs(SNAPS[best]() - top) ? s : best
                , STATES[0]);
                this._snapTo(nearest);
            }
        };

        // ── Drag callbacks ──────────────────────────────────────────
        const begin = (y) => {
            startY = y; startTop = getTop();
            startState = this._snapState;
            active = true;
            history = [{ y, t: Date.now() }];
            sheet.style.transition = 'none';
        };
        const move = (y) => {
            if (!active) return;
            trackPoint(y);
            const clamped = Math.max(SNAPS.full(), Math.min(SNAPS.peek(), startTop + (y - startY)));
            sheet.style.top = clamped + 'px';
        };
        const end = () => {
            if (!active) return;
            active = false;
            snapOnRelease();
        };

        // ── Touch on handle ─────────────────────────────────────────
        handle.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            begin(e.touches[0].clientY);
        }, { passive: true });

        // ── Touch on content only when at top + open (drag to close) ─
        if (content) {
            content.addEventListener('touchstart', (e) => {
                if (this._snapState !== 'peek' && content.scrollTop === 0) {
                    begin(e.touches[0].clientY);
                }
            }, { passive: true });
        }

        // ── Document-level move/end (keeps drag alive off-element) ──
        document.addEventListener('touchmove', (e) => {
            if (!active) return;
            e.preventDefault();
            move(e.touches[0].clientY);
        }, { passive: false });

        document.addEventListener('touchend',    end, { passive: true });
        document.addEventListener('touchcancel', end, { passive: true });

        // ── Pointer (mouse/stylus — desktop testing) ─────────────────
        handle.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') return;
            handle.setPointerCapture(e.pointerId);
            begin(e.clientY);
        });
        handle.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') move(e.clientY); });
        handle.addEventListener('pointerup',   () => { end(); });

        // ── Reposition on viewport change (fullscreen, rotation) ────
        const reposition = () => {
            sheet.style.transition = 'none';
            sheet.style.top = SNAPS[this._snapState]() + 'px';
        };
        window.addEventListener('resize', reposition);
        document.addEventListener('fullscreenchange', reposition);

        sheet.style.top = SNAPS.peek() + 'px';
        updateScroll('peek');
    },

    async refreshHomeSheet() {
        const el = document.getElementById("home-sheet-content");
        if (!el) return;
        const s = this.app.state;
        const today = new Date().toDateString();
        const todayObs = (s.observations || []).filter(o => new Date(o.date).toDateString() === today).length;
        const sppCount = Object.keys(s.catalogue || {}).length;
        const season = this.app.data.currentSeason();

        let spotlight = [];
        if (this.app.map && this.app.map.pos.lat) {
            spotlight = await this.app.inat.spotlight(this.app.map.pos.lat, this.app.map.pos.lng);
        } else {
            spotlight = (this.app.localSpecies || []).slice(0, 6);
        }

        el.innerHTML =
            '<div class="hs-today-row">' +
                '<div class="hs-today-stat"><span class="hs-today-num">' + todayObs + '</span><span class="hs-today-label">Today</span></div>' +
                '<div class="hs-divider"></div>' +
                '<div class="hs-today-stat"><span class="hs-today-num">' + sppCount + '</span><span class="hs-today-label">Species</span></div>' +
                '<div class="hs-divider"></div>' +
                '<div class="hs-today-stat"><span class="hs-today-num streak">' + String.fromCodePoint(0x1F525) + s.streak + '</span><span class="hs-today-label">Streak</span></div>' +
            '</div>' +
            '<div class="hs-section-title">' + season.icon + ' In Your Area · ' + season.name + '</div>' +
            '<div class="hs-species-row">' +
                spotlight.slice(0, 6).map(function(sp) {
                    return '<button onclick="app.hud.peekHomeSheet(); app.ui.openSpeciesDetail(' + sp.id + ')" class="hs-species-card">' +
                        '<img src="' + (sp.squareImg || sp.img || '') + '" class="hs-species-img" loading="lazy">' +
                        '<div class="hs-species-name">' + sp.name + '</div>' +
                        '<div class="hs-species-rarity ' + (sp.rarity === 'Common' ? 'rarity-common' : sp.rarity === 'Uncommon' ? 'rarity-uncommon' : 'rarity-rare') + '">' + sp.rarity + '</div>' +
                    '</button>';
                }).join('') +
            '</div>' +
            '<button onclick="app.hud.peekHomeSheet(); app.ui.openPanel(\'panel-discover\')" class="hs-discover-btn">' +
                '<span class="material-symbols-rounded">explore</span> Explore Nearby' +
            '</button>';
    }
};
