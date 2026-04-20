export const map = {
    map: null,
    pos: {},
    me: null,
    communityLayer: null,
    personalLayer: null,
    centered: false,
    communityMarkers: [],
    personalMarkers: [],

    _esc(v) {
        return String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

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
                html: "<div id=\"map-me\" class=\"map-me-pin\">" + (app.state.avatar || '🌍') + "</div>",
                iconSize: [44, 44],
                iconAnchor: [22, 22]
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
        // Refresh home sheet only after init completes (app.init already calls it once;
        // this handles the case where GPS arrives late after init finishes)
        if (this.app._initDone) this.app.hud.refreshHomeSheet();
    },

    async _loadCommunityObs() {
        const obs = await this.app.inat.nearbyObservations(this.pos.lat, this.pos.lng, { limit: 50, days: 14 });
        this.communityLayer.clearLayers();
        this.communityMarkers = [];
        obs.forEach(o => this._addCommunityPin(o));
    },

    _addCommunityPin(o) {
        const [lat, lng] = o.location.split(",").map(parseFloat);
        const taxonId = o.taxon?.id;
        const name = o.taxon?.preferred_common_name || o.taxon?.name || "Unknown";
        const photo = o.photos?.[0]?.url?.replace("square", "small");
        const squarePhoto = o.taxon?.default_photo?.square_url || o.photos?.[0]?.url || '';
        const emoji = this.app.inat.iconicEmoji(o.taxon?.iconic_taxon_name);
        const imgHtml = photo ? "<img src='" + this._esc(photo) + "' class=\"com-pin-img\">" : "<div class=\"com-pin-emoji\">" + this._esc(emoji) + "</div>";
        const icon = L.divIcon({
            className: "bg-transparent",
            html: "<div class=\"community-obs-pin\">" + imgHtml + "</div>",
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });
        const marker = L.marker([lat, lng], { icon }).addTo(this.communityLayer);
        const popupHtml = "<div class='com-popup'>" +
            (squarePhoto ? "<img src='" + this._esc(squarePhoto) + "' class='com-popup-img'>" : "<div class='com-popup-emoji'>" + this._esc(emoji) + "</div>") +
            "<div class='com-popup-body'>" +
            "<div class='com-popup-name'>" + this._esc(name) + "</div>" +
            "<div class='com-popup-meta'>" + this._esc(o.place_guess || "Nearby") + " · " + this._esc(o.observed_on || "") + "</div>" +
            (o.user?.login ? "<div class='com-popup-by'>@" + this._esc(o.user.login) + "</div>" : "") +
            (taxonId ? "<button onclick=\"app.ui.openSpeciesDetail(" + taxonId + ");\" class='com-popup-btn'>View Species ›</button>" : "") +
            "</div></div>";
        marker.bindPopup(popupHtml, { maxWidth: 240, className: 'ede-popup' });
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
        const marker = L.marker([obs.lat, obs.lng], { icon, draggable: true }).addTo(this.personalLayer);
        marker.obsId = obs.id;
        marker.on('dragstart', () => {
            marker.closePopup();
            if (this.app.ui) this.app.ui.showToast('Drag to reposition');
        });
        marker.on('dragend', () => {
            const { lat, lng } = marker.getLatLng();
            const o = this.app.state.observations.find(o => o.id === marker.obsId);
            if (o) {
                o.lat = lat;
                o.lng = lng;
                this.app.saveState();
                if (this.app.ui) this.app.ui.showToast('📍 Location updated');
            }
        });
        const popupHtml = "<div class='com-popup'>" +
            (obs.photo ? "<img src='" + obs.photo + "' class='com-popup-img'>" : "<div class='com-popup-emoji'>" + emoji + "</div>") +
            "<div class='com-popup-body'>" +
            "<div class='com-popup-name'>" + String.fromCodePoint(0x1F4F7) + " " + obs.speciesName + "</div>" +
            "<div class='com-popup-meta' style='color:#059669;font-weight:600'>+" + obs.dp + " DP</div>" +
            (obs.notes ? "<div class='com-popup-meta'>" + obs.notes + "</div>" : "") +
            (obs.taxonId ? "<button onclick=\"app.ui.openSpeciesDetail(" + obs.taxonId + ");\" class='com-popup-btn'>View Species ›</button>" : "") +
            "</div></div>";
        marker.bindPopup(popupHtml, { maxWidth: 240, className: 'ede-popup' });
        this.personalMarkers.push(marker);
        if (focus) this.map.flyTo([obs.lat, obs.lng], 16, { duration: 0.8 });
    },

    toggleCommunityLayer(on) {
        this._communityLayerOn = on;
        const cb = document.getElementById('toggle-community-layer');
        const cbQuick = document.getElementById('quick-toggle-community');
        if (on) {
            if (!this.map.hasLayer(this.communityLayer)) this.communityLayer.addTo(this.map);
        } else {
            if (this.map.hasLayer(this.communityLayer)) this.map.removeLayer(this.communityLayer);
        }
        if (cb) cb.checked = on;
        if (cbQuick) cbQuick.checked = on;
    },

    togglePersonalLayer(on) {
        this._personalLayerOn = on;
        const cb = document.getElementById('toggle-personal-layer');
        const cbQuick = document.getElementById('quick-toggle-personal');
        if (on) {
            if (!this.map.hasLayer(this.personalLayer)) this.personalLayer.addTo(this.map);
        } else {
            if (this.map.hasLayer(this.personalLayer)) this.map.removeLayer(this.personalLayer);
        }
        if (cb) cb.checked = on;
        if (cbQuick) cbQuick.checked = on;
    },

    async toggleIconicLayer(iconicTaxonName, on) {
        if (!this._iconicLayerState) this._iconicLayerState = {};
        this._iconicLayerState[iconicTaxonName] = on;
        const layerId = 'iconic_' + iconicTaxonName;
        if (on) {
            if (this._iconicLayers?.[layerId]) {
                this._iconicLayers[layerId].addTo(this.map);
                return;
            }
            if (!this.app.inat || !this.pos.lat) return;
            this._iconicLayers = this._iconicLayers || {};
            const obs = await this.app.inat.nearbyObservations(this.pos.lat, this.pos.lng, {
                iconic: iconicTaxonName, limit: 50
            });
            const layer = L.layerGroup();
            (obs || []).forEach(o => {
                const lat = o.location?.split(',')[0];
                const lng = o.location?.split(',')[1];
                if (!lat || !lng) return;
                const taxonId = o.taxon?.id;
                const name = o.taxon?.preferred_common_name || o.taxon?.name || "Unknown";
                const photo = o.photos?.[0]?.url?.replace("square", "small");
                const squarePhoto = o.taxon?.default_photo?.square_url || o.photos?.[0]?.url || '';
                const emoji = this.app.inat.iconicEmoji(o.taxon?.iconic_taxon_name || iconicTaxonName);
                const imgHtml = photo ? "<img src='" + this._esc(photo) + "' class=\"com-pin-img\">" : "<div class=\"com-pin-emoji\">" + this._esc(emoji) + "</div>";
                const icon = L.divIcon({
                    className: "bg-transparent",
                    html: "<div class=\"community-obs-pin\">" + imgHtml + "</div>",
                    iconSize: [36, 36],
                    iconAnchor: [18, 18]
                });
                const marker = L.marker([parseFloat(lat), parseFloat(lng)], { icon }).addTo(layer);
                const popupHtml = "<div class='com-popup'>" +
                    (squarePhoto ? "<img src='" + this._esc(squarePhoto) + "' class='com-popup-img'>" : "<div class='com-popup-emoji'>" + this._esc(emoji) + "</div>") +
                    "<div class='com-popup-body'>" +
                    "<div class='com-popup-name'>" + this._esc(name) + "</div>" +
                    "<div class='com-popup-meta'>" + this._esc(o.place_guess || "Nearby") + " · " + this._esc(o.observed_on || "") + "</div>" +
                    (o.user?.login ? "<div class='com-popup-by'>@" + this._esc(o.user.login) + "</div>" : "") +
                    (taxonId ? "<button onclick=\"app.ui.openSpeciesDetail(" + taxonId + ");\" class='com-popup-btn'>View Species ›</button>" : "") +
                    "</div></div>";
                marker.bindPopup(popupHtml, { maxWidth: 240, className: 'ede-popup' });
            });
            this._iconicLayers[layerId] = layer;
            layer.addTo(this.map);
        } else {
            if (this._iconicLayers?.[layerId]) {
                this.map.removeLayer(this._iconicLayers[layerId]);
            }
        }
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
