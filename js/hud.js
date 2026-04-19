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
        let pendingStart = null; // deferred begin pending direction detection
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
            pendingStart = null;
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
                    pendingStart = { y: e.touches[0].clientY, x: e.touches[0].clientX };
                }
            }, { passive: true });
        }

        // ── Document-level move/end (keeps drag alive off-element) ──
        document.addEventListener('touchmove', (e) => {
            // Resolve pending content drag — only start if movement is primarily vertical
            if (pendingStart) {
                const dy = Math.abs(e.touches[0].clientY - pendingStart.y);
                const dx = Math.abs(e.touches[0].clientX - pendingStart.x);
                if (dy > dx && dy > 4) begin(pendingStart.y);
                pendingStart = null;
            }
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
            spotlight = (this.app.localSpecies || []).slice(0, 8);
        }

        // ── Next badge to unlock ──────────────────────────────────
        const earnedSet = new Set(s.badges || []);
        const nextBadge = this.app.data.BADGES.find(b => !earnedSet.has(b.id));
        let achievementHtml = '';
        if (nextBadge) {
            // Compute progress for this badge
            const prog = this._badgeProgress(nextBadge, s);
            const pct = Math.min(100, Math.round(prog.curr / prog.max * 100));
            achievementHtml =
                '<div class="hs-section-title">🏅 Next Achievement</div>' +
                '<button onclick="app.hud.peekHomeSheet(); app.ui.openPanel(\'panel-profile\')" class="hs-achievement-card">' +
                    '<div class="hs-achievement-icon">' + nextBadge.icon + '</div>' +
                    '<div class="hs-achievement-body">' +
                        '<div class="hs-achievement-name">' + nextBadge.name + '</div>' +
                        '<div class="hs-achievement-desc">' + nextBadge.desc + '</div>' +
                        '<div class="hs-achievement-bar-wrap">' +
                            '<div class="hs-achievement-bar" style="width:' + pct + '%"></div>' +
                        '</div>' +
                        '<div class="hs-achievement-pct">' + prog.curr + ' / ' + prog.max + '</div>' +
                    '</div>' +
                '</button>';
        }

        // ── Recently earned badge ─────────────────────────────────
        let recentBadgeHtml = '';
        if ((s.badges || []).length > 0) {
            const lastId = s.badges[s.badges.length - 1];
            const lastBadge = this.app.data.BADGES.find(b => b.id === lastId);
            if (lastBadge) {
                recentBadgeHtml =
                    '<div class="hs-recent-badge">' +
                        '<span class="hs-recent-badge-icon">' + lastBadge.icon + '</span>' +
                        '<span class="hs-recent-badge-text">Recently earned: <strong>' + lastBadge.name + '</strong></span>' +
                        '<button onclick="app.hud.peekHomeSheet(); app.ui.openPanel(\'panel-profile\')" class="hs-recent-badge-btn">View</button>' +
                    '</div>';
            }
        }

        // ── Recent nearby sightings ───────────────────────────────
        const recentObs = (this.app._preloadedObs || []).slice(0, 6);
        let nearbySightingsHtml = '';
        if (recentObs.length > 0) {
            const cards = recentObs.map(obs => {
                const name = obs.taxon?.preferred_common_name || obs.taxon?.name || 'Unknown';
                const taxonId = obs.taxon?.id;
                const imgUrl = obs.taxon?.default_photo?.square_url
                    || (obs.photos?.[0]?.url ? obs.photos[0].url.replace('square', 'square') : '');
                const emoji = app.inat.iconicEmoji(obs.taxon?.iconic_taxon_name);
                const when = obs.observed_on ? this._relativeDate(obs.observed_on) : '';
                const imgEl = imgUrl
                    ? '<img src="' + imgUrl + '" class="hs-nearby-img" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
                      '<div class="hs-nearby-emoji" style="display:none">' + emoji + '</div>'
                    : '<div class="hs-nearby-emoji">' + emoji + '</div>';
                return '<button onclick="app.hud.peekHomeSheet(); app.ui.openSpeciesDetail(' + taxonId + ')" class="hs-nearby-card">' +
                    '<div class="hs-nearby-img-wrap">' + imgEl + '</div>' +
                    '<div class="hs-nearby-name">' + name + '</div>' +
                    '<div class="hs-nearby-when">' + when + '</div>' +
                '</button>';
            }).join('');
            nearbySightingsHtml =
                '<div class="hs-section-title">📍 Spotted Nearby</div>' +
                '<div class="hs-species-row">' + cards + '</div>';
        }

        el.innerHTML =
            '<div class="hs-today-row">' +
                '<div class="hs-today-stat"><span class="hs-today-num">' + todayObs + '</span><span class="hs-today-label">Today</span></div>' +
                '<div class="hs-divider"></div>' +
                '<div class="hs-today-stat"><span class="hs-today-num">' + sppCount + '</span><span class="hs-today-label">Species</span></div>' +
                '<div class="hs-divider"></div>' +
                '<div class="hs-today-stat"><span class="hs-today-num streak">' + String.fromCodePoint(0x1F525) + s.streak + '</span><span class="hs-today-label">Streak</span></div>' +
            '</div>' +
            recentBadgeHtml +
            nearbySightingsHtml +
            '<div class="hs-section-title">' + season.icon + ' In Your Area · ' + season.name + '</div>' +
            '<div class="hs-species-row">' +
                spotlight.slice(0, 8).map(function(sp) {
                    const emoji = app.inat.iconicEmoji(sp.iconic);
                    const imgEl = (sp.squareImg || sp.img)
                        ? '<img src="' + (sp.squareImg || sp.img) + '" class="hs-species-img" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
                          '<div class="hs-species-emoji" style="display:none">' + emoji + '</div>'
                        : '<div class="hs-species-emoji">' + emoji + '</div>';
                    return '<button onclick="app.hud.peekHomeSheet(); app.ui.openSpeciesDetail(' + sp.id + ')" class="hs-species-card">' +
                        '<div class="hs-species-img-wrap">' + imgEl + '</div>' +
                        '<div class="hs-species-name">' + sp.name + '</div>' +
                        '<div class="hs-species-rarity ' + (sp.rarity === 'Common' ? 'rarity-common' : sp.rarity === 'Uncommon' ? 'rarity-uncommon' : 'rarity-rare') + '">' + sp.rarity + '</div>' +
                    '</button>';
                }).join('') +
            '</div>' +
            achievementHtml +
            '<button onclick="app.hud.peekHomeSheet(); app.ui.openPanel(\'panel-discover\')" class="hs-discover-btn">' +
                '<span class="material-symbols-rounded">explore</span> Explore Nearby' +
            '</button>';
    },

    // Returns a { curr, max } progress estimate for a badge
    _badgeProgress(badge, s) {
        const id = badge.id;
        const obs = s.observations || [];
        const cat = s.catalogue || {};
        const catVals = Object.values(cat);
        if (id === 'first_obs')     return { curr: obs.length,  max: 1 };
        if (id === 'obs_5')         return { curr: obs.length,  max: 5 };
        if (id === 'obs_25')        return { curr: obs.length,  max: 25 };
        if (id === 'obs_100')       return { curr: obs.length,  max: 100 };
        if (id === 'spp_10')        return { curr: Object.keys(cat).length, max: 10 };
        if (id === 'spp_50')        return { curr: Object.keys(cat).length, max: 50 };
        if (id === 'streak_3')      return { curr: s.streak,    max: 3 };
        if (id === 'streak_7')      return { curr: s.streak,    max: 7 };
        if (id === 'streak_30')     return { curr: s.streak,    max: 30 };
        if (id === 'bird_10')       return { curr: catVals.filter(c => c.iconic === 'Aves').length,     max: 10 };
        if (id === 'plant_10')      return { curr: catVals.filter(c => c.iconic === 'Plantae').length,  max: 10 };
        if (id === 'insect_10')     return { curr: catVals.filter(c => c.iconic === 'Insecta').length,  max: 10 };
        if (id === 'mammal_5')      return { curr: catVals.filter(c => c.iconic === 'Mammalia').length, max: 5 };
        if (id === 'all_taxa')      return { curr: new Set(catVals.map(c => c.iconic)).size,            max: 6 };
        if (id === 'first_audio_id') return { curr: s._usedAudioId ? 1 : 0, max: 1 };
        if (id === 'first_key_out') return { curr: s._usedKeyOut  ? 1 : 0, max: 1 };
        return { curr: 0, max: 1 };
    },

    // Human-readable relative date ("2h ago", "3d ago")
    _relativeDate(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const h = Math.floor(diff / 3600000);
        if (h < 1)  return 'Just now';
        if (h < 24) return h + 'h ago';
        const d = Math.floor(h / 24);
        if (d < 7)  return d + 'd ago';
        return Math.floor(d / 7) + 'w ago';
    }
};
