// Journal module — replaces game.js; handles observation logging and stats
export const journal = {
    currentImage: null,
    currentImageBase64: null,

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

        const lat = this.app.map.pos.lat || null;
        const lng = this.app.map.pos.lng || null;
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
    }
};
