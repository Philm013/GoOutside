export const map = {
    map: null,
    pos: {},
    me: null,
    communityLayer: null,
    personalLayer: null,
    centered: false,
    communityMarkers: [],
    personalMarkers: [],

    init(app) {
        this.app = app;
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        this.map = L.map("map", { zoomControl: false, attributionControl: false }).setView([40.71, -74.00], 13);
        const tileUrl = isDark
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png";
        L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(this.map);

        this.communityLayer = L.layerGroup().addTo(this.map);
        this.personalLayer = L.layerGroup().addTo(this.map);

        this.me = L.marker([0, 0], {
            icon: L.divIcon({
                className: "bg-transparent",
                html: "<div id=\"map-me\" class=\"map-me-pin\"></div>"
            }),
            zIndexOffset: 1000
        }).addTo(this.map);

        this._loadPersonalSightings();

        const geoOpts = { enableHighAccuracy: true };
        if (typeof Capacitor !== "undefined" && Capacitor.isNativePlatform()) {
            Capacitor.Plugins.Geolocation.watchPosition(geoOpts, (p) => {
                if (p.error) return;
                this._onPosition(p.coords.latitude, p.coords.longitude);
            });
        } else {
            navigator.geolocation.watchPosition(
                p => this._onPosition(p.coords.latitude, p.coords.longitude),
                err => console.warn("Geo error", err),
                geoOpts
            );
        }
    },

    _onPosition(lat, lng) {
        this.pos = { lat, lng };
        this.me.setLatLng([lat, lng]);
        if (!this.centered) {
            this.recenter();
            this.centered = true;
            this._loadInitialData();
        }
    },

    async _loadInitialData() {
        const { lat, lng } = this.pos;
        this.app.localSpecies = await this.app.inat.seasonalSpecies(lat, lng, { limit: 200 });
        this._loadCommunityObs();
        this.app.hud.refreshHomeSheet();
    },

    async _loadCommunityObs() {
        const obs = await this.app.inat.nearbyObservations(this.pos.lat, this.pos.lng, { limit: 50, days: 14 });
        this.communityLayer.clearLayers();
        this.communityMarkers = [];
        obs.forEach(o => this._addCommunityPin(o));
    },

    _addCommunityPin(o) {
        const [lat, lng] = o.location.split(",").map(parseFloat);
        const name = o.taxon?.preferred_common_name || o.taxon?.name || "Unknown";
        const photo = o.photos?.[0]?.url?.replace("square", "small");
        const emoji = this.app.inat.iconicEmoji(o.taxon?.iconic_taxon_name);
        const imgHtml = photo ? "<img src=" + JSON.stringify(photo) + " class=\"com-pin-img\">" : "<div class=\"com-pin-emoji\">" + emoji + "</div>";
        const icon = L.divIcon({
            className: "bg-transparent",
            html: "<div class=\"community-obs-pin\">" + imgHtml + "</div>",
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });
        const marker = L.marker([lat, lng], { icon }).addTo(this.communityLayer);
        marker.bindPopup(
            "<div style=\"font-size:13px;font-weight:700;margin-bottom:3px\">" + name + "</div>" +
            "<div style=\"font-size:11px;color:#6b7280\">" + (o.place_guess || "") + " · " + (o.observed_on || "") + "</div>" +
            (o.user?.login ? "<div style=\"font-size:10px;color:#9ca3af;margin-top:3px\">by @" + o.user.login + "</div>" : "")
        );
        this.communityMarkers.push(marker);
    },

    _loadPersonalSightings() {
        (this.app.state.observations || []).slice(0, 100).forEach(obs => {
            if (obs.lat && obs.lng) this.addPersonalSighting(obs, false);
        });
    },

    addPersonalSighting(obs, focus = true) {
        const emoji = this.app.inat.iconicEmoji(obs.iconic);
        const imgHtml = obs.photo
            ? "<img src=" + JSON.stringify(obs.photo) + " class=\"pers-pin-img\">"
            : "<div class=\"pers-pin-emoji\">" + emoji + "</div>";
        const icon = L.divIcon({
            className: "bg-transparent",
            html: "<div class=\"personal-obs-pin\">" + imgHtml + "</div>",
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });
        const marker = L.marker([obs.lat, obs.lng], { icon }).addTo(this.personalLayer);
        marker.bindPopup(
            "<div style=\"font-size:13px;font-weight:700;margin-bottom:3px\">" + String.fromCodePoint(0x1F4F7) + " " + obs.speciesName + "</div>" +
            "<div style=\"font-size:11px;color:#059669;font-weight:600\">+" + obs.dp + " DP</div>" +
            (obs.notes ? "<div style=\"font-size:11px;color:#6b7280;margin-top:4px\">" + obs.notes + "</div>" : "")
        );
        this.personalMarkers.push(marker);
        if (focus) this.map.flyTo([obs.lat, obs.lng], 16, { duration: 0.8 });
    },

    recenter() {
        if (this.pos.lat) {
            this.map.setView([this.pos.lat, this.pos.lng], 16);
        } else {
            if (this.app.ui) this.app.ui.showToast("Locating…");
        }
    },

    refreshAvatar() {
        const el = document.getElementById("map-me");
        if (el) el.textContent = this.app.state.avatar;
    }
};
