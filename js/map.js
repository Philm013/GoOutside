export const map = {
    map: null,
    pos: {},
    me: null,
    communityLayer: null,
    personalLayer: null,
    playersLayer: null,
    centered: false,
    communityMarkers: [],
    personalMarkers: [],
    playerMarkers: {},
    _communityLayerOn: true,
    _personalLayerOn: true,
    _iconicLayerState: {},
    _communityObsData: [],

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
        this.playersLayer = L.layerGroup().addTo(this.map);

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
        this.toggleCommunityLayer(true);
        this.togglePersonalLayer(true);
        this._syncIconicCheckboxes();

        const geoOpts = { enableHighAccuracy: true };
        if (typeof Capacitor !== "undefined" && Capacitor.isNativePlatform()) {
            const geo = Capacitor.Plugins && Capacitor.Plugins.Geolocation ? Capacitor.Plugins.Geolocation : null;
            if (geo) {
                const startWatch = () => {
                    geo.watchPosition(geoOpts, (p, err) => {
                        if (err || !p || !p.coords) return;
                        this._onPosition(p.coords.latitude, p.coords.longitude);
                    });
                };
                if (typeof geo.requestPermissions === 'function') {
                    geo.requestPermissions()
                        .then(perm => {
                            const status = perm?.location || perm?.coarseLocation;
                            if (!status || status === 'granted' || status === 'limited') startWatch();
                        })
                        .catch(() => {});
                } else {
                    startWatch();
                }
            }
        } else {
            if (navigator.geolocation) {
                navigator.geolocation.watchPosition(
                    p => this._onPosition(p.coords.latitude, p.coords.longitude),
                    err => console.warn("Geo error", err),
                    geoOpts
                );
            }
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
        this._setCommunityObservations(obs);
    },

    _setCommunityObservations(obs) {
        this._communityObsData = Array.isArray(obs) ? obs : [];
        this._renderCommunityObservations();
    },

    _getSelectedIconicTaxonNames() {
        return Object.entries(this._iconicLayerState || {})
            .filter(([, on]) => !!on)
            .map(([name]) => name);
    },

    _filteredCommunityObservations() {
        const selected = this._getSelectedIconicTaxonNames();
        if (!selected.length) return this._communityObsData || [];
        const selectedSet = new Set(selected);
        return (this._communityObsData || []).filter(o => selectedSet.has(o?.taxon?.iconic_taxon_name));
    },

    _renderCommunityObservations() {
        this.communityLayer.clearLayers();
        this.communityMarkers = [];
        this._filteredCommunityObservations().forEach(o => this._addCommunityPin(o));
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
        const normalizedTaxon = this.app.inat.normalizeIconicTaxon(iconicTaxonName);
        const allowedTaxa = new Set(this.app.ui?.ICONIC_TAXA || []);
        if (!allowedTaxa.has(normalizedTaxon)) {
            console.warn('Ignoring unsupported iconic taxon toggle:', iconicTaxonName);
            return;
        }
        if (!this._iconicLayerState) this._iconicLayerState = {};
        this._iconicLayerState[normalizedTaxon] = !!on;
        this._syncIconicCheckboxes(normalizedTaxon);
        if (!this._communityObsData?.length && this.pos?.lat && this.pos?.lng) {
            await this._loadCommunityObs();
            return;
        }
        this._renderCommunityObservations();
    },

    _syncIconicCheckboxes(iconicTaxonName = null) {
        if (iconicTaxonName) {
            const checked = !!this._iconicLayerState?.[iconicTaxonName];
            document.querySelectorAll(`[data-iconic-toggle="${iconicTaxonName}"]`).forEach(el => {
                el.checked = checked;
            });
            return;
        }
        document.querySelectorAll('[data-iconic-toggle]').forEach(el => {
            const t = el.getAttribute('data-iconic-toggle');
            el.checked = !!this._iconicLayerState?.[t];
        });
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
    },

    updatePlayer(p) {
        if (!p || !p.id || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
        const selfId = this.app && this.app.multiplayer && this.app.multiplayer.peer ? this.app.multiplayer.peer.id : null;
        if (selfId && p.id === selfId) return;
        let marker = this.playerMarkers[p.id];
        if (!marker) {
            const icon = L.divIcon({
                className: "bg-transparent",
                html: "<div class=\"map-me-pin\" style=\"opacity:.95\">" + this._esc(p.avatar || '🌿') + "</div>",
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });
            marker = L.marker([p.lat, p.lng], { icon, zIndexOffset: 800 }).addTo(this.playersLayer);
            this.playerMarkers[p.id] = marker;
        } else {
            marker.setLatLng([p.lat, p.lng]);
        }
        const name = this._esc(p.username || 'Explorer');
        const code = this._esc(p.shortId || '');
        marker.bindPopup("<div class='com-popup'><div class='com-popup-body'><div class='com-popup-name'>" + name + "</div><div class='com-popup-meta'>" + code + "</div></div></div>", { maxWidth: 180, className: 'ede-popup' });
    },

    removePlayer(peerId) {
        const m = this.playerMarkers[peerId];
        if (!m) return;
        try { this.playersLayer.removeLayer(m); } catch (e) {}
        delete this.playerMarkers[peerId];
    },

    clearPlayers() {
        Object.keys(this.playerMarkers).forEach(id => this.removePlayer(id));
    },

    addGlobalSighting(payload) {
        if (!payload || !Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) return;
        const obs = {
            location: payload.lat + "," + payload.lng,
            observed_on: new Date().toISOString().slice(0, 10),
            place_guess: 'Party sighting',
            user: { login: payload.username || 'Explorer' },
            taxon: {
                preferred_common_name: payload.speciesName || 'Shared sighting',
                name: payload.speciesName || 'Shared sighting',
                iconic_taxon_name: payload.iconic || null
            },
            photos: []
        };
        this._addCommunityPin(obs);
    }
};
