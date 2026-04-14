export const ui = {
    editingProfile: false, selectorTarget: null, lastLoggedSpecies: null, fieldGuideView: 'grid',
    avatars: ['🌳', '🦋', '🦉', '🦊', '🐻', '🐝', '🐞', '🐢', '🐍', '🐸', '🐿️', '🦔'],
    
    init(app) {
        this.app = app;
    },

    openPanel(id) {
        const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
        const currentlyOpen = document.querySelector('.panel-active');
        const panelToOpen = document.getElementById(id);

        if (currentlyOpen) {
            currentlyOpen.classList.remove('panel-active');
            if (!isDesktop) currentlyOpen.classList.add('translate-x-full');
        }
        
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        if (currentlyOpen !== panelToOpen && id !== 'map') {
            panelToOpen.classList.add('panel-active');
            if (!isDesktop) panelToOpen.classList.remove('translate-x-full');
            
            const navBtn = document.querySelector(`.nav-btn[onclick*="${id}"]`);
            if (navBtn) navBtn.classList.add('active');
            
            if (id === 'panel-fieldGuide') this.renderFieldGuide();
            if (id === 'panel-inventory') this.renderInventory();
            if (id === 'panel-rewards') this.renderRewards();
            if (id === 'panel-shop') this.renderShop();
            if (id === 'panel-achievements') this.renderAchievements();
            if (id === 'panel-social') {
                this.app.multiplayer.updateUI();
                this.app.multiplayer.updateList();
                this.app.multiplayer.updateFeedUI();
            }
        } else {
            const mapBtn = document.getElementById('nav-btn-map');
            if (mapBtn) mapBtn.classList.add('active');
        }

        if (isDesktop) {
            document.body.classList.toggle('desktop-panel-open', !!document.querySelector('.panel-active'));
            // Force map to re-evaluate its size
            setTimeout(() => {
                if (this.app.map && this.app.map.map) this.app.map.map.invalidateSize();
            }, 350);
        }
        
        const recenterBtn = document.getElementById('recenter-btn-container');
        if (recenterBtn) {
            if (!isDesktop && id === 'map') {
                recenterBtn.classList.remove('opacity-0', 'pointer-events-none');
            } else {
                recenterBtn.classList.add('opacity-0', 'pointer-events-none');
            }
        }

        if (!isDesktop && this.app.haptics) this.app.haptics.vibrate();
    },
    
    toggleProfileEdit(save = false) {
        this.editingProfile = save ? false : !this.editingProfile;
        const ctr = document.getElementById('username-container');
        if (!ctr) return;
        
        if (this.editingProfile) {
            ctr.innerHTML = `<input id="username-input" class="text-2xl font-black text-center w-full border-b-2 border-brand bg-transparent outline-none dark:text-white" value="${this.app.state.username}">`;
            const avSelection = document.getElementById('avatar-selection-container');
            if (avSelection) avSelection.classList.remove('hidden');
            this.renderAvatars();
        } else {
            const val = document.getElementById('username-input')?.value;
            if (val) this.app.state.username = val;
            ctr.innerHTML = `<h3 id="profile-username" class="text-2xl font-black text-center truncate px-4 dark:text-white">${this.app.state.username}</h3>`;
            const avSelection = document.getElementById('avatar-selection-container');
            if (avSelection) avSelection.classList.add('hidden');
            this.app.saveState();
        }
    },
    
    renderAvatars() {
        const avOpts = document.getElementById('avatar-options');
        if (!avOpts) return;
        avOpts.innerHTML = this.avatars.map(a => 
            `<button class="text-2xl p-2 rounded-xl transition-all ${this.app.state.avatar === a ? 'bg-brand scale-110 shadow-md' : 'bg-gray-100 dark:bg-gray-800'}" onclick="app.ui.setAvatar('${a}')">${a}</button>`
        ).join('');
    },
    setAvatar(a) {
        this.app.state.avatar = a;
        const avEmoji = document.getElementById('profile-avatar-emoji');
        if (avEmoji) avEmoji.innerText = a;
        this.renderAvatars();
        this.app.saveState();
    },
    animateAvatar() { 
        const el = document.getElementById('profile-avatar-container');
        if (!el) return;
        el.classList.add('avatar-pop'); 
        setTimeout(() => el.classList.remove('avatar-pop'), 400); 
    },

    renderTabs(id, data, fn) {
        const cats = ['All', ...new Set(data.map(s => s.category).filter(Boolean))].sort();
        const ctr = document.getElementById(id);
        if (!ctr) return;
        
        ctr.innerHTML = cats.map(c => `<button class="tab-btn px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-colors ${c === 'All' ? 'bg-brand text-white border-brand' : 'bg-white dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700'}" data-c="${c}">${c}</button>`).join('');
        ctr.querySelectorAll('button').forEach(b => b.onclick = (e) => {
            ctr.querySelectorAll('button').forEach(x => x.className = x.className.replace('bg-brand text-white border-brand', 'bg-white dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700'));
            e.target.className = e.target.className.replace('bg-white dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700', 'bg-brand text-white border-brand');
            fn();
        });
    },

    setFieldGuideView(view) {
        this.fieldGuideView = view;
        const gridViewBtn = document.getElementById('grid-view-btn');
        const listViewBtn = document.getElementById('list-view-btn');
        const gridBody = document.getElementById('fieldguide-body');
        if (!gridViewBtn || !listViewBtn || !gridBody) return;

        if (view === 'grid') {
            gridViewBtn.classList.add('bg-brand', 'text-white');
            listViewBtn.classList.remove('bg-brand', 'text-white');
            gridBody.classList.remove('grid-cols-1');
            gridBody.classList.add('grid-cols-2', 'sm:grid-cols-2', 'md:grid-cols-3', 'lg:grid-cols-4');
        } else { // list
            listViewBtn.classList.add('bg-brand', 'text-white');
            gridViewBtn.classList.remove('bg-brand', 'text-white');
            gridBody.classList.remove('grid-cols-2', 'sm:grid-cols-2', 'md:grid-cols-3', 'lg:grid-cols-4');
            gridBody.classList.add('grid-cols-1');
        }
        this.renderFieldGuide(true);
    },

    renderGrid(id, data, searchId, tabsId, isSelector = false) {
        const grid = document.getElementById(id);
        if (!grid) return;
        
        const searchInput = document.getElementById(searchId);
        const term = searchInput ? searchInput.value.toLowerCase() : "";
        
        const tabs = document.getElementById(tabsId);
        const activeCat = tabs ? (tabs.querySelector('button.bg-brand')?.dataset.c || 'All') : 'All';
        
        let filtered = data.filter(s => (activeCat === 'All' || s.category === activeCat) && s.name.toLowerCase().includes(term));
        
        // Apply Wizard filter if active
        if (id === 'fieldguide-body' && this.wizardFilter) {
            filtered = filtered.filter(s => {
                if (this.wizardFilter.category && s.category !== this.wizardFilter.category) return false;
                // You can add more complex filtering here
                return true;
            });
        }

        if (filtered.length === 0) {
            grid.innerHTML = `<div class="col-span-full text-center py-12">
                <span class="material-symbols-rounded text-6xl text-gray-200 dark:text-gray-700 mb-4">search_off</span>
                <p class="text-gray-400">No species found matching your filters.</p>
                ${this.wizardFilter ? '<button onclick="app.ui.clearWizardFilter()" class="mt-4 text-brand font-bold">Clear Filters</button>' : ''}
            </div>`;
            return;
        }
        
        const isListView = this.fieldGuideView === 'list' && id === 'fieldguide-body';

        grid.innerHTML = filtered.map(s => {
            const owned = this.app.state.speciesData[s.id];
            const locked = !owned;
            
            if (isListView) {
                const listImg = `<div class="w-14 h-14 shrink-0 rounded-2xl bg-gray-200 dark:bg-gray-800 bg-cover bg-center border border-gray-100 dark:border-gray-700" style="background-image: url('${s.img}');"></div>`;
                return `
                    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 flex items-center gap-4 ${locked ? 'grayscale opacity-70' : ''} active:scale-95 transition-transform" onclick="app.ui.openDetail(${s.id})">
                        ${listImg}
                        <div class="flex-1">
                            <h4 class="font-bold text-sm dark:text-white">${locked ? '???' : s.name}</h4>
                            <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">${s.category}</div>
                            <div class="text-[10px] text-gray-400 mt-1">${locked ? 'Not yet discovered' : `Sighted ${owned.count}x`}</div>
                        </div>
                        <span class="material-symbols-rounded text-gray-300">chevron_right</span>
                    </div>`;
            }

            const rarityColor = s.rarity === 'Rare' ? 'bg-purple-500' : s.rarity === 'Uncommon' ? 'bg-blue-500' : 'bg-gray-500';

            if (isSelector) return `
                <div class="species-card active:scale-95 transition-transform" onclick="app.ui.pickSpecies(${s.id})">
                    <img src="${s.img}" class="card-img-height">
                    <div class="species-card-info">
                        <h4 class="species-card-title truncate">${s.name}</h4>
                        <div class="species-card-subtitle">${s.category}</div>
                    </div>
                </div>`;
                
            if (id === 'inventory-body') return `
                <div class="bg-white dark:bg-gray-800 p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex gap-4 items-center active:scale-95 transition-transform" onclick="app.ui.openDetail(${s.id})">
                    <div class="w-20 h-20 rounded-2xl bg-cover bg-center shrink-0 border border-gray-100 dark:border-gray-700 shadow-inner" style="background-image: url('${s.img}');"></div>
                    <div class="flex-1">
                        <h4 class="font-bold text-lg dark:text-white leading-tight">${s.name}</h4>
                        <div class="text-xs font-bold text-brand uppercase tracking-wider">${s.category}</div>
                        <div class="mt-1"><span class="bg-brand-light dark:bg-brand-dark/30 text-brand px-2 py-0.5 rounded-lg text-[10px] font-black uppercase">Level ${owned.level || 1}</span></div>
                    </div>
                    <div class="text-right">
                        <div class="text-xs font-black text-gray-300 uppercase">Count</div>
                        <div class="text-xl font-black text-brand">${owned.count}</div>
                    </div>
                </div>`;
                
            return `
                <div class="species-card relative ${locked ? 'locked' : ''}" onclick="app.ui.openDetail(${s.id})">
                    ${s.rarity !== 'Common' ? `<div class="rarity-badge ${rarityColor}">${s.rarity}</div>` : ''}
                    <img src="${s.img}" class="card-img-height" alt="${s.name}">
                    <div class="species-card-info">
                        <h4 class="species-card-title truncate">${locked ? '???' : s.name}</h4>
                        <div class="species-card-subtitle">${locked ? 'Undiscovered' : s.category}</div>
                        ${!locked ? `<div class="w-full h-1 bg-gray-100 dark:bg-gray-700 rounded-full mt-1 overflow-hidden"><div class="h-full bg-brand" style="width: ${Math.min((owned.count / 10) * 100, 100)}%"></div></div>` : ''}
                    </div>
                </div>`;
        }).join('');
    },

    // --- WIZARD LOGIC ---
    wizardStep: 1,
    wizardFilter: null,
    
    openWizard() {
        this.wizardStep = 1;
        this.wizardFilter = {};
        const m = document.getElementById('wizardModal');
        if (!m) return;
        m.classList.remove('pointer-events-none', 'opacity-0');
        const content = m.querySelector('div[id]');
        if (content) content.classList.remove('translate-y-full');
        this.renderWizard();
    },
    
    closeWizard() {
        const m = document.getElementById('wizardModal');
        if (!m) return;
        m.classList.add('pointer-events-none', 'opacity-0');
        const content = m.querySelector('div[id]');
        if (content) content.classList.add('translate-y-full');
    },

    renderWizard() {
        const body = document.getElementById('wizard-body');
        const prog = document.getElementById('wizard-progress');
        const backBtn = document.getElementById('wizard-back');
        const nextBtn = document.getElementById('wizard-next');
        
        if (!body || !prog) return;

        backBtn.classList.toggle('hidden', this.wizardStep === 1);
        nextBtn.innerText = this.wizardStep === 3 ? 'Show Matches' : 'Next';
        
        prog.innerHTML = [1, 2, 3].map(i => `
            <div class="h-1.5 flex-1 rounded-full transition-colors ${i <= this.wizardStep ? 'bg-brand' : 'bg-gray-200 dark:bg-gray-700'}"></div>
        `).join('');

        if (this.wizardStep === 1) {
            const categories = [
                { id: 'Plantae', name: 'Flora', icon: 'forest' },
                { id: 'Aves', name: 'Birds', icon: 'nest_multi_room' },
                { id: 'Insecta', name: 'Bugs', icon: 'pest_control' },
                { id: 'Mammalia', name: 'Mammals', icon: 'pets' },
                { id: 'Amphibia', name: 'Reptiles', icon: 'cruelty_free' }
            ];
            
            body.innerHTML = `
                <div class="wizard-step">
                    <h3 class="text-2xl font-black mb-1">Step 1</h3>
                    <p class="text-gray-500 mb-6 font-medium">What general group does it belong to?</p>
                    <div class="grid grid-cols-2 gap-4">
                        ${categories.map(c => `
                            <button class="category-btn ${this.wizardFilter.category === c.id ? 'active' : ''}" onclick="app.ui.wizardSelect('category', '${c.id}')">
                                <span class="material-symbols-rounded text-4xl text-brand">${c.icon}</span>
                                <span class="font-bold text-sm">${c.name}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>`;
        } else if (this.wizardStep === 2) {
            const vibes = {
                'Aves': ['Songbird', 'Raptor', 'Water Bird', 'Woodpecker'],
                'Plantae': ['Wildflower', 'Tree', 'Bush/Shrub', 'Fern'],
                'Insecta': ['Butterfly', 'Beetle', 'Bee/Wasp', 'Spider'],
                'Mammalia': ['Rodent', 'Deer', 'Canine/Feline'],
                'Amphibia': ['Frog/Toad', 'Lizard', 'Snake', 'Turtle']
            };
            const currentVibes = vibes[this.wizardFilter.category] || ['Small', 'Medium', 'Large'];

            body.innerHTML = `
                <div class="wizard-step">
                    <h3 class="text-2xl font-black mb-1">Step 2</h3>
                    <p class="text-gray-500 mb-6 font-medium">What's the vibe or general shape?</p>
                    <div class="flex flex-wrap gap-2">
                        ${currentVibes.map(v => `
                            <button class="px-6 py-3 rounded-2xl font-bold border-2 transition-all ${this.wizardFilter.vibe === v ? 'bg-brand text-white border-brand' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'}" onclick="app.ui.wizardSelect('vibe', '${v}')">${v}</button>
                        `).join('')}
                    </div>
                </div>`;
        } else if (this.wizardStep === 3) {
            const matches = this.app.localSpecies.filter(s => s.category === this.wizardFilter.category).length;
            body.innerHTML = `
                <div class="wizard-step text-center py-8">
                    <div class="w-24 h-24 bg-brand-light text-brand rounded-full flex items-center justify-center mx-auto mb-6">
                        <span class="material-symbols-rounded text-5xl">fact_check</span>
                    </div>
                    <h3 class="text-3xl font-black mb-2">${matches} Matches!</h3>
                    <p class="text-gray-500 font-medium">We've narrowed down the local species for you. Ready to see them?</p>
                </div>`;
        }
    },

    wizardSelect(key, val) {
        this.wizardFilter[key] = val;
        this.renderWizard();
        if (key === 'category' && this.wizardStep === 1) setTimeout(() => this.wizardNext(), 300);
    },
    
    wizardNext() {
        if (this.wizardStep === 3) {
            this.closeWizard();
            this.renderFieldGuide(true);
            return;
        }
        this.wizardStep++;
        this.renderWizard();
    },
    
    wizardPrev() {
        if (this.wizardStep > 1) {
            this.wizardStep--;
            this.renderWizard();
        }
    },

    clearWizardFilter() {
        this.wizardFilter = null;
        this.renderFieldGuide(true);
    },

    async renderFieldGuide(refresh = false) {
        if (!refresh && !this.app.localSpecies.length) { 
            const fgBody = document.getElementById('fieldguide-body');
            if (fgBody) fgBody.innerHTML = '<div class="col-span-full text-center mt-10"><div class="animate-spin inline-block w-8 h-8 border-4 border-brand border-t-transparent rounded-full"></div><div class="mt-2 text-gray-400">Locating species...</div></div>';
            await this.app.data.fetchSpecies(this.app); 
        }
        const count = Object.keys(this.app.state.speciesData).length;
        const progFill = document.getElementById('fieldguide-progress-fill');
        if (progFill) progFill.style.width = `${(count / (this.app.localSpecies.length || 1)) * 100}%`;
        const progText = document.getElementById('fieldguide-progress-text');
        if (progText) progText.innerText = `${count} / ${this.app.localSpecies.length}`;
        
        this.renderTabs('fieldguide-tabs', this.app.localSpecies, () => this.renderGrid('fieldguide-body', this.app.localSpecies, 'fieldguide-search', 'fieldguide-tabs'));
        this.renderGrid('fieldguide-body', this.app.localSpecies, 'fieldguide-search', 'fieldguide-tabs');
    },

    async renderInventory() {
        const owned = this.app.localSpecies.filter(s => this.app.state.speciesData[s.id]);
        const invBadge = document.getElementById('inventory-count-badge');
        if (invBadge) invBadge.innerText = `${owned.length} Found`;
        this.renderTabs('inventory-tabs', owned, () => this.renderGrid('inventory-body', owned, 'inventory-search', 'inventory-tabs'));
        this.renderGrid('inventory-body', owned, 'inventory-search', 'inventory-tabs');
    },

    async openDetail(id) {
        const p = document.getElementById('panel-species-detail');
        if (!p) return;
        p.classList.remove('translate-x-full');
        const c = document.getElementById('species-detail-content');
        if (!c) return;
        c.innerHTML = '<div class="flex justify-center mt-20"><div class="animate-spin w-8 h-8 border-4 border-brand border-t-transparent rounded-full"></div></div>';
        
        try {
            const s = (await (await fetch(`https://api.inaturalist.org/v1/taxa/${id}`)).json()).results[0];
            c.innerHTML = `
                <div class="h-72 bg-gray-200 bg-cover bg-center relative" style="background-image: url('${s.default_photo.medium_url}');">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent"></div>
                    <div class="absolute bottom-0 left-0 p-6 text-white w-full">
                        <h2 class="text-4xl font-black leading-tight mb-1">${s.name}</h2>
                        <p class="text-white/80 italic text-xl">${s.preferred_common_name || s.name}</p>
                        <div class="mt-2 text-xs font-mono uppercase opacity-70 tracking-widest">${s.iconic_taxon_name}</div>
                    </div>
                </div>
                <div class="p-6 space-y-10 pb-32">
                    <section>
                        <div class="flex items-center gap-2 mb-3">
                            <span class="material-symbols-rounded text-brand">info</span>
                            <h3 class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">About</h3>
                        </div>
                        <p class="text-lg leading-relaxed dark:text-gray-300">${s.wikipedia_summary || 'No description available for this species.'}</p>
                        <a href="${s.wikipedia_url}" target="_blank" class="inline-block mt-3 text-brand font-bold text-sm hover:underline">Read full article on Wikipedia →</a>
                    </section>
                    
                    <section>
                         <div class="flex items-center gap-2 mb-3">
                            <span class="material-symbols-rounded text-brand">location_on</span>
                            <h3 class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Nearby Activity</h3>
                        </div>
                        <div id="species-map" class="h-64 w-full rounded-3xl bg-gray-100 dark:bg-gray-800 overflow-hidden shadow-inner border border-gray-200 dark:border-gray-700 relative z-0"></div>
                        <div class="mt-4 flex gap-3">
                            <button onclick="app.ui.findSpeciesOnMap(${s.id}, '${s.name}')" class="flex-1 bg-brand text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-brand/20">
                                <span class="material-symbols-rounded">explore</span> Find Nearby
                            </button>
                            <button onclick="app.ui.shareDiscovery()" class="w-14 h-14 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-2xl flex items-center justify-center active:scale-95 transition-transform">
                                <span class="material-symbols-rounded">share</span>
                            </button>
                        </div>
                    </section>

                    <section>
                        <div class="flex items-center gap-2 mb-3">
                            <span class="material-symbols-rounded text-brand">calendar_month</span>
                            <h3 class="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Seasonality</h3>
                        </div>
                        <div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-3xl border border-gray-100 dark:border-gray-700">
                            <div id="seasonality-chart" class="flex justify-between items-end h-32 w-full px-2"></div>
                            <div class="flex justify-between mt-2 text-[10px] font-bold text-gray-400 uppercase px-2">
                                <span>J</span><span>F</span><span>M</span><span>A</span><span>M</span><span>J</span><span>J</span><span>A</span><span>S</span><span>O</span><span>N</span><span>D</span>
                            </div>
                        </div>
                        <p class="text-xs text-gray-400 mt-2 text-center">Taller bars indicate higher activity.</p>
                    </section>
                </div>
            `;
            
            // Map Logic
            setTimeout(async () => {
                const startPos = this.app.map.pos.lat ? [this.app.map.pos.lat, this.app.map.pos.lng] : [s.default_photo.latitude, s.default_photo.longitude];
                const smap = L.map('species-map', { zoomControl: false, attributionControl: false }).setView(startPos, 10);
                
                const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const tileUrl = isDark 
                    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' 
                    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';
                
                L.tileLayer(tileUrl).addTo(smap);

                if (this.app.map.pos.lat) {
                    L.circleMarker(startPos, { radius: 6, color: 'white', fillColor: '#3b82f6', fillOpacity: 1, weight: 2 }).addTo(smap);
                }

                const obs = await (await fetch(`https://api.inaturalist.org/v1/observations?taxon_id=${s.id}&lat=${startPos[0]}&lng=${startPos[1]}&radius=100&per_page=50`)).json();
                obs.results.forEach(o => { 
                    if (o.geojson) L.circleMarker([o.geojson.coordinates[1], o.geojson.coordinates[0]], { 
                        radius: 4, color: 'transparent', fillColor: '#059669', fillOpacity: 0.8 
                    }).addTo(smap); 
                });
                
                smap.invalidateSize();
            }, 100);

            // Seasonality Chart
            const hist = await (await fetch(`https://api.inaturalist.org/v1/observations/histogram?taxon_id=${s.id}&date_field=observed&interval=month_of_year`)).json();
            const months = hist.results.month_of_year;
            const max = Math.max(...Object.values(months));
            const chart = document.getElementById('seasonality-chart');
            if (chart) {
                chart.innerHTML = Array(12).fill(0).map((_, i) => {
                    const val = months[i+1] || 0;
                    const h = max > 0 ? (val/max)*100 : 0;
                    const barHeight = h < 5 && h > 0 ? 5 : h;
                    return `<div class="w-full mx-1 bg-gray-200 dark:bg-gray-700 rounded-t-sm relative group h-full flex items-end overflow-hidden">
                        <div class="w-full bg-brand rounded-t-sm transition-all duration-500 ease-out" style="height: ${barHeight}%"></div>
                    </div>`;
                }).join('');
            }

        } catch (e) { console.error(e); c.innerHTML = '<div class="p-8 text-center text-red-500">Failed to load details.</div>'; }
    },
    closeSpeciesDetail() { 
        const p = document.getElementById('panel-species-detail');
        if (p) p.classList.add('translate-x-full'); 
    },

    async findSpeciesOnMap(id, name) {
        this.closeSpeciesDetail();
        this.openPanel('map');
        this.showToast(`Scanning for ${name}...`);
        
        try {
            const lat = this.app.map.pos.lat || 40.71;
            const lng = this.app.map.pos.lng || -74.00;
            const res = await fetch(`https://api.inaturalist.org/v1/observations?taxon_id=${id}&lat=${lat}&lng=${lng}&radius=50&order_by=created_at&per_page=1`);
            const json = await res.json();
            
            if (json.results && json.results.length > 0) {
                const obs = json.results[0];
                const coords = [obs.geojson.coordinates[1], obs.geojson.coordinates[0]];
                this.app.map.map.flyTo(coords, 16);
                
                // Add a temporary highlight marker
                const marker = L.circleMarker(coords, { 
                    radius: 20, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.3, weight: 2 
                }).addTo(this.app.map.map);
                
                marker.bindPopup(`<b>${name}</b> sighting area`).openPopup();
                setTimeout(() => marker.remove(), 10000);
            } else {
                this.showToast(`No recent sightings of ${name} nearby.`);
            }
        } catch (e) {
            console.error(e);
            this.showToast("Search failed.");
        }
    },

    async openLogSighting() {
        if (!this.app.localSpecies.length) {
            this.showToast("Locating nearby species...");
            await this.app.data.fetchSpecies(this.app);
        }
        const m = document.getElementById('logSightingModal');
        if (!m) return;
        m.classList.remove('pointer-events-none', 'opacity-0');
        const content = m.querySelector('div[id]');
        if (content) content.classList.remove('translate-y-full');
        this.renderLogForm();
    },
    closeLogSighting() {
        const m = document.getElementById('logSightingModal');
        if (!m) return;
        m.classList.add('pointer-events-none', 'opacity-0');
        const content = m.querySelector('div[id]');
        if (content) content.classList.add('translate-y-full');
    },
    renderLogForm() {
        const body = document.getElementById('log-sighting-body');
        if (!body) return;
        body.innerHTML = `
            <form id="log-form" class="space-y-6">
                <!-- Image Upload Area -->
                <div id="image-upload-area" class="relative w-full aspect-video bg-gray-100 dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col items-center justify-center cursor-pointer active:scale-[0.98] transition-all" onclick="app.game.captureImage()">
                    <img id="sighting-image-preview" class="absolute inset-0 w-full h-full object-cover hidden">
                    <div id="sighting-image-placeholder" class="text-center p-6">
                        <div class="w-16 h-16 bg-brand-light dark:bg-brand-dark/20 text-brand rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                            <span class="material-symbols-rounded text-3xl">add_a_photo</span>
                        </div>
                        <p class="font-bold text-gray-700 dark:text-gray-300">Snap a Photo</p>
                        <p class="text-xs text-gray-400 mt-1 font-medium">Required for verification</p>
                    </div>
                </div>
                <input type="file" id="file-upload-input" class="hidden" accept="image/*" onchange="const reader = new FileReader(); reader.onload = (e) => app.game.updateImagePreview(e.target.result); reader.readAsDataURL(this.files[0]);">

                <!-- Location Info -->
                <div class="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 rounded-2xl flex items-center justify-between border border-gray-100 dark:border-gray-700">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-rounded text-brand text-lg">location_on</span>
                        <span class="text-xs font-bold text-gray-500 uppercase tracking-widest">Current Location</span>
                    </div>
                    <span class="text-[10px] font-mono text-gray-400">${this.app.map.pos.lat?.toFixed(4) || '??'}, ${this.app.map.pos.lng?.toFixed(4) || '??'}</span>
                </div>

                <!-- Species Entries -->
                <div class="space-y-3">
                    <h3 class="text-xs font-black text-gray-400 uppercase tracking-widest px-1">What did you see?</h3>
                    <div id="log-entries" class="space-y-3"></div>
                    <button type="button" onclick="app.game.addEntry()" class="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-400 font-bold py-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                        <span class="material-symbols-rounded">add</span> Add Another Species
                    </button>
                </div>

                <button type="submit" class="w-full bg-brand text-white py-5 rounded-2xl btn-gamified text-lg shadow-xl shadow-brand/30 mt-4">
                    Submit Discovery
                </button>
            </form>`;
        
        this.app.game.currentSightingImage = null;
        this.app.game.addEntry();
        const logForm = document.getElementById('log-form');
        if (logForm) logForm.onsubmit = (e) => { e.preventDefault(); this.app.game.submitLog(); };
    },

    openSpeciesSelector(target) {
        this.selectorTarget = target;
        const m = document.getElementById('species-select-modal');
        if (!m) return;
        m.classList.remove('pointer-events-none', 'opacity-0');
        const content = m.querySelector('div[id]');
        if (content) content.classList.remove('translate-y-full');
        this.renderTabs('species-selector-tabs', this.app.localSpecies, () => this.renderGrid('species-selector-body', this.app.localSpecies, 'species-selector-search', 'species-selector-tabs', true));
        this.renderGrid('species-selector-body', this.app.localSpecies, 'species-selector-search', 'species-selector-tabs', true);
    },
    closeSpeciesSelector() {
        const m = document.getElementById('species-select-modal');
        if (!m) return;
        m.classList.add('pointer-events-none', 'opacity-0');
        const content = m.querySelector('div[id]');
        if (content) content.classList.add('translate-y-full');
    },
    pickSpecies(id) {
        const s = this.app.data.getSpecies(this.app, id);
        if (s && this.selectorTarget) {
            this.selectorTarget.dataset.id = id;
            this.selectorTarget.className = "flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 rounded-xl flex items-center gap-3 shadow-sm";
            this.selectorTarget.innerHTML = `
                <div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-900 overflow-hidden shrink-0 shadow-inner">
                    <img src="${s.img}" class="w-full h-full object-cover">
                </div>
                <div class="text-left truncate">
                    <div class="font-black text-xs text-gray-900 dark:text-white truncate">${s.name}</div>
                    <div class="text-[9px] font-bold text-brand uppercase tracking-wider">${s.category}</div>
                </div>`;
            this.closeSpeciesSelector();
        }
    },

    showLogged(species, xp, seeds, displayName, imageUri) {
        this.lastLoggedSpecies = species;
        const nameEl = document.getElementById('logged-species-name');
        if (nameEl) nameEl.innerText = displayName;
        const xpEl = document.getElementById('logged-xp');
        if (xpEl) xpEl.innerText = xp;
        const seedsEl = document.getElementById('logged-seeds');
        if (seedsEl) seedsEl.innerText = seeds;
        
        const card = document.getElementById('successCard');
        if (card) {
            // Remove previous image if exists
            const prevImg = card.querySelector('#logged-image');
            if (prevImg) prevImg.remove();
            
            if (imageUri) {
                const img = document.createElement('img');
                img.id = 'logged-image';
                img.src = imageUri;
                img.className = 'w-full aspect-square object-cover rounded-2xl mb-6 border-4 border-white dark:border-gray-800 shadow-xl';
                // Insert after the h2
                const h2 = card.querySelector('h2');
                if (h2) h2.after(img);
            }
            card.classList.remove('scale-90');
        }
        
        const m = document.getElementById('sightingLogged');
        if (m) m.classList.remove('opacity-0', 'pointer-events-none');
        
        if (typeof confetti !== 'undefined') {
            confetti({ 
                particleCount: 150, 
                spread: 70, 
                origin: { y: 0.6 },
                colors: ['#10b981', '#059669', '#f59e0b']
            });
        }
    },
    async shareDiscovery() {
        if (navigator.share && this.lastLoggedSpecies) {
            try {
                await navigator.share({
                    title: 'New Discovery in NatureQuest!',
                    text: `I just discovered a ${this.lastLoggedSpecies.name} using the NatureQuest app!`,
                    url: `https://www.inaturalist.org/taxa/${this.lastLoggedSpecies.id}`
                });
                this.showToast('Shared successfully!');
            } catch (error) {
                this.showToast('Error sharing: ' + error.message);
            }

        } else if (this.lastLoggedSpecies) {
            const shareUrl = `https://www.inaturalist.org/taxa/${this.lastLoggedSpecies.id}`;
            navigator.clipboard.writeText(shareUrl).then(() => {
                this.showToast('Link copied to clipboard!');
            }, () => {
                this.showToast('Could not copy link.');
            });
        }
        else {
            this.showToast('No species to share.');
        }
    },
    closeSightingLoggedModal() {
        const m = document.getElementById('sightingLogged');
        if (m) m.classList.add('opacity-0', 'pointer-events-none');
        const card = document.getElementById('successCard');
        if (card) card.classList.add('scale-90');
    },
    
    showToast(msg) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const t = document.createElement('div');
        t.className = 'bg-gray-800/95 dark:bg-white/95 text-white dark:text-gray-900 px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg pop-in backdrop-blur';
        t.innerText = msg;
        container.appendChild(t);
        setTimeout(() => { 
            t.style.opacity = '0'; 
            t.style.transform = 'translateY(10px)'; 
            setTimeout(() => t.remove(), 300); 
        }, 2500);
    },

    renderProfile() {
        const s = this.app.state;
        const nameEl = document.getElementById('profile-username');
        if (nameEl) nameEl.innerText = s.username;
        const avEl = document.getElementById('profile-avatar-emoji');
        if (avEl) avEl.innerText = s.avatar;
        
        const lvl = this.app.data.calcLevel(s.xp);
        const lvlEl = document.getElementById('profile-level');
        if (lvlEl) lvlEl.innerText = lvl.level;
        const xpFill = document.getElementById('profile-xp-fill');
        if (xpFill) xpFill.style.width = `${lvl.pct}%`;
        const xpText = document.getElementById('profile-xp-text');
        if (xpText) xpText.innerText = `${lvl.curr}/${lvl.req} XP`;
        
        const totalXp = document.getElementById('stat-total-xp');
        if (totalXp) totalXp.innerText = s.xp;
        const seeds = document.getElementById('stat-seeds');
        if (seeds) seeds.innerText = s.seeds;
        const speciesCount = document.getElementById('stat-species');
        if (speciesCount) speciesCount.innerText = Object.keys(s.speciesData).length;
        
        const sightings = document.getElementById('stat-sightings');
        if (sightings) sightings.innerText = Object.values(s.speciesData).reduce((a, b) => a + b.count, 0);
    },

    renderRewards() {
        const s = this.app.state;
        const streakText = document.getElementById('streak-days-text');
        if (streakText) streakText.innerText = `${s.streak} Days`;
        
        const days = ['S','M','T','W','T','F','S'];
        const today = new Date().getDay();
        const streakCtr = document.getElementById('streak-days-container');
        if (streakCtr) {
            streakCtr.innerHTML = days.map((d, i) => `
                <div class="flex flex-col items-center gap-1">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${i < (s.streak % 7) ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-300'}">✓</div>
                    <span class="text-[10px] font-bold ${i === (today + 6) % 7 ? 'text-orange-500' : 'text-gray-400'}">${d}</span>
                </div>
            `).join('');
        }
        
        const q = s.quests.daily;
        const qDesc = document.getElementById('quest-description');
        if (qDesc) qDesc.innerText = q.description;
        
        const prog = Math.min(q.progress / q.target, 1);
        const qFill = document.getElementById('quest-progress-fill');
        if (qFill) qFill.style.width = `${prog * 100}%`;
        
        const qStatus = document.getElementById('quest-status');
        if (qStatus) qStatus.innerText = prog >= 1 ? 'COMPLETE' : 'ACTIVE';
        
        const qRewards = document.getElementById('quest-rewards');
        if (qRewards) qRewards.innerHTML = `<span class="text-brand">⚡ ${q.rewards.xp}</span> <span class="text-brand-accent">🌰 ${q.rewards.seeds}</span>`;
    },

    renderShop() {
        const body = document.getElementById('shop-body');
        const count = document.getElementById('shop-seeds-count');
        if (count) count.innerText = this.app.state.seeds;
        if (!body) return;

        const items = [
            { id: 'lure', name: 'Party Lure', desc: 'Attracts rare species for the whole party.', cost: 50, icon: '🟣' },
            { id: 'xp_boost', name: 'XP Potion', desc: 'Instantly gain 500 Experience.', cost: 30, icon: '🧪' },
            { id: 'radar', name: 'Super Radar', desc: 'Shows exact locations of rare finds.', cost: 100, icon: '📡' }
        ];

        body.innerHTML = items.map(item => `
            <div class="bg-white dark:bg-surface-dark p-4 rounded-3xl border-2 border-gray-100 dark:border-gray-700 flex items-center gap-4 shadow-sm active:scale-95 transition-transform" onclick="app.ui.buyItem('${item.id}', ${item.cost})">
                <div class="text-4xl w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center">${item.icon}</div>
                <div class="flex-1">
                    <h4 class="font-black text-lg dark:text-white">${item.name}</h4>
                    <p class="text-xs text-gray-500">${item.desc}</p>
                </div>
                <div class="bg-brand text-white px-4 py-2 rounded-xl font-black text-sm">🌰 ${item.cost}</div>
            </div>
        `).join('');
    },

    buyItem(id, cost) {
        if (this.app.state.seeds < cost) {
            this.showToast("Not enough seeds! 🌰");
            if (this.app.haptics) this.app.haptics.vibrate();
            return;
        }
        this.app.state.seeds -= cost;
        this.showToast(`Purchased item!`);
        this.renderShop();
        this.renderProfile();
        this.app.saveState();
    },

    renderAchievements() {
        const body = document.getElementById('achievements-body');
        if (!body) return;

        const badges = [
            { name: 'First Find', goal: 1, key: 'speciesCount', icon: '🌱' },
            { name: 'Nature Lover', goal: 10, key: 'speciesCount', icon: '🌿' },
            { name: 'Master Scout', goal: 50, key: 'speciesCount', icon: '🌲' },
            { name: 'Seed Saver', goal: 100, key: 'seeds', icon: '💰' },
            { name: 'Power Player', goal: 1000, key: 'xp', icon: '🏆' }
        ];

        const stats = {
            speciesCount: Object.keys(this.app.state.speciesData).length,
            seeds: this.app.state.seeds,
            xp: this.app.state.xp
        };

        body.innerHTML = badges.map(b => {
            const progress = Math.min(stats[b.key] / b.goal, 1);
            const unlocked = progress >= 1;
            return `
                <div class="bg-white dark:bg-surface-dark p-4 rounded-3xl border-2 ${unlocked ? 'border-brand' : 'border-gray-100 dark:border-gray-700'} flex flex-col items-center text-center shadow-sm ${!unlocked ? 'grayscale opacity-50' : ''}">
                    <div class="text-5xl mb-3">${b.icon}</div>
                    <h4 class="font-black text-xs uppercase dark:text-white mb-1">${b.name}</h4>
                    <div class="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div class="h-full bg-brand" style="width: ${progress * 100}%"></div>
                    </div>
                    <div class="text-[8px] font-bold text-gray-400 mt-1">${unlocked ? 'UNLOCKED' : `${Math.floor(progress * 100)}%`}</div>
                </div>
            `;
        }).join('');
    }
};
