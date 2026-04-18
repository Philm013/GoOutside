export const hud = {
    homeSheetOpen: false,
    homeSheetDragging: false,

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
        // Update avatar
        const avEl = document.getElementById("hud-avatar");
        if (avEl) avEl.textContent = s.avatar;
    },

    _initHomeSheet() {
        const sheet = document.getElementById("home-sheet");
        const handle = document.getElementById("home-sheet-handle");
        const content = document.getElementById("home-sheet-content");
        if (!sheet || !handle) return;

        const peek = () => window.innerHeight - 160;
        const open = () => Math.max(80, window.innerHeight - 520);

        let startY = 0, startTop = 0, active = false;

        const getTop  = () => parseFloat(sheet.style.top) || peek();
        const setTop  = (v) => { sheet.style.top = Math.max(open(), Math.min(peek(), v)) + "px"; };
        const snapTo  = (toOpen) => {
            sheet.style.transition = "top 0.35s cubic-bezier(0.4,0,0.2,1)";
            sheet.style.top = (toOpen ? open() : peek()) + "px";
            this.homeSheetOpen = toOpen;
        };
        const begin   = (y) => { startY = y; startTop = getTop(); active = true; sheet.style.transition = "none"; };
        const move    = (y) => { if (active) setTop(startTop + (y - startY)); };
        const end     = () => { if (!active) return; active = false; snapTo(getTop() < (peek() + open()) / 2); };

        // Touch on handle — use document listeners so capture isn't lost
        handle.addEventListener("touchstart", (e) => {
            e.stopPropagation();
            begin(e.touches[0].clientY);
        }, { passive: true });

        // Touch on content when scrolled to top (drag-down to peek)
        content.addEventListener("touchstart", (e) => {
            if (content.scrollTop === 0 && this.homeSheetOpen) {
                begin(e.touches[0].clientY);
            }
        }, { passive: true });

        document.addEventListener("touchmove", (e) => {
            if (!active) return;
            e.preventDefault();
            move(e.touches[0].clientY);
        }, { passive: false });

        document.addEventListener("touchend",    end, { passive: true });
        document.addEventListener("touchcancel", end, { passive: true });

        // Pointer (mouse/stylus for desktop testing)
        handle.addEventListener("pointerdown", (e) => {
            if (e.pointerType === "touch") return; // handled above
            handle.setPointerCapture(e.pointerId);
            begin(e.clientY);
        });
        handle.addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") move(e.clientY); });
        handle.addEventListener("pointerup",   (e) => { if (e.pointerType !== "touch") end(); });

        // Reposition on resize/fullscreen change
        const reposition = () => {
            sheet.style.transition = "none";
            sheet.style.top = (this.homeSheetOpen ? open() : peek()) + "px";
        };
        window.addEventListener("resize", reposition);
        document.addEventListener("fullscreenchange", reposition);

        sheet.style.top = peek() + "px";
    },

    async refreshHomeSheet() {
        const el = document.getElementById("home-sheet-content");
        const s = this.app.state;
        const today = new Date().toDateString();
        const todayObs = (s.observations || []).filter(o => new Date(o.date).toDateString() === today).length;
        const sppCount = Object.keys(s.catalogue || {}).length;
        const season = this.app.data.currentSeason();

        // Get spotlight species
        let spotlight = [];
        if (this.app.map.pos.lat) {
            spotlight = await this.app.inat.spotlight(this.app.map.pos.lat, this.app.map.pos.lng);
        } else {
            spotlight = (this.app.localSpecies || []).slice(0, 4);
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
                spotlight.slice(0, 4).map(function(sp) {
                    return '<button onclick="app.ui.openSpeciesDetail(' + sp.id + ')" class="hs-species-card">' +
                        '<img src="' + (sp.squareImg || sp.img) + '" class="hs-species-img">' +
                        '<div class="hs-species-name">' + sp.name + '</div>' +
                        '<div class="hs-species-rarity ' + (sp.rarity === 'Common' ? 'rarity-common' : sp.rarity === 'Uncommon' ? 'rarity-uncommon' : 'rarity-rare') + '">' + sp.rarity + '</div>' +
                    '</button>';
                }).join('') +
            '</div>' +
            '<button onclick="app.ui.openPanel(\'panel-discover\')" class="hs-discover-btn">' +
                '<span class="material-symbols-rounded">explore</span> Explore More' +
            '</button>';
    }
};
