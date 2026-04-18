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
                "<span class="hud-stat">" + season.icon + " " + season.name + "</span>" +
                "<span class="hud-stat text-brand">" + String.fromCodePoint(0x1F30D) + " Lv." + lv.level + "</span>" +
                "<span class="hud-stat">" + String.fromCodePoint(0x1F525) + " " + s.streak + "</span>";
        }
        // Update avatar
        const avEl = document.getElementById("hud-avatar");
        if (avEl) avEl.textContent = s.avatar;
    },

    _initHomeSheet() {
        const sheet = document.getElementById("home-sheet");
        const handle = document.getElementById("home-sheet-handle");

        let startY = 0, startTop = 0;
        const PEEK = window.innerHeight - 160;
        const OPEN = window.innerHeight - 460;

        const getTop = () => parseInt(sheet.style.top) || PEEK;

        handle.addEventListener("pointerdown", (e) => {
            startY = e.clientY;
            startTop = getTop();
            this.homeSheetDragging = true;
            sheet.style.transition = "none";
            handle.setPointerCapture(e.pointerId);
        });

        handle.addEventListener("pointermove", (e) => {
            const dy = e.clientY - startY;
            const newTop = Math.max(OPEN, Math.min(PEEK, startTop + dy));
            sheet.style.top = newTop + "px";
        });

        handle.addEventListener("pointerup", () => {
            this.homeSheetDragging = false;
            sheet.style.transition = "";
            const top = getTop();
            const mid = (PEEK + OPEN) / 2;
            sheet.style.top = (top < mid ? OPEN : PEEK) + "px";
        });

        sheet.style.top = PEEK + "px";
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
            "<div class="hs-today-row">" +
                "<div class="hs-today-stat"><span class="hs-today-num">" + todayObs + "</span><span class="hs-today-label">Today</span></div>" +
                "<div class="hs-divider"></div>" +
                "<div class="hs-today-stat"><span class="hs-today-num">" + sppCount + "</span><span class="hs-today-label">Species</span></div>" +
                "<div class="hs-divider"></div>" +
                "<div class="hs-today-stat"><span class="hs-today-num streak">" + String.fromCodePoint(0x1F525) + s.streak + "</span><span class="hs-today-label">Streak</span></div>" +
            "</div>" +
            "<div class="hs-section-title">" + season.icon + " In Your Area · " + season.name + "</div>" +
            "<div class="hs-species-row">" +
                spotlight.slice(0, 4).map(function(s) {
                    return "<button onclick="app.ui.openSpeciesDetail(" + s.id + ")" class="hs-species-card">" +
                        "<img src="" + (s.squareImg || s.img) + "" class="hs-species-img">" +
                        "<div class="hs-species-name">" + s.name + "</div>" +
                        "<div class="hs-species-rarity " + (s.rarity === "Common" ? "rarity-common" : s.rarity === "Uncommon" ? "rarity-uncommon" : "rarity-rare") + "">" + s.rarity + "</div>" +
                    "</button>";
                }).join("") +
            "</div>" +
            "<button onclick="app.ui.openPanel(\"panel-discover\")" class="hs-discover-btn">" +
                "<span class="material-symbols-rounded">explore</span> Explore More" +
            "</button>";
    }
};
