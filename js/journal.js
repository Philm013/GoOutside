// Journal module — replaces game.js; handles observation logging and stats
export const journal = {
    currentImage: null,
    currentImageBase64: null,
    _pendingObsLocation: null,
    _moveObsId: null,

    init(app) {
        this.app = app;
    },

    // ─── IMAGE CAPTURE ────────────────────────────────────────────
    async captureImage() {
        try {
            if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
                const image = await Capacitor.Plugins.Camera.getPhoto({
                    quality: 85,
                    allowEditing: false,
                    resultType: 'dataUrl',
                    source: 'CAMERA'
                });
                this.setImagePreview(image.dataUrl);
            } else {
                document.getElementById('file-upload-input')?.click();
            }
        } catch (e) {
            console.error('Camera error:', e);
        }
    },

    setImagePreview(dataUrl) {
        this.currentImage = dataUrl;
        const preview = document.getElementById('obs-image-preview');
        const placeholder = document.getElementById('obs-image-placeholder');
        if (preview && placeholder) {
            preview.src = dataUrl;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
        }
    },

    handleFileUpload(input) {
        const file = input?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => this.setImagePreview(e.target.result);
        reader.readAsDataURL(file);
        // Also try to extract EXIF GPS
        const gpsReader = new FileReader();
        gpsReader.onload = e => {
            try {
                const gps = this._parseExifGPS(e.target.result);
                if (gps) this._showExifLocationBanner(gps.lat, gps.lng);
            } catch (_) {}
        };
        gpsReader.readAsArrayBuffer(file);
    },

    // ─── EXIF GPS PARSER ──────────────────────────────────────────
    _parseExifGPS(buffer) {
        const view = new DataView(buffer);
        // Must be JPEG
        if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null;
        let offset = 2;
        while (offset < view.byteLength - 4) {
            const marker = view.getUint16(offset);
            const segLen = view.getUint16(offset + 2);
            if (marker === 0xFFE1) {
                // APP1 — check for "Exif\0\0"
                if (view.byteLength < offset + 10) break;
                const exif = view.getUint32(offset + 4);
                if (exif !== 0x45786966) break; // "Exif"
                const tiffStart = offset + 10;
                const bo = view.getUint16(tiffStart); // byte order
                const le = bo === 0x4949; // II = little-endian
                const get16 = (o) => view.getUint16(tiffStart + o, le);
                const get32 = (o) => view.getUint32(tiffStart + o, le);
                const getRat = (o) => {
                    const num = view.getUint32(tiffStart + o, le);
                    const den = view.getUint32(tiffStart + o + 4, le);
                    return den ? num / den : 0;
                };
                // IFD0 offset
                const ifd0 = get32(4);
                const entryCount = get16(ifd0);
                let gpsIFDOffset = null;
                for (let i = 0; i < entryCount; i++) {
                    const base = ifd0 + 2 + i * 12;
                    if (get16(base) === 0x8825) { gpsIFDOffset = get32(base + 8); break; }
                }
                if (gpsIFDOffset === null) return null;
                const gpsCount = get16(gpsIFDOffset);
                const tags = {};
                for (let i = 0; i < gpsCount; i++) {
                    const base = gpsIFDOffset + 2 + i * 12;
                    const tag = get16(base);
                    const valOffset = get32(base + 8);
                    tags[tag] = valOffset;
                }
                // Tags: 0x1=LatRef, 0x2=Lat, 0x3=LngRef, 0x4=Lng
                if (!(0x2 in tags && 0x4 in tags)) return null;
                const lat = getRat(tags[0x2]) + getRat(tags[0x2] + 8) / 60 + getRat(tags[0x2] + 16) / 3600;
                const lng = getRat(tags[0x4]) + getRat(tags[0x4] + 8) / 60 + getRat(tags[0x4] + 16) / 3600;
                // Read ref chars from buffer
                let latSign = 1, lngSign = 1;
                try {
                    const lrOff = tiffStart + tags[0x1];
                    const lrChar = String.fromCharCode(view.getUint8(lrOff));
                    if (lrChar === 'S') latSign = -1;
                    const loOff = tiffStart + tags[0x3];
                    const loChar = String.fromCharCode(view.getUint8(loOff));
                    if (loChar === 'W') lngSign = -1;
                } catch (_) {}
                if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;
                return { lat: latSign * lat, lng: lngSign * lng };
            }
            offset += 2 + segLen;
        }
        return null;
    },

    _showExifLocationBanner(lat, lng) {
        const existing = document.getElementById('obs-exif-banner');
        if (existing) existing.remove();
        const latStr = lat.toFixed(5);
        const lngStr = lng.toFixed(5);
        const banner = document.createElement('div');
        banner.id = 'obs-exif-banner';
        banner.className = 'mx-4 mt-0 mb-2 bg-brand/10 border border-brand/20 rounded-xl p-3 flex items-start gap-3 animate-fade-in';
        banner.innerHTML = `
            <span class="material-symbols-rounded text-brand mt-0.5 shrink-0">photo_camera</span>
            <div class="flex-1 min-w-0">
                <p class="text-xs font-bold text-brand">Photo location found</p>
                <p class="text-[11px] text-gray-500">${latStr}, ${lngStr}</p>
            </div>
            <div class="flex gap-2 shrink-0">
                <button onclick="app.journal._useExifLocation(${lat},${lng})"
                    class="text-xs font-bold text-white bg-brand px-3 py-1.5 rounded-lg active:scale-95">Use</button>
                <button onclick="document.getElementById('obs-exif-banner')?.remove()"
                    class="text-xs font-bold text-gray-400 px-2 py-1.5 active:opacity-70">Ignore</button>
            </div>`;
        // Insert after the photo section in the log form
        const photoDiv = document.querySelector('#logObsContent .overflow-y-auto > div:first-child');
        if (photoDiv) photoDiv.after(banner);
    },

    _useExifLocation(lat, lng) {
        this._pendingObsLocation = { lat, lng };
        document.getElementById('obs-exif-banner')?.remove();
        this._updateLocationDisplay(lat, lng);
        if (this.app.ui) this.app.ui.showToast('📍 Using photo location');
    },

    // ─── SUBMIT OBSERVATION ──────────────────────────────────────
    async submitObservation() {
        const speciesBtn = document.getElementById('obs-species-btn');
        const taxonId = speciesBtn?.dataset.id;
        const taxonName = speciesBtn?.dataset.name;
        const taxonIconic = speciesBtn?.dataset.iconic;
        const notesEl = document.getElementById('obs-notes');
        const habitatEl = document.getElementById('obs-habitat');
        const countEl = document.getElementById('obs-count');

        if (!taxonId) {
            this.app.ui.showToast('Select a species first.');
            return;
        }
        if (!this.currentImage) {
            this.app.ui.showToast('A photo is required.');
            return;
        }

        const lat = (this._pendingObsLocation?.lat) ?? (this.app.map.pos.lat || null);
        const lng = (this._pendingObsLocation?.lng) ?? (this.app.map.pos.lng || null);
        const count = Math.max(parseInt(countEl?.value || '1', 10), 1);
        const notes = (notesEl?.value || '').trim();
        const habitat = habitatEl?.value || 'General';
        const speciesObj = this.app.localSpecies.find(s => s.id == taxonId) || { dp: 75, rarity: 'Common' };

        // Calculate discovery points
        const dp = this.app.data.calcObservationDP(speciesObj, this.app.state);

        // Build observation record
        const obs = {
            id: `obs_${Date.now()}`,
            taxonId: parseInt(taxonId),
            speciesName: taxonName || 'Unknown',
            iconic: taxonIconic || speciesObj.iconic || 'Animalia',
            photo: this.currentImage,
            lat,
            lng,
            date: new Date().toISOString(),
            notes,
            habitat,
            count,
            dp,
            rarity: speciesObj.rarity || 'Common'
        };

        // Update state
        this.app.state.observations.unshift(obs);
        this.app.state.discoveryPoints += dp;

        // Update catalogue
        const cat = this.app.state.catalogue;
        if (!cat[taxonId]) {
            cat[taxonId] = { count: 0, totalCount: 0, firstSeen: obs.date, lastSeen: obs.date, iconic: obs.iconic };
        }
        cat[taxonId].count += 1;
        cat[taxonId].totalCount += count;
        cat[taxonId].lastSeen = obs.date;
        cat[taxonId].iconic = obs.iconic;

        // Update streak
        this.app.data.updateStreak(this.app.state);

        // Check badges
        const newBadges = this.app.data.checkBadges(this.app.state);

        this.app.saveState();

        // Add to map
        if (lat && lng) this.app.map.addPersonalSighting(obs, true);

        // Show success
        this.app.ui.showObsSuccess(obs, newBadges);
        this.app.ui.closeLogObservation();
        this.app.ui.renderHUDStats();

        // Reset
        this.currentImage = null;
    },

    // ─── RENDER JOURNAL ──────────────────────────────────────────
    renderJournal() {
        this._renderStats();
        this._renderTimeline();
    },

    _renderStats() {
        const obs = this.app.state.observations;
        const cat = this.app.state.catalogue;
        const today = new Date().toDateString();
        const todayCount = obs.filter(o => new Date(o.date).toDateString() === today).length;
        const sppCount = Object.keys(cat).length;
        const habitats = [...new Set(obs.map(o => o.habitat).filter(Boolean))].length;

        const el = document.getElementById('journal-stats');
        if (!el) return;
        const lv = this.app.data.calcLevel(this.app.state.discoveryPoints);
        el.innerHTML = `
            <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="bg-brand/10 dark:bg-brand/20 rounded-2xl p-4 text-center">
                    <div class="text-3xl font-black text-brand">${obs.length}</div>
                    <div class="text-xs font-bold text-gray-500 uppercase mt-1">Total Obs</div>
                </div>
                <div class="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 text-center">
                    <div class="text-3xl font-black text-amber-600">${sppCount}</div>
                    <div class="text-xs font-bold text-gray-500 uppercase mt-1">Species</div>
                </div>
                <div class="bg-sky-50 dark:bg-sky-900/20 rounded-2xl p-4 text-center">
                    <div class="text-3xl font-black text-sky-600">${habitats}</div>
                    <div class="text-xs font-bold text-gray-500 uppercase mt-1">Habitats</div>
                </div>
                <div class="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4 text-center">
                    <div class="text-3xl font-black text-green-600">🔥${this.app.state.streak}</div>
                    <div class="text-xs font-bold text-gray-500 uppercase mt-1">Day Streak</div>
                </div>
            </div>
            <div class="bg-surface-light dark:bg-surface-dark rounded-2xl p-4 border border-gray-100 dark:border-gray-700 mb-2">
                <div class="flex justify-between text-xs font-bold mb-2">
                    <span class="text-brand">Lv. ${lv.level} — ${lv.title}</span>
                    <span class="text-gray-400">${this.app.state.discoveryPoints.toLocaleString()} DP</span>
                </div>
                <div class="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-brand to-emerald-400 rounded-full transition-all duration-700" style="width:${lv.pct.toFixed(1)}%"></div>
                </div>
                <div class="text-[10px] text-gray-400 mt-1 text-right">${lv.curr} / ${lv.req} to Lv.${lv.level + 1}</div>
            </div>`;
        const countEl = document.getElementById('journal-entry-count');
        if (countEl) countEl.textContent = obs.length + (obs.length === 1 ? ' entry' : ' entries');
    },

    _renderTimeline() {
        const obs = this.app.state.observations;
        const el = document.getElementById('journal-timeline');
        if (!el) return;
        const search = (document.getElementById('journal-search')?.value || '').toLowerCase();
        const filter = document.querySelector('.journal-filter-btn.active')?.dataset.filter || 'all';

        let filtered = obs;
        if (search) filtered = filtered.filter(o =>
            o.speciesName.toLowerCase().includes(search) ||
            (o.notes || '').toLowerCase().includes(search) ||
            (o.habitat || '').toLowerCase().includes(search)
        );
        if (filter !== 'all') filtered = filtered.filter(o => (o.iconic || '').toLowerCase() === filter.toLowerCase());

        if (!filtered.length) {
            el.innerHTML = `<div class="col-span-2 text-center py-12 text-gray-400">
                <div class="text-5xl mb-3">📒</div>
                <p class="font-semibold">No observations yet</p>
                <p class="text-sm mt-1">Tap the 📸 button to log your first one!</p>
            </div>`;
            return;
        }

        el.innerHTML = filtered.map(o => {
            const d = new Date(o.date);
            const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            return `
                <button onclick="app.ui.openObsDetail('${o.id}')"
                    class="col-span-1 bg-surface-light dark:bg-surface-dark rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700 shadow-sm active:scale-98 transition-all text-left">
                    <div class="relative aspect-square overflow-hidden bg-gray-100 dark:bg-gray-800">
                        ${o.photo ? `<img src="${o.photo}" class="w-full h-full object-cover" loading="lazy">` : `<div class="w-full h-full flex items-center justify-center text-4xl">${this.app.inat.iconicEmoji(o.iconic)}</div>`}
                        <div class="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded-full">
                            <span class="text-white text-[10px] font-bold">+${o.dp} DP</span>
                        </div>
                    </div>
                    <div class="p-3">
                        <div class="font-bold text-sm text-gray-900 dark:text-white truncate">${o.speciesName}</div>
                        <div class="text-[10px] text-gray-400 mt-0.5">${dateStr} · ${timeStr}</div>
                        ${o.habitat ? `<div class="text-[10px] text-brand mt-0.5 font-semibold">📍 ${o.habitat}</div>` : ''}
                    </div>
                </button>`;
        }).join('');
    },

    // Build taxa breakdown for a charting / insight view
    getTaxaBreakdown() {
        const counts = {};
        for (const o of this.app.state.observations) {
            const k = o.iconic || 'Animalia';
            counts[k] = (counts[k] || 0) + 1;
        }
        return Object.entries(counts)
            .map(([k, v]) => ({ iconic: k, count: v, emoji: this.app.inat.iconicEmoji(k), label: this.app.inat.iconicLabel(k) }))
            .sort((a, b) => b.count - a.count);
    },

    // ─── LOCATION PICKER ─────────────────────────────────────────
    _updateLocationDisplay(lat, lng) {
        const el = document.getElementById('obs-location-display');
        if (el) el.textContent = lat.toFixed(4) + ', ' + lng.toFixed(4);
    },

    confirmPickedLocation() {
        const loc = this.app.ui._pickerTempLocation;
        if (!loc) { this.app.ui.closeLocationPicker(); return; }

        // If we're moving an existing observation
        if (this._moveObsId) {
            const obs = this.app.state.observations.find(o => o.id === this._moveObsId);
            if (obs) {
                obs.lat = loc.lat;
                obs.lng = loc.lng;
                this.app.saveState();
                // Update map marker
                this.app.map.personalMarkers.forEach(m => {
                    if (m.obsId === this._moveObsId) m.setLatLng([loc.lat, loc.lng]);
                });
                this.app.ui.showToast('📍 Observation moved');
            }
            this._moveObsId = null;
            this.app.ui.closeLocationPicker();
            return;
        }

        this._pendingObsLocation = { lat: loc.lat, lng: loc.lng };
        this._updateLocationDisplay(loc.lat, loc.lng);
        this.app.ui.closeLocationPicker();
        this.app.ui.showToast('📍 Location set');
    }
};
