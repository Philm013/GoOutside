export const map = {
    map: null, pos: {}, markers: {}, collectibles: {}, globalSightings: [], activeLures: [],
    
    init(app) {
        this.app = app;
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.map = L.map('map', { zoomControl: false, attributionControl: false }).setView([40.71, -74.00], 13);
        const tileUrl = isDark
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';
        L.tileLayer(tileUrl).addTo(this.map);
        
        this.me = L.marker([0, 0], {
            icon: L.divIcon({
                className: 'bg-transparent',
                html: `<div id="map-me" class="text-4xl filter drop-shadow-md -translate-x-1/2 -translate-y-1/2 transition-transform pulse-radar rounded-full bg-white/20 p-2">${this.app.state.avatar}</div>`
            }),
            zIndexOffset: 1000
        }).addTo(this.map);

        if (typeof Capacitor !== 'undefined') {
            Capacitor.Plugins.Geolocation.watchPosition({ enableHighAccuracy: true }, (p) => {
                if (!p) return;
                this.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
                this.me.setLatLng(this.pos);
                if (!this.centered) {
                    this.recenter();
                    this.centered = true;
                    this.app.data.fetchSpecies(this.app);
                    this.spawnInitialCollectibles();
                }
                if (this.app.multiplayer) this.app.multiplayer.broadcastPos();
                this.checkCollectibles();
            });
        }
    },
    recenter() {
        if (this.pos.lat) {
            this.map.setView(this.pos, 16);
        } else {
            if (this.app.ui) this.app.ui.showToast("Locating...");
        }
    },
    updatePlayer(p) {
        if (this.app.multiplayer && p.id === this.app.multiplayer.peer?.id) return;
        const icon = L.divIcon({
            className: '',
            html: `<div class="flex flex-col items-center"><div class="text-3xl filter drop-shadow-lg animate-bounce">${p.avatar}</div><div class="bg-white/90 backdrop-blur px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm -mt-1 whitespace-nowrap">${p.username}</div></div>`,
            iconSize: [40, 60],
            iconAnchor: [20, 50]
        });
        if (this.markers[p.id]) {
            this.markers[p.id].setLatLng([p.lat, p.lng]).setIcon(icon);
        } else {
            this.markers[p.id] = L.marker([p.lat, p.lng], { icon }).addTo(this.map);
        }
    },
    removePlayer(id) {
        if (this.markers[id]) {
            this.map.removeLayer(this.markers[id]);
            delete this.markers[id];
        }
    },
    clearPlayers() {
        Object.values(this.markers).forEach(m => this.map.removeLayer(m));
        this.markers = {};
    },
    addGlobalSighting(payload) {
        const icon = L.divIcon({
            className: 'bg-transparent',
            html: `<div class="bg-brand text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg border-2 border-white flex flex-col items-center gap-1">
                <span>📸 ${payload.speciesName}</span>
                <span class="text-[8px] font-normal opacity-80">by ${payload.username}</span>
            </div>`,
            iconSize: [100, 40],
            iconAnchor: [50, 40]
        });
        const marker = L.marker([payload.lat, payload.lng], { icon }).addTo(this.map);
        this.globalSightings.push(marker);
        
        // Simple animation
        const el = marker.getElement();
        if(el) {
            el.style.animation = 'scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
        }
    },
    spawnLure(lat, lng) {
        // Draw a pulse circle
        const circle = L.circle([lat, lng], {
            color: '#a855f7',
            fillColor: '#d8b4fe',
            fillOpacity: 0.4,
            radius: 50,
            className: 'animate-pulse'
        }).addTo(this.map);
        this.activeLures.push(circle);
        
        // Lure lasts for 15 minutes
        setTimeout(() => {
            this.map.removeLayer(circle);
            this.activeLures = this.activeLures.filter(c => c !== circle);
        }, 15 * 60 * 1000);
    },
    spawnInitialCollectibles() {
        if (!this.pos.lat) return;
        for (let i = 0; i < 5; i++) {
            this.spawnRandomCollectible();
        }
    },
    spawnRandomCollectible() {
        if (!this.pos.lat) return;
        const latOffset = (Math.random() - 0.5) * 0.005;
        const lngOffset = (Math.random() - 0.5) * 0.005;
        const lat = this.pos.lat + latOffset;
        const lng = this.pos.lng + lngOffset;
        
        const type = Math.random() > 0.5 ? 'SEED' : 'XP';
        const emoji = type === 'SEED' ? '🌰' : '⚡';
        
        const id = `col_${Date.now()}_${Math.random()}`;
        const icon = L.divIcon({
            className: 'bg-transparent',
            html: `<div class="text-3xl filter drop-shadow-md animate-bounce">${emoji}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });
        
        const marker = L.marker([lat, lng], { icon }).addTo(this.map);
        this.collectibles[id] = { marker, lat, lng, type };
    },
    checkCollectibles() {
        if (!this.pos.lat) return;
        const threshold = 30; // meters
        Object.entries(this.collectibles).forEach(([id, item]) => {
            const dist = this.map.distance([this.pos.lat, this.pos.lng], [item.lat, item.lng]);
            if (dist < threshold) {
                this.collectItem(id, item);
            }
        });
    },
    collectItem(id, item) {
        this.map.removeLayer(item.marker);
        delete this.collectibles[id];
        
        if (this.app.haptics) this.app.haptics.vibrate();
        
        if (item.type === 'SEED') {
            this.app.state.seeds += 5;
            if(this.app.ui) this.app.ui.showToast("+5 Seeds Found!");
        } else {
            this.app.state.xp += 50;
            if(this.app.ui) this.app.ui.showToast("+50 XP Found!");
        }
        
        this.app.saveState();
        if(this.app.ui) this.app.ui.renderProfile();
        
        setTimeout(() => this.spawnRandomCollectible(), 5000);
    }
};