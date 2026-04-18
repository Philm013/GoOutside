export const ui = {
    editingProfile: false,
    selectorTarget: null,
    selectorActiveFilter: 'all',
    avatars: ['🌳','🦋','🦉','🦊','🐻','🐝','🐞','🐢','🐍','🐸','🐿️','🦔','🦌','🦅','🐦','🌿'],

    init(app) {
        this.app = app;
        this._loadSettings();
    },

    _loadSettings() {
        const s = this.app.state.settings || {};
        const urlEl = document.getElementById('settings-birdnet-url');
        const tokenEl = document.getElementById('settings-birdnet-token');
        if (urlEl) urlEl.value = s.birdnetApiUrl || '';
        if (tokenEl) tokenEl.value = s.birdnetToken || '';
    },

    saveSettings() {
        const url = document.getElementById('settings-birdnet-url')?.value.trim() || '';
        const token = document.getElementById('settings-birdnet-token')?.value.trim() || '';
        this.app.state.settings = { birdnetApiUrl: url, birdnetToken: token };
        this.app.saveState();
        this.showToast('Settings saved!');
    },

    openPanel(id) {
        const isMap = id === 'map';
        document.querySelectorAll('#panels-container .slide-panel').forEach(p => {
            p.classList.remove('panel-active');
            p.style.transform = 'translateX(100%)';
        });
        document.querySelectorAll('.nav-btn, .nav-fab').forEach(b => b.classList.remove('active'));
        if (!isMap) {
            const panel = document.getElementById(id);
            if (panel) { panel.classList.add('panel-active'); panel.style.transform = 'translateX(0)'; }
            const navMap = { 'panel-discover': 'nav-discover', 'panel-identify': 'nav-identify', 'panel-journal': 'nav-journal' };
            if (navMap[id]) document.getElementById(navMap[id])?.classList.add('active');
            if (id === 'panel-journal') this.app.journal.renderJournal();
            if (id === 'panel-profile') this.renderProfile();
            if (id === 'panel-discover') this.renderDiscover('nearby');
        } else {
            document.getElementById('nav-map')?.classList.add('active');
        }
        const sheet = document.getElementById('home-sheet');
        if (sheet) sheet.style.visibility = isMap ? 'visible' : 'hidden';
        // Collapse the sheet whenever navigating away from map
        if (!isMap && this.app.hud && this.app.hud.peekHomeSheet) this.app.hud.peekHomeSheet();
        const mapControls = document.getElementById('map-controls');
        if (mapControls) { mapControls.style.opacity = isMap ? '1' : '0'; mapControls.style.pointerEvents = isMap ? 'auto' : 'none'; }
        if (this.app.haptics) this.app.haptics.vibrate();
        setTimeout(() => { if (this.app.map && this.app.map.map) this.app.map.map.invalidateSize(); }, 350);
    },

    renderProfile() {
        const s = this.app.state;
        const lv = this.app.data.calcLevel(s.discoveryPoints);
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('profile-avatar-emoji', s.avatar);
        set('profile-username', s.username);
        set('profile-title', 'Lv.' + lv.level + ' — ' + lv.title);
        set('profile-level-label', 'Lv.' + lv.level + ' — ' + lv.title);
        set('profile-dp-text', s.discoveryPoints.toLocaleString() + ' DP');
        set('stat-obs', s.observations.length);
        set('stat-spp', Object.keys(s.catalogue).length);
        set('stat-streak', '🔥' + s.streak);
        const fill = document.getElementById('profile-xp-fill');
        if (fill) fill.style.width = lv.pct.toFixed(1) + '%';
        this._renderBadges();
        this._renderTaxaBreakdown();
    },

    renderHUDStats() {
        this.app.hud.renderHUDStats();
        const avEl = document.getElementById('hud-avatar');
        if (avEl) avEl.textContent = this.app.state.avatar;
    },

    _renderBadges() {
        const el = document.getElementById('badges-grid');
        if (!el) return;
        const earned = new Set(this.app.state.badges);
        el.innerHTML = this.app.data.BADGES.map(b => {
            const e = earned.has(b.id);
            return '<div class="badge-card ' + (e ? 'earned' : 'locked') + '">' +
                '<span class="badge-icon">' + b.icon + '</span>' +
                '<span class="badge-name">' + b.name + '</span>' +
                '<span class="badge-desc">' + b.desc + '</span>' +
                '</div>';
        }).join('');
    },

    _renderTaxaBreakdown() {
        const el = document.getElementById('taxa-breakdown');
        if (!el) return;
        const breakdown = this.app.journal.getTaxaBreakdown();
        if (!breakdown.length) { el.innerHTML = '<p class="text-xs text-gray-400 italic text-center py-2">No observations yet</p>'; return; }
        const total = breakdown.reduce((s, b) => s + b.count, 0);
        el.innerHTML = breakdown.map(b => {
            const pct = Math.round((b.count / total) * 100);
            return '<div class="flex items-center gap-2">' +
                '<span class="text-xl w-8 text-center">' + b.emoji + '</span>' +
                '<div class="flex-1">' +
                '<div class="flex justify-between text-xs font-semibold mb-0.5">' +
                '<span class="text-gray-700 dark:text-gray-300">' + b.label + '</span>' +
                '<span class="text-gray-400">' + b.count + '</span></div>' +
                '<div class="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">' +
                '<div class="h-full bg-brand rounded-full" style="width:' + pct + '%"></div></div>' +
                '</div></div>';
        }).join('');
    },

    toggleProfileEdit() {
        this.editingProfile = !this.editingProfile;
        const ctr = document.getElementById('username-container');
        const avSel = document.getElementById('avatar-selection-container');
        if (!ctr) return;
        if (this.editingProfile) {
            const cur = this.app.state.username;
            ctr.innerHTML = '<input id="username-input" class="text-2xl font-black text-center w-64 border-b-2 border-brand bg-transparent outline-none dark:text-white" value="' + cur + '">';
            if (avSel) { avSel.classList.remove('hidden'); this._renderAvatarPicker(); }
        } else {
            const val = document.getElementById('username-input')?.value?.trim();
            if (val) this.app.state.username = val;
            ctr.innerHTML = '<h3 id="profile-username" class="text-2xl font-black text-center dark:text-white px-4">' + this.app.state.username + '</h3>';
            if (avSel) avSel.classList.add('hidden');
            this.app.saveState();
            this.renderProfile();
        }
    },

    _renderAvatarPicker() {
        const el = document.getElementById('avatar-options');
        if (!el) return;
        el.innerHTML = this.avatars.map(a =>
            '<button class="avatar-opt ' + (this.app.state.avatar === a ? 'selected' : '') + '" onclick="app.ui.setAvatar(\'' + a + '\')">' + a + '</button>'
        ).join('');
    },

    setAvatar(a) {
        this.app.state.avatar = a;
        const el = document.getElementById('profile-avatar-emoji');
        if (el) el.textContent = a;
        if (this.app.map && this.app.map.refreshAvatar) this.app.map.refreshAvatar();
        this._renderAvatarPicker();
        this.renderHUDStats();
        this.app.saveState();
    },

    animateAvatar() {
        const el = document.getElementById('profile-avatar-container');
        if (!el) return;
        el.style.transform = 'scale(1.2)';
        setTimeout(() => { el.style.transform = ''; }, 300);
    },

    async renderDiscover(tab) {
        this._setDiscoverTab(tab);
        const el = document.getElementById('discover-body');
        if (!el) return;
        el.innerHTML = '<div class="flex items-center justify-center py-16 text-gray-400 gap-2"><span class="material-symbols-rounded animate-spin">progress_activity</span> Loading…</div>';
        const lat = this.app.map.pos?.lat || 40.71;
        const lng = this.app.map.pos?.lng || -74.00;
        if (tab === 'nearby') await this._renderNearby(el, lat, lng);
        else if (tab === 'season') await this._renderInSeason(el, lat, lng);
        else if (tab === 'community') await this._renderCommunity(el, lat, lng);
        else if (tab === 'foryou') await this._renderForYou(el, lat, lng);
    },

    async _renderNearby(el, lat, lng) {
        const obs = await this.app.inat.nearbyObservations(lat, lng, { limit: 40, days: 7 });
        if (!obs.length) { el.innerHTML = this._emptyState('No observations found nearby in the last 7 days.'); return; }
        el.innerHTML = '<div class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Community Sightings — Last 7 Days</div>' + obs.map(o => this._obsCard(o)).join('');
    },

    async _renderInSeason(el, lat, lng) {
        const species = await this.app.inat.seasonalSpecies(lat, lng, { limit: 80 });
        if (!species.length) { el.innerHTML = this._emptyState('No seasonal data found for your location.'); return; }
        const season = this.app.data.currentSeason();
        el.innerHTML = '<div class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">' + season.icon + ' ' + season.name + ' — Species Active Near You</div>' +
            '<div class="grid grid-cols-2 gap-3">' + species.map(s => this._speciesCard(s)).join('') + '</div>';
    },

    async _renderCommunity(el, lat, lng) {
        const obs = await this.app.inat.nearbyObservations(lat, lng, { limit: 60, days: 30 });
        if (!obs.length) { el.innerHTML = this._emptyState('No community observations found nearby.'); return; }
        el.innerHTML = '<div class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Community — Last 30 Days</div>' + obs.map(o => this._obsCard(o)).join('');
    },

    async _renderForYou(el, lat, lng) {
        const catalogued = new Set(Object.keys(this.app.state.catalogue).map(Number));
        const allSpecies = await this.app.inat.seasonalSpecies(lat, lng, { limit: 100 });
        const newSpecies = allSpecies.filter(s => !catalogued.has(s.id));
        const breakdown = this.app.journal.getTaxaBreakdown();
        const topTaxon = breakdown[0]?.iconic || 'Aves';
        el.innerHTML = '';
        if (breakdown.length) {
            const topLabel = this.app.inat.iconicLabel(topTaxon);
            el.innerHTML += '<div class="bg-brand/5 dark:bg-brand/10 rounded-2xl p-4 border border-brand/20 mb-2">' +
                '<div class="text-xs font-black uppercase tracking-wider text-brand mb-1">Your Focus</div>' +
                '<p class="text-sm text-gray-700 dark:text-gray-300">You love ' + topLabel + 's! Here are new ' + topLabel + 's to find:</p></div>';
        }
        const focused = newSpecies.filter(s => !breakdown.length || s.iconic === topTaxon).slice(0, 20);
        const display = focused.length ? focused : newSpecies.slice(0, 20);
        if (!display.length) { el.innerHTML += this._emptyState("You're a local expert! You've seen most species in your area."); return; }
        el.innerHTML += '<div class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">New Species To Find</div>' +
            '<div class="grid grid-cols-2 gap-3">' + display.map(s => this._speciesCard(s)).join('') + '</div>';
    },

    _obsCard(o) {
        const name = o.taxon?.preferred_common_name || o.taxon?.name || 'Unknown';
        const photo = o.photos?.[0]?.url?.replace('square', 'small');
        const emoji = this.app.inat.iconicEmoji(o.taxon?.iconic_taxon_name);
        const taxonId = o.taxon?.id || 0;
        return '<button onclick="app.ui.openSpeciesDetail(' + taxonId + ')" class="obs-card w-full text-left">' +
            (photo ? '<img src="' + photo + '" class="obs-card-img" loading="lazy">' : '<div class="obs-card-img bg-brand/10 rounded-2xl flex items-center justify-center text-3xl">' + emoji + '</div>') +
            '<div class="flex-1 min-w-0">' +
            '<div class="font-bold text-sm text-gray-900 dark:text-white truncate">' + name + '</div>' +
            '<div class="text-xs text-gray-400 italic truncate">' + (o.taxon?.name || '') + '</div>' +
            '<div class="text-[10px] text-gray-400 mt-1">' + (o.place_guess || '') + '</div>' +
            (o.user?.login ? '<div class="text-[10px] text-brand mt-0.5 font-semibold">@' + o.user.login + '</div>' : '') +
            '<div class="text-[10px] text-gray-400">' + (o.observed_on || '') + '</div>' +
            '</div></button>';
    },

    _speciesCard(s) {
        const rarityClass = s.rarity === 'Common' ? 'bg-green-100 text-green-700' : s.rarity === 'Uncommon' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
        return '<button onclick="app.ui.openSpeciesDetail(' + s.id + ')" class="flex flex-col bg-surface-light dark:bg-surface-dark rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700 active:scale-98 transition-all text-left shadow-sm">' +
            '<div class="aspect-square overflow-hidden"><img src="' + (s.squareImg || s.img || '') + '" class="w-full h-full object-cover" loading="lazy"></div>' +
            '<div class="p-2.5">' +
            '<div class="font-bold text-xs text-gray-900 dark:text-white truncate">' + s.name + '</div>' +
            '<div class="text-[10px] text-gray-400 italic truncate">' + (s.sciName || '') + '</div>' +
            '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-1 inline-block ' + rarityClass + '">' + s.rarity + '</span>' +
            '</div></button>';
    },

    _emptyState(msg) {
        return '<div class="text-center py-12 text-gray-400"><div class="text-5xl mb-3">🌿</div><p class="font-semibold text-sm">' + msg + '</p></div>';
    },

    _setDiscoverTab(tab) {
        document.querySelectorAll('.discover-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    },

    switchDiscoverTab(tab) { this.renderDiscover(tab); },

    async openSpeciesDetail(taxonId) {
        if (!taxonId) return;
        const panel = document.getElementById('panel-species-detail');
        const content = document.getElementById('species-detail-content');
        if (!panel || !content) return;
        panel.style.transform = 'translateX(0)';
        panel.classList.add('panel-active');
        content.innerHTML = '<div class="flex items-center justify-center py-20 text-gray-400 gap-2"><span class="material-symbols-rounded animate-spin">progress_activity</span></div>';
        const taxon = await this.app.inat.getTaxon(taxonId);
        if (!taxon) { content.innerHTML = '<div class="p-8 text-center text-gray-400">Species not found.</div>'; return; }
        const heroImg = taxon.default_photo?.medium_url || taxon.taxon_photos?.[0]?.photo?.medium_url || '';
        const commonName = taxon.preferred_common_name || taxon.name;
        const iconic = taxon.iconic_taxon_name;
        const cat = this.app.state.catalogue[taxonId];
        const inCatalogue = !!cat;
        const wikiSummary = taxon.wikipedia_summary || '';
        const status = taxon.conservation_status?.status_name || '';
        let photosHtml = '';
        if (taxon.taxon_photos && taxon.taxon_photos.length > 1) {
            photosHtml = '<div><div class="text-xs font-black uppercase tracking-wider text-gray-400 mb-2">More Photos</div>' +
                '<div class="flex gap-2 overflow-x-auto hide-scrollbar">' +
                taxon.taxon_photos.slice(0,6).map(tp => '<img src="' + (tp.photo.square_url || tp.photo.url || '') + '" class="w-20 h-20 rounded-xl object-cover shrink-0">').join('') +
                '</div></div>';
        }
        content.innerHTML =
            '<div class="relative">' +
            (heroImg ? '<img src="' + heroImg + '" class="species-hero">' : '<div class="species-hero bg-brand/10 flex items-center justify-center text-8xl">' + this.app.inat.iconicEmoji(iconic) + '</div>') +
            '<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">' +
            '<h1 class="text-2xl font-black text-white">' + commonName + '</h1>' +
            '<p class="text-white/80 text-sm italic">' + taxon.name + '</p></div></div>' +
            '<div class="p-4 space-y-4">' +
            '<div class="flex flex-wrap gap-2">' +
            '<span class="species-stat-pill bg-brand/10 text-brand">' + this.app.inat.iconicEmoji(iconic) + ' ' + this.app.inat.iconicLabel(iconic) + '</span>' +
            (inCatalogue ? '<span class="species-stat-pill bg-green-100 text-green-700">✓ In My Catalogue · ' + cat.count + 'x</span>' : '') +
            (status ? '<span class="species-stat-pill bg-amber-100 text-amber-700">⚠️ ' + status + '</span>' : '') +
            '</div>' +
            (wikiSummary ? '<div class="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4"><div class="text-xs font-black uppercase tracking-wider text-gray-400 mb-2">About</div><p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">' + wikiSummary.replace(/<[^>]+>/g,'').substring(0,600) + (wikiSummary.length > 600 ? '…' : '') + '</p></div>' : '') +
            photosHtml +
            '<button onclick="app.ui.openLogObservation(' + taxonId + ')" class="w-full bg-brand text-white py-4 rounded-2xl font-black text-base shadow-lg shadow-brand/30 active:scale-95 transition-transform">' +
            '<span class="material-symbols-rounded align-middle mr-1">add_a_photo</span>' +
            (inCatalogue ? 'Log Another Sighting' : 'Log This Sighting') + '</button></div>';
    },

    closeSpeciesDetail() {
        const panel = document.getElementById('panel-species-detail');
        if (panel) { panel.style.transform = 'translateX(100%)'; panel.classList.remove('panel-active'); }
    },

    openObsDetail(obsId) {
        const obs = this.app.state.observations.find(o => o.id === obsId);
        const panel = document.getElementById('panel-obs-detail');
        const content = document.getElementById('obs-detail-content');
        if (!panel || !content || !obs) return;
        panel.style.transform = 'translateX(0)';
        panel.classList.add('panel-active');
        const d = new Date(obs.date);
        const dateStr = d.toLocaleDateString();
        const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const rarityClass = obs.rarity === 'Common' ? 'bg-green-100 text-green-700' : obs.rarity === 'Uncommon' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
        content.innerHTML =
            '<div class="relative">' +
            (obs.photo ? '<img src="' + obs.photo + '" class="species-hero">' : '<div class="species-hero bg-brand/10 flex items-center justify-center text-8xl">' + this.app.inat.iconicEmoji(obs.iconic) + '</div>') +
            '<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">' +
            '<h1 class="text-2xl font-black text-white">' + obs.speciesName + '</h1>' +
            '<p class="text-white/80 text-sm">' + dateStr + ' · ' + timeStr + '</p></div></div>' +
            '<div class="p-4 space-y-3">' +
            '<div class="flex flex-wrap gap-2">' +
            '<span class="species-stat-pill bg-brand/10 text-brand">' + this.app.inat.iconicEmoji(obs.iconic) + ' ' + this.app.inat.iconicLabel(obs.iconic) + '</span>' +
            '<span class="species-stat-pill bg-amber-100 text-amber-700">+' + obs.dp + ' DP</span>' +
            '<span class="species-stat-pill ' + rarityClass + '">' + obs.rarity + '</span></div>' +
            (obs.habitat ? '<div class="text-sm text-gray-600 dark:text-gray-300"><span class="font-bold">Habitat:</span> ' + obs.habitat + '</div>' : '') +
            (obs.count > 1 ? '<div class="text-sm text-gray-600 dark:text-gray-300"><span class="font-bold">Count:</span> ' + obs.count + '</div>' : '') +
            (obs.notes ? '<div class="bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 text-sm text-gray-700 dark:text-gray-300">' + obs.notes + '</div>' : '') +
            '<button onclick="app.ui.openSpeciesDetail(' + obs.taxonId + ')" class="w-full border border-brand text-brand py-3 rounded-2xl font-bold text-sm active:scale-95 transition-transform">View Species Info</button></div>';
    },

    closeObsDetail() {
        const panel = document.getElementById('panel-obs-detail');
        if (panel) { panel.style.transform = 'translateX(100%)'; panel.classList.remove('panel-active'); }
    },

    openLogObservation(preselectTaxonId) {
        const modal = document.getElementById('logObsModal');
        const content = document.getElementById('logObsContent');
        if (!modal) return;
        this.app.journal.currentImage = null;
        const preview = document.getElementById('obs-image-preview');
        const placeholder = document.getElementById('obs-image-placeholder');
        if (preview) { preview.classList.add('hidden'); preview.src = ''; }
        if (placeholder) placeholder.classList.remove('hidden');
        const specBtn = document.getElementById('obs-species-btn');
        if (specBtn) { specBtn.textContent = 'Select species…'; delete specBtn.dataset.id; delete specBtn.dataset.name; delete specBtn.dataset.iconic; }
        const notes = document.getElementById('obs-notes');
        if (notes) notes.value = '';
        const count = document.getElementById('obs-count');
        if (count) count.value = '1';
        modal.classList.remove('pointer-events-none', 'opacity-0', 'hidden');
        modal.classList.add('opacity-100');
        if (content) content.classList.remove('translate-y-full');
        if (preselectTaxonId) {
            const species = (this.app.localSpecies || []).find(s => s.id == preselectTaxonId);
            if (species && specBtn) { specBtn.textContent = species.name; specBtn.dataset.id = species.id; specBtn.dataset.name = species.name; specBtn.dataset.iconic = species.iconic || ''; }
        }
    },

    closeLogObservation() {
        const modal = document.getElementById('logObsModal');
        const content = document.getElementById('logObsContent');
        if (!modal) return;
        modal.classList.add('opacity-0');
        if (content) content.classList.add('translate-y-full');
        setTimeout(() => modal.classList.add('pointer-events-none', 'hidden'), 320);
    },

    openSpeciesSelector(targetBtn) {
        this.selectorTarget = targetBtn;
        this.selectorActiveFilter = 'all';
        this._renderSpeciesSelectorTabs();
        this._renderSpeciesSelectorBody();
        const modal = document.getElementById('species-select-modal');
        const content = document.getElementById('species-select-content');
        if (!modal) return;
        modal.classList.remove('pointer-events-none', 'opacity-0', 'hidden');
        modal.classList.add('opacity-100');
        if (content) content.classList.remove('translate-y-full');
    },

    closeSpeciesSelector() {
        const modal = document.getElementById('species-select-modal');
        const content = document.getElementById('species-select-content');
        if (!modal) return;
        modal.classList.add('opacity-0');
        if (content) content.classList.add('translate-y-full');
        setTimeout(() => modal.classList.add('pointer-events-none', 'hidden'), 320);
    },

    _renderSpeciesSelectorTabs() {
        const el = document.getElementById('species-selector-tabs');
        if (!el) return;
        const groups = ['All', 'Aves', 'Plantae', 'Mammalia', 'Insecta', 'Reptilia', 'Amphibia'];
        el.innerHTML = groups.map(g => {
            const filter = g === 'All' ? 'all' : g;
            const isActive = this.selectorActiveFilter === filter;
            const label = g === 'All' ? 'All' : this.app.inat.iconicEmoji(g) + ' ' + this.app.inat.iconicLabel(g);
            return '<button onclick="app.ui._setSpeciesFilter(\'' + g + '\')" class="discover-tab ' + (isActive ? 'active' : '') + '" data-filter="' + filter + '">' + label + '</button>';
        }).join('');
    },

    _setSpeciesFilter(group) {
        this.selectorActiveFilter = group === 'All' ? 'all' : group;
        this._renderSpeciesSelectorTabs();
        this._renderSpeciesSelectorBody();
    },

    _renderSpeciesSelectorBody() {
        const el = document.getElementById('species-selector-body');
        if (!el) return;
        const q = (document.getElementById('species-selector-search')?.value || '').toLowerCase();
        let species = this.app.localSpecies || [];
        if (this.selectorActiveFilter !== 'all') species = species.filter(s => s.iconic === this.selectorActiveFilter);
        if (q) species = species.filter(s => s.name.toLowerCase().includes(q) || (s.sciName || '').toLowerCase().includes(q));
        if (!species.length) { el.innerHTML = '<div class="text-center py-8 text-gray-400"><p class="text-sm">No species found</p></div>'; return; }
        el.innerHTML = species.map(s => {
            const rc = s.rarity === 'Common' ? 'bg-green-100 text-green-700' : s.rarity === 'Uncommon' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
            return '<button onclick="app.ui._selectSpecies(' + s.id + ')" class="w-full flex items-center gap-3 p-3 rounded-xl bg-surface-light dark:bg-surface-dark border border-gray-100 dark:border-gray-700 active:scale-98 transition-all">' +
                '<img src="' + (s.squareImg || s.img || '') + '" class="w-12 h-12 rounded-xl object-cover shrink-0" loading="lazy">' +
                '<div class="flex-1 min-w-0 text-left"><div class="font-bold text-sm text-gray-900 dark:text-white truncate">' + s.name + '</div>' +
                '<div class="text-xs text-gray-400 italic truncate">' + (s.sciName || '') + '</div></div>' +
                '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ' + rc + '">' + s.rarity + '</span></button>';
        }).join('');
    },

    _selectSpecies(id) {
        const species = (this.app.localSpecies || []).find(s => s.id == id);
        if (!species || !this.selectorTarget) return;
        this.selectorTarget.textContent = species.name;
        this.selectorTarget.dataset.id = species.id;
        this.selectorTarget.dataset.name = species.name;
        this.selectorTarget.dataset.iconic = species.iconic || '';
        this.closeSpeciesSelector();
    },

    showObsSuccess(obs, newBadges) {
        newBadges = newBadges || [];
        const modal = document.getElementById('obsSuccessModal');
        const card = document.getElementById('obsSuccessCard');
        if (!modal) return;
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('success-species-name', obs.speciesName);
        set('success-dp', obs.dp);
        set('success-rarity', obs.rarity + ' · ' + this.app.inat.iconicLabel(obs.iconic));
        const badgesEl = document.getElementById('success-new-badges');
        const badgesList = document.getElementById('success-badges-list');
        if (newBadges.length && badgesEl && badgesList) {
            badgesEl.classList.remove('hidden');
            badgesList.innerHTML = newBadges.map(b => '<span class="bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded-full text-xs font-bold text-amber-700 dark:text-amber-300">' + b.icon + ' ' + b.name + '</span>').join('');
        } else if (badgesEl) { badgesEl.classList.add('hidden'); }
        modal.classList.remove('pointer-events-none', 'opacity-0', 'hidden');
        modal.classList.add('opacity-100');
        if (card) { card.classList.remove('scale-90'); card.classList.add('scale-100'); }
        try { if (typeof confetti !== 'undefined') confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ['#2d6a4f','#52b788','#e9c46a','#d8f3dc'] }); } catch(e) {}
    },

    closeObsSuccess() {
        const modal = document.getElementById('obsSuccessModal');
        const card = document.getElementById('obsSuccessCard');
        if (!modal) return;
        modal.classList.add('opacity-0');
        if (card) { card.classList.add('scale-90'); card.classList.remove('scale-100'); }
        setTimeout(() => modal.classList.add('pointer-events-none', 'hidden'), 320);
        this.renderHUDStats();
    },

    openKGModal() {
        if (this.app.identify) this.app.identify.startKnowledgeGraph();
        const modal = document.getElementById('kgModal');
        const inner = modal?.querySelector('.rounded-t-3xl');
        if (!modal) return;
        modal.classList.remove('pointer-events-none', 'opacity-0', 'hidden');
        modal.classList.add('opacity-100');
        if (inner) inner.classList.remove('translate-y-full');
    },

    closeKGModal() {
        const modal = document.getElementById('kgModal');
        const inner = modal?.querySelector('.rounded-t-3xl');
        if (!modal) return;
        modal.classList.add('opacity-0');
        if (inner) inner.classList.add('translate-y-full');
        setTimeout(() => modal.classList.add('pointer-events-none', 'hidden'), 320);
        if (this.app.identify?.stopAudio) this.app.identify.stopAudio();
    },

    openAudioId() {
        const modal = document.getElementById('audioIdModal');
        const inner = modal?.querySelector('.rounded-t-3xl');
        if (!modal) return;
        modal.classList.remove('pointer-events-none', 'opacity-0', 'hidden');
        modal.classList.add('opacity-100');
        if (inner) inner.classList.remove('translate-y-full');
    },

    closeAudioId() {
        if (this.app.identify?.stopAudio) this.app.identify.stopAudio();
        const modal = document.getElementById('audioIdModal');
        const inner = modal?.querySelector('.rounded-t-3xl');
        if (!modal) return;
        modal.classList.add('opacity-0');
        if (inner) inner.classList.add('translate-y-full');
        setTimeout(() => modal.classList.add('pointer-events-none', 'hidden'), 320);
        const content = document.getElementById('audio-id-content');
        if (content) content.innerHTML = '<div class="flex flex-col items-center gap-5 py-6"><div class="text-6xl">🐦</div><h3 class="text-xl font-black text-center">Ready to Listen</h3><p class="text-sm text-gray-500 text-center max-w-xs">Point your phone toward birds you hear. We\'ll record and analyse the audio.</p><button onclick="app.identify.startAudioId()" class="bg-brand text-white px-10 py-4 rounded-2xl font-black text-lg shadow-lg shadow-brand/30 active:scale-95 transition-transform"><span class="material-symbols-rounded align-middle mr-1">mic</span> Start Listening</button></div>';
    },

    setJournalFilter(btn) {
        document.querySelectorAll('.journal-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (this.app.journal && this.app.journal._renderTimeline) this.app.journal._renderTimeline();
    },

    toggleMapLayers() {
        if (!this.app.map) return;
        const m = this.app.map;
        const btn = document.getElementById('map-layer-toggle');
        if (m.map.hasLayer(m.communityLayer)) {
            m.map.removeLayer(m.communityLayer);
            if (btn) btn.title = 'Show community observations';
        } else {
            m.communityLayer.addTo(m.map);
            if (btn) btn.title = 'Hide community observations';
        }
    },

    confirmClearData() {
        if (confirm('Are you sure? All observations, species, and progress will be permanently deleted.')) {
            localStorage.removeItem('EDE_State_V4');
            window.location.reload();
        }
    },

    showToast(msg, duration) {
        duration = duration || 2500;
        const ctr = document.getElementById('toast-container');
        if (!ctr) return;
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        ctr.appendChild(t);
        setTimeout(() => {
            t.style.opacity = '0';
            t.style.transform = 'translateY(8px)';
            t.style.transition = 'all 0.3s';
            setTimeout(() => t.remove(), 310);
        }, duration);
    }
};
