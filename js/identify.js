// Identification module: Knowledge Graph wizard + BirdNET-style Audio ID
export const identify = {
    app: null,
    // Audio ID state
    audioCtx: null,
    analyser: null,
    mediaStream: null,
    mediaRecorder: null,
    audioChunks: [],
    animFrame: null,
    isListening: false,

    // Knowledge Graph state
    kgCategory: null,
    kgSelections: {},
    kgStep: 0,
    kgResults: [],

    init(app) {
        this.app = app;
    },

    // ─── KNOWLEDGE GRAPH ──────────────────────────────────────────
    TRAIT_TREES: {
        Aves: {
            label: 'Bird', icon: '🐦',
            steps: [
                {
                    id: 'size', question: 'How big is the bird?',
                    options: [
                        { id: 'tiny',      label: 'Tiny',       desc: 'Hummingbird / Wren',     icon: '🔸', q: 'tiny small' },
                        { id: 'small',     label: 'Small',      desc: 'Sparrow → Robin',         icon: '🐦', q: 'sparrow warbler finch' },
                        { id: 'medium',    label: 'Medium',     desc: 'Robin → Crow',            icon: '🪶', q: 'thrush jay dove' },
                        { id: 'large',     label: 'Large',      desc: 'Crow → Heron',            icon: '🦅', q: 'heron hawk falcon' },
                        { id: 'very_large',label: 'Very Large', desc: 'Goose / Eagle / Pelican', icon: '🦢', q: 'eagle goose pelican' }
                    ]
                },
                {
                    id: 'color', question: 'What is the primary color?', multi: true,
                    options: [
                        { id: 'black',  label: 'Black',       color: '#1a1a1a' },
                        { id: 'white',  label: 'White',       color: '#e8e8e8', border: true },
                        { id: 'brown',  label: 'Brown/Tan',   color: '#8B6914' },
                        { id: 'red',    label: 'Red/Orange',  color: '#e74c3c' },
                        { id: 'yellow', label: 'Yellow',      color: '#f1c40f' },
                        { id: 'green',  label: 'Green',       color: '#27ae60' },
                        { id: 'blue',   label: 'Blue',        color: '#2980b9' },
                        { id: 'gray',   label: 'Gray',        color: '#7f8c8d' }
                    ]
                },
                {
                    id: 'habitat', question: 'Where did you see it?',
                    options: [
                        { id: 'forest',   label: 'Forest/Woods',   icon: '🌲' },
                        { id: 'meadow',   label: 'Meadow/Field',   icon: '🌾' },
                        { id: 'water',    label: 'Near Water',     icon: '💧' },
                        { id: 'urban',    label: 'Urban/Garden',   icon: '🏙️' },
                        { id: 'coast',    label: 'Coast/Beach',    icon: '🏖️' },
                        { id: 'mountain', label: 'Mountain',       icon: '⛰️' }
                    ]
                },
                {
                    id: 'beak', question: 'What does the beak look like?',
                    options: [
                        { id: 'short_conical', label: 'Short & Conical', desc: 'Seed cracker (finch-like)',    icon: '🌱' },
                        { id: 'thin_pointed',  label: 'Thin & Pointed',  desc: 'Insect probe (warbler-like)', icon: '🔍' },
                        { id: 'hooked',        label: 'Hooked',          desc: 'Flesh tearer (raptor)',        icon: '🦅' },
                        { id: 'flat_wide',     label: 'Flat & Wide',     desc: 'Filter feeder (duck)',         icon: '💧' },
                        { id: 'long_dagger',   label: 'Long & Dagger',   desc: 'Fish spear (heron/kingfisher)',icon: '🎯' },
                        { id: 'long_curved',   label: 'Long & Curved',   desc: 'Mud probe (shorebird)',        icon: '🌊' }
                    ]
                }
            ]
        },
        Plantae: {
            label: 'Plant', icon: '🌿',
            steps: [
                {
                    id: 'form', question: 'What form is the plant?',
                    options: [
                        { id: 'tree',       label: 'Tree',            icon: '🌳', q: 'tree' },
                        { id: 'shrub',      label: 'Shrub/Bush',      icon: '🌿', q: 'shrub bush' },
                        { id: 'wildflower', label: 'Wildflower/Herb', icon: '🌸', q: 'wildflower herb' },
                        { id: 'grass',      label: 'Grass/Sedge',     icon: '🌾', q: 'grass' },
                        { id: 'vine',       label: 'Vine/Climber',    icon: '🍃', q: 'vine' },
                        { id: 'fern',       label: 'Fern/Moss',       icon: '☘️', q: 'fern moss' }
                    ]
                },
                {
                    id: 'flower_color', question: 'What color are the flowers (if any)?',
                    options: [
                        { id: 'none',   label: 'No Flowers',   icon: '🍃' },
                        { id: 'white',  label: 'White',        color: '#e8e8e8', border: true },
                        { id: 'yellow', label: 'Yellow',       color: '#f1c40f' },
                        { id: 'pink',   label: 'Pink/Red',     color: '#e91e8c' },
                        { id: 'purple', label: 'Purple/Blue',  color: '#9b59b6' },
                        { id: 'orange', label: 'Orange',       color: '#e67e22' }
                    ]
                },
                {
                    id: 'leaf', question: 'What do the leaves look like?',
                    options: [
                        { id: 'simple_broad', label: 'Simple & Broad',   icon: '🍃', q: '' },
                        { id: 'compound',     label: 'Compound/Divided', icon: '🌿', q: '' },
                        { id: 'lobed',        label: 'Lobed (Oak-like)', icon: '🍂', q: 'oak maple' },
                        { id: 'needle',       label: 'Needle/Scale',     icon: '🌲', q: 'pine conifer' },
                        { id: 'grass_like',   label: 'Grass-like/Strap', icon: '🌾', q: 'grass sedge iris' }
                    ]
                },
                {
                    id: 'habitat', question: 'Where is it growing?',
                    options: [
                        { id: 'forest',  label: 'Forest/Shaded',    icon: '🌲' },
                        { id: 'meadow',  label: 'Meadow/Field',     icon: '🌾' },
                        { id: 'wetland', label: 'Wetland/Water Edge',icon: '💧' },
                        { id: 'urban',   label: 'Urban/Disturbed',  icon: '🏙️' },
                        { id: 'rocky',   label: 'Rocky/Cliff',      icon: '🪨' }
                    ]
                }
            ]
        },
        Mammalia: {
            label: 'Mammal', icon: '🦊',
            steps: [
                {
                    id: 'size', question: 'How big is the animal?',
                    options: [
                        { id: 'tiny',      label: 'Tiny',       desc: 'Mouse/Shrew',      icon: '🐭', q: 'mouse shrew vole' },
                        { id: 'small',     label: 'Small',      desc: 'Squirrel/Rabbit',  icon: '🐿️', q: 'squirrel rabbit chipmunk' },
                        { id: 'medium',    label: 'Medium',     desc: 'Fox/Raccoon',      icon: '🦊', q: 'fox raccoon opossum' },
                        { id: 'large',     label: 'Large',      desc: 'Deer/Coyote',      icon: '🦌', q: 'deer coyote bobcat' },
                        { id: 'very_large',label: 'Very Large', desc: 'Bear/Moose/Bison', icon: '🐻', q: 'bear moose bison' }
                    ]
                },
                {
                    id: 'color', question: 'What is the primary color?', multi: true,
                    options: [
                        { id: 'black',          label: 'Black',           color: '#1a1a1a' },
                        { id: 'white',          label: 'White/Pale',      color: '#e8e8e8', border: true },
                        { id: 'brown',          label: 'Brown',           color: '#8B4513' },
                        { id: 'gray',           label: 'Gray',            color: '#808080' },
                        { id: 'red_orange',     label: 'Red/Orange',      color: '#e74c3c' },
                        { id: 'spotted_striped',label: 'Spotted/Striped', icon: '🐆' }
                    ]
                },
                {
                    id: 'habitat', question: 'Where did you see it?',
                    options: [
                        { id: 'forest',     label: 'Forest/Woods',     icon: '🌲' },
                        { id: 'grassland',  label: 'Grassland/Prairie',icon: '🌾' },
                        { id: 'wetland',    label: 'Wetland/Water',    icon: '💧' },
                        { id: 'urban',      label: 'Urban/Suburban',   icon: '🏘️' },
                        { id: 'underground',label: 'Underground Sign', icon: '🕳️' }
                    ]
                }
            ]
        },
        Insecta: {
            label: 'Insect', icon: '🦋',
            steps: [
                {
                    id: 'type', question: 'What type of insect?',
                    options: [
                        { id: 'butterfly', label: 'Butterfly/Moth',       icon: '🦋', q: 'butterfly moth' },
                        { id: 'beetle',    label: 'Beetle',               icon: '🐞', q: 'beetle' },
                        { id: 'bee_wasp',  label: 'Bee/Wasp/Hornet',      icon: '🐝', q: 'bee wasp' },
                        { id: 'fly',       label: 'Fly/Gnat/Mosquito',    icon: '🪰', q: 'fly gnat' },
                        { id: 'dragonfly', label: 'Dragonfly/Damselfly',  icon: '🪲', q: 'dragonfly' },
                        { id: 'grasshopper',label: 'Grasshopper/Cricket', icon: '🦗', q: 'grasshopper cricket' },
                        { id: 'ant',       label: 'Ant/Termite',          icon: '🐜', q: 'ant' }
                    ]
                },
                {
                    id: 'color', question: 'What is the primary color pattern?', multi: true,
                    options: [
                        { id: 'yellow_black', label: 'Yellow & Black', color: '#f1c40f' },
                        { id: 'orange_black', label: 'Orange & Black', color: '#e67e22' },
                        { id: 'metallic',     label: 'Metallic/Iridescent', icon: '✨' },
                        { id: 'brown',        label: 'Brown/Tan',       color: '#8B6914' },
                        { id: 'all_black',    label: 'All Black',       color: '#1a1a1a' },
                        { id: 'white_pale',   label: 'White/Pale',      color: '#e8e8e8', border: true },
                        { id: 'colorful',     label: 'Multi-colored',   icon: '🌈' }
                    ]
                }
            ]
        },
        Reptilia: {
            label: 'Reptile', icon: '🦎',
            steps: [
                {
                    id: 'form', question: 'What type of reptile?',
                    options: [
                        { id: 'snake',     label: 'Snake',                icon: '🐍', q: 'snake' },
                        { id: 'lizard',    label: 'Lizard/Skink',         icon: '🦎', q: 'lizard skink' },
                        { id: 'turtle',    label: 'Turtle/Tortoise',      icon: '🐢', q: 'turtle tortoise' },
                        { id: 'alligator', label: 'Alligator/Crocodile',  icon: '🐊', q: 'alligator crocodile' }
                    ]
                },
                {
                    id: 'habitat', question: 'Where did you see it?',
                    options: [
                        { id: 'forest',    label: 'Forest/Woodland',   icon: '🌲' },
                        { id: 'grassland', label: 'Grassland/Open',    icon: '🌾' },
                        { id: 'water',     label: 'Water/Wetland',     icon: '💧' },
                        { id: 'rocky',     label: 'Rocky/Sandy',       icon: '🪨' },
                        { id: 'urban',     label: 'Urban/Garden',      icon: '🏘️' }
                    ]
                }
            ]
        },
        Amphibia: {
            label: 'Amphibian', icon: '🐸',
            steps: [
                {
                    id: 'form', question: 'What type of amphibian?',
                    options: [
                        { id: 'frog',       label: 'Frog',            icon: '🐸', q: 'frog' },
                        { id: 'toad',       label: 'Toad',            icon: '🐸', q: 'toad' },
                        { id: 'salamander', label: 'Salamander/Newt', icon: '🦎', q: 'salamander newt' }
                    ]
                },
                {
                    id: 'color', question: 'What is the primary color?', multi: true,
                    options: [
                        { id: 'green',        label: 'Green',          color: '#2ecc71' },
                        { id: 'brown_gray',   label: 'Brown/Gray',     color: '#8B6914' },
                        { id: 'spotted',      label: 'Spotted/Patterned', icon: '🔵' },
                        { id: 'red_orange',   label: 'Red/Orange',     color: '#e74c3c' },
                        { id: 'black_yellow', label: 'Black & Yellow', color: '#f1c40f' }
                    ]
                }
            ]
        }
    },

    startKnowledgeGraph() {
        this.kgCategory = null;
        this.kgSelections = {};
        this.kgStep = 0;
        this.kgResults = [];
        this.app.state._usedKeyOut = true;
        this.app.saveState();
        this.renderKGModal();
    },

    renderKGModal() {
        const modal = document.getElementById('kgModal');
        const body = document.getElementById('kg-body');
        const progressEl = document.getElementById('kg-progress');
        const backBtn = document.getElementById('kg-back');
        if (!modal || !body) return;

        if (!this.kgCategory) {
            // Category selection
            if (progressEl) progressEl.innerHTML = '';
            if (backBtn) backBtn.classList.add('hidden');
            body.innerHTML = `
                <div class="text-center mb-6">
                    <div class="text-4xl mb-2">🔬</div>
                    <h3 class="text-xl font-black text-gray-900 dark:text-white mb-1">What did you find?</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400">Select a category to start the guided ID</p>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    ${Object.entries(this.TRAIT_TREES).map(([k, v]) => `
                        <button onclick="app.identify.selectCategory('${k}')"
                            class="kg-cat-btn flex flex-col items-center gap-2 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent hover:border-brand active:scale-95 transition-all">
                            <span class="text-4xl">${v.icon}</span>
                            <span class="font-bold text-sm text-gray-800 dark:text-white">${v.label}</span>
                        </button>
                    `).join('')}
                </div>`;
            return;
        }

        const tree = this.TRAIT_TREES[this.kgCategory];
        const steps = tree.steps;

        if (this.kgStep >= steps.length) {
            // Show results
            this._renderKGResults(body);
            return;
        }

        const step = steps[this.kgStep];
        const total = steps.length;
        if (progressEl) {
            progressEl.innerHTML = Array.from({ length: total }, (_, i) =>
                `<div class="h-1.5 flex-1 rounded-full ${i <= this.kgStep ? 'bg-brand' : 'bg-gray-200 dark:bg-gray-700'}"></div>`
            ).join('');
        }
        if (backBtn) backBtn.classList.remove('hidden');

        const currentSel = this.kgSelections[step.id];
        body.innerHTML = `
            <div class="mb-5">
                <div class="text-xs font-bold uppercase tracking-widest text-brand mb-1">Step ${this.kgStep + 1} of ${total} — ${tree.label}</div>
                <h3 class="text-lg font-black text-gray-900 dark:text-white">${step.question}</h3>
                ${step.multi ? '<p class="text-xs text-gray-400 mt-1">Select all that apply</p>' : ''}
            </div>
            <div class="grid grid-cols-2 gap-3">
                ${step.options.map(opt => {
                    const isColor = !!opt.color;
                    const sel = step.multi
                        ? (Array.isArray(currentSel) && currentSel.includes(opt.id))
                        : currentSel === opt.id;
                    if (isColor) {
                        return `
                            <button onclick="app.identify.selectTrait('${step.id}', '${opt.id}', ${step.multi || false})"
                                class="kg-trait-btn flex items-center gap-3 p-3 rounded-2xl border-2 ${sel ? 'border-brand bg-brand/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'} active:scale-95 transition-all">
                                <div class="w-8 h-8 rounded-full border ${opt.border ? 'border-gray-300' : 'border-transparent'} shrink-0" style="background:${opt.color}"></div>
                                <span class="font-semibold text-sm text-gray-800 dark:text-white">${opt.label}</span>
                                ${sel ? '<span class="material-symbols-rounded text-brand text-base ml-auto">check_circle</span>' : ''}
                            </button>`;
                    }
                    return `
                        <button onclick="app.identify.selectTrait('${step.id}', '${opt.id}', ${step.multi || false})"
                            class="kg-trait-btn flex flex-col items-start gap-1 p-3 rounded-2xl border-2 ${sel ? 'border-brand bg-brand/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'} active:scale-95 transition-all">
                            <div class="flex items-center gap-2 w-full">
                                <span class="text-2xl">${opt.icon || '•'}</span>
                                <span class="font-bold text-sm text-gray-800 dark:text-white flex-1">${opt.label}</span>
                                ${sel ? '<span class="material-symbols-rounded text-brand text-base">check_circle</span>' : ''}
                            </div>
                            ${opt.desc ? `<p class="text-xs text-gray-400 pl-8">${opt.desc}</p>` : ''}
                        </button>`;
                }).join('')}
            </div>`;
    },

    selectCategory(cat) {
        this.kgCategory = cat;
        this.kgStep = 0;
        this.kgSelections = {};
        this.renderKGModal();
    },

    selectTrait(stepId, optId, multi) {
        if (multi) {
            if (!Array.isArray(this.kgSelections[stepId])) this.kgSelections[stepId] = [];
            const arr = this.kgSelections[stepId];
            const idx = arr.indexOf(optId);
            if (idx === -1) arr.push(optId);
            else arr.splice(idx, 1);
            this.renderKGModal();
        } else {
            this.kgSelections[stepId] = optId;
            // Auto-advance after brief delay
            setTimeout(() => this.kgNext(), 250);
        }
    },

    kgNext() {
        const tree = this.TRAIT_TREES[this.kgCategory];
        if (!tree) return;
        const step = tree.steps[this.kgStep];
        if (step && !this.kgSelections[step.id]) {
            // Allow skipping — just advance
        }
        this.kgStep++;
        if (this.kgStep >= tree.steps.length) {
            this._fetchKGResults();
        } else {
            this.renderKGModal();
        }
    },

    kgBack() {
        if (!this.kgCategory) return;
        if (this.kgStep === 0) {
            this.kgCategory = null;
        } else {
            this.kgStep--;
        }
        this.renderKGModal();
    },

    async _fetchKGResults() {
        const body = document.getElementById('kg-body');
        if (body) body.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 gap-4">
                <div class="w-16 h-16 bg-brand/10 rounded-full flex items-center justify-center animate-pulse">
                    <span class="material-symbols-rounded text-brand text-3xl">search</span>
                </div>
                <p class="text-gray-500 font-semibold">Searching nearby species…</p>
            </div>`;

        const lat = this.app.map.pos.lat || 40.71;
        const lng = this.app.map.pos.lng || -74.00;
        const tree = this.TRAIT_TREES[this.kgCategory];

        // Build search query from selections
        const qParts = [];
        for (const step of tree.steps) {
            const sel = this.kgSelections[step.id];
            if (!sel) continue;
            const ids = Array.isArray(sel) ? sel : [sel];
            for (const id of ids) {
                const opt = step.options.find(o => o.id === id);
                if (opt?.q) qParts.push(opt.q);
                else if (opt && !opt.q && !opt.color) qParts.push(opt.label.toLowerCase());
            }
        }
        const q = qParts.join(' ').trim() || null;

        try {
            const results = await this.app.inat.queryByTraits(lat, lng, {
                iconic: this.kgCategory,
                q,
                limit: 20
            });
            this.kgResults = results;
        } catch (e) {
            this.kgResults = [];
        }
        this._renderKGResults(document.getElementById('kg-body'));
    },

    _renderKGResults(body) {
        if (!body) return;
        const progressEl = document.getElementById('kg-progress');
        const backBtn = document.getElementById('kg-back');
        if (progressEl) progressEl.innerHTML = '';
        if (backBtn) backBtn.classList.remove('hidden');

        if (!this.kgResults.length) {
            body.innerHTML = `
                <div class="text-center py-8">
                    <div class="text-5xl mb-3">🤷</div>
                    <h3 class="font-bold text-gray-800 dark:text-white mb-2">No exact matches nearby</h3>
                    <p class="text-sm text-gray-500 mb-6">Try adjusting your selections or exploring a broader area on iNaturalist.</p>
                    <button onclick="app.identify.kgBack()" class="bg-brand text-white px-8 py-3 rounded-xl font-bold">Try Again</button>
                </div>`;
            return;
        }

        body.innerHTML = `
            <div class="mb-4">
                <div class="text-xs font-bold uppercase tracking-widest text-brand mb-1">Possible Matches Nearby</div>
                <h3 class="text-lg font-black text-gray-900 dark:text-white">${this.kgResults.length} candidate${this.kgResults.length !== 1 ? 's' : ''} found</h3>
                <p class="text-xs text-gray-400 mt-1">Based on your selections + current location. Tap to view details.</p>
            </div>
            <div class="space-y-3">
                ${this.kgResults.map((s, i) => `
                    <button onclick="app.ui.openSpeciesDetail(${s.id})"
                        class="w-full flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 active:scale-98 transition-all text-left">
                        <div class="relative shrink-0">
                            <img src="${s.squareImg || s.img}" class="w-16 h-16 rounded-xl object-cover" loading="lazy">
                            ${i === 0 ? '<div class="absolute -top-1 -right-1 w-5 h-5 bg-brand rounded-full flex items-center justify-center"><span class="text-white text-[10px] font-black">1</span></div>' : ''}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold text-sm text-gray-900 dark:text-white truncate">${s.name}</div>
                            <div class="text-xs text-gray-400 italic truncate">${s.sciName}</div>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${s.rarity === 'Common' ? 'bg-green-100 text-green-700' : s.rarity === 'Uncommon' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}">${s.rarity}</span>
                                <span class="text-[10px] text-gray-400">${s.count} local obs</span>
                            </div>
                        </div>
                        <span class="material-symbols-rounded text-gray-400 text-xl shrink-0">chevron_right</span>
                    </button>
                `).join('')}
            </div>
            <button onclick="app.ui.closeKGModal()" class="w-full mt-4 py-3 bg-brand text-white font-bold rounded-xl active:scale-95">Done</button>`;
    },

    // ─── AUDIO ID ─────────────────────────────────────────────────
    async startAudioId() {
        this.app.state._usedAudioId = true;
        this.app.saveState();

        const container = document.getElementById('audio-id-content');
        if (!container) return;

        // Reset state
        this.stopAudio();
        this.audioChunks = [];

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.mediaStream = stream;
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioCtx.createMediaStreamSource(stream);
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            source.connect(this.analyser);

            this.mediaRecorder = new MediaRecorder(stream);
            this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.audioChunks.push(e.data); };
            this.mediaRecorder.onstop = () => this._analyzeAudio();
            this.mediaRecorder.start();
            this.isListening = true;

            this._renderAudioListening(container);
            this._drawSpectrogram(container);

            // Auto-stop after 8 seconds
            setTimeout(() => { if (this.isListening) this.stopAudio(true); }, 8000);
        } catch (err) {
            console.error('Audio ID error:', err);
            container.innerHTML = `
                <div class="text-center py-8 px-4">
                    <div class="text-5xl mb-3">🎤</div>
                    <h3 class="font-bold text-gray-800 dark:text-white mb-2">Microphone access needed</h3>
                    <p class="text-sm text-gray-500 mb-4">Please allow microphone access in your browser settings, then try again.</p>
                    <button onclick="app.identify.startAudioId()" class="bg-brand text-white px-8 py-3 rounded-xl font-bold">Try Again</button>
                </div>`;
        }
    },

    _renderAudioListening(container) {
        container.innerHTML = `
            <div class="flex flex-col items-center pt-4 pb-2">
                <div class="relative w-24 h-24 flex items-center justify-center mb-4">
                    <div class="absolute inset-0 bg-brand/20 rounded-full animate-ping"></div>
                    <div class="absolute inset-2 bg-brand/30 rounded-full animate-ping" style="animation-delay:0.3s"></div>
                    <div class="w-16 h-16 bg-brand rounded-full flex items-center justify-center z-10 shadow-xl shadow-brand/40">
                        <span class="material-symbols-rounded text-white text-3xl">mic</span>
                    </div>
                </div>
                <p class="font-bold text-gray-800 dark:text-white mb-1">Listening…</p>
                <p class="text-xs text-gray-400 mb-4">Recording for 8 seconds. Hold still in nature.</p>
                <canvas id="audio-spectrogram" width="320" height="80" class="rounded-2xl bg-gray-900 w-full max-w-sm mb-4"></canvas>
                <div id="audio-countdown" class="text-4xl font-black text-brand tabular-nums">8</div>
                <button onclick="app.identify.stopAudio(true)" class="mt-4 px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm active:scale-95">Stop Early</button>
            </div>`;
        // Countdown
        let t = 8;
        this._countdownTimer = setInterval(() => {
            t--;
            const el = document.getElementById('audio-countdown');
            if (el) el.textContent = Math.max(t, 0);
            if (t <= 0) clearInterval(this._countdownTimer);
        }, 1000);
    },

    _drawSpectrogram(container) {
        const draw = () => {
            if (!this.isListening || !this.analyser) return;
            this.animFrame = requestAnimationFrame(draw);
            const canvas = document.getElementById('audio-spectrogram');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const bufLen = this.analyser.frequencyBinCount;
            const data = new Uint8Array(bufLen);
            this.analyser.getByteFrequencyData(data);

            // Shift existing image left by 2px
            const imgData = ctx.getImageData(2, 0, canvas.width - 2, canvas.height);
            ctx.putImageData(imgData, 0, 0);
            ctx.fillStyle = '#111827';
            ctx.fillRect(canvas.width - 2, 0, 2, canvas.height);

            // Draw new column
            const slice = Math.floor(bufLen / canvas.height);
            for (let y = 0; y < canvas.height; y++) {
                const idx = y * slice;
                const v = data[idx] || 0;
                const intensity = v / 255;
                // Color: low = dark teal, high = bright green/yellow
                const r = Math.round(intensity * 80);
                const g = Math.round(50 + intensity * 200);
                const b = Math.round(30 + intensity * 20);
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(canvas.width - 2, canvas.height - y - 1, 2, 1);
            }
        };
        draw();
    },

    stopAudio(andAnalyze = false) {
        this.isListening = false;
        if (this.animFrame) { cancelAnimationFrame(this.animFrame); this.animFrame = null; }
        if (this._countdownTimer) { clearInterval(this._countdownTimer); this._countdownTimer = null; }
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            if (andAnalyze) this.mediaRecorder.stop();
            else this.mediaRecorder.stop();
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(t => t.stop());
            this.mediaStream = null;
        }
        if (this.audioCtx) {
            this.audioCtx.close().catch(() => {});
            this.audioCtx = null;
        }
        this.analyser = null;
    },

    async _analyzeAudio() {
        const container = document.getElementById('audio-id-content');
        if (!container) return;

        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 gap-4">
                <div class="w-16 h-16 bg-brand/10 rounded-full flex items-center justify-center animate-pulse">
                    <span class="material-symbols-rounded text-brand text-3xl">psychology</span>
                </div>
                <p class="text-gray-500 font-semibold">Analyzing recording…</p>
            </div>`;

        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const settings = this.app.state.settings || {};

        let birdnetResults = null;
        if (settings.birdnetApiUrl) {
            birdnetResults = await this._callBirdNetApi(blob, settings.birdnetApiUrl, settings.birdnetToken);
        }

        if (!birdnetResults) {
            // Fallback: show nearby birds from iNaturalist
            await this._showNearbyBirdFallback(container);
        } else {
            this._showBirdNetResults(container, birdnetResults);
        }
    },

    async _callBirdNetApi(blob, url, token) {
        try {
            const form = new FormData();
            form.append('audio', blob, 'recording.webm');
            form.append('lat', this.app.map.pos.lat || 0);
            form.append('lon', this.app.map.pos.lng || 0);
            form.append('week', Math.ceil((new Date().getMonth() + 1) * 52 / 12));
            const headers = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await fetch(url, { method: 'POST', headers, body: form });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            console.warn('BirdNET API error:', e);
            return null;
        }
    },

    async _showNearbyBirdFallback(container) {
        const lat = this.app.map.pos.lat || 40.71;
        const lng = this.app.map.pos.lng || -74.00;
        let birds = [];
        try {
            birds = await this.app.inat.queryByTraits(lat, lng, { iconic: 'Aves', limit: 12 });
        } catch (e) {}

        container.innerHTML = `
            <div class="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-700 flex gap-2">
                <span class="material-symbols-rounded text-amber-500 text-xl shrink-0 mt-0.5">info</span>
                <div>
                    <p class="text-sm font-semibold text-amber-800 dark:text-amber-300">No BirdNET API configured</p>
                    <p class="text-xs text-amber-600 dark:text-amber-400">Showing birds commonly found in your area this month. Configure a BirdNET API endpoint in Settings for real audio analysis.</p>
                </div>
            </div>
            <div class="mb-3">
                <h3 class="font-black text-gray-900 dark:text-white">🐦 Birds Near You This Month</h3>
                <p class="text-xs text-gray-400 mt-1">Tap any species to view details or log a sighting.</p>
            </div>
            <div class="space-y-2">
                ${birds.map(s => `
                    <button onclick="app.ui.openSpeciesDetail(${s.id})"
                        class="w-full flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 active:scale-98 transition-all text-left">
                        <img src="${s.squareImg || s.img}" class="w-14 h-14 rounded-xl object-cover shrink-0">
                        <div class="flex-1 min-w-0">
                            <div class="font-bold text-sm text-gray-900 dark:text-white truncate">${s.name}</div>
                            <div class="text-xs text-gray-400 italic truncate">${s.sciName}</div>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${s.rarity === 'Common' ? 'bg-green-100 text-green-700' : s.rarity === 'Uncommon' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}">${s.rarity}</span>
                        </div>
                        <span class="material-symbols-rounded text-gray-400">chevron_right</span>
                    </button>
                `).join('')}
            </div>
            <button onclick="app.identify.startAudioId()" class="w-full mt-4 py-3 bg-brand text-white font-bold rounded-xl active:scale-95">Listen Again</button>`;
    },

    _showBirdNetResults(container, results) {
        // results expected: array of { common_name, scientific_name, confidence, label }
        const items = Array.isArray(results) ? results : (results.results || results.detections || []);
        container.innerHTML = `
            <div class="mb-4">
                <div class="flex items-center gap-2 mb-1">
                    <span class="material-symbols-rounded text-brand text-xl">verified</span>
                    <h3 class="font-black text-gray-900 dark:text-white">BirdNET Results</h3>
                </div>
                <p class="text-xs text-gray-400">Results from audio analysis of your recording.</p>
            </div>
            <div class="space-y-3">
                ${items.slice(0, 8).map(r => {
                    const conf = r.confidence || r.score || 0;
                    const pct = Math.round(conf * 100);
                    return `
                        <div class="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                            <div class="flex justify-between items-start mb-2">
                                <div>
                                    <div class="font-bold text-sm text-gray-900 dark:text-white">${r.common_name || r.label || 'Unknown'}</div>
                                    <div class="text-xs text-gray-400 italic">${r.scientific_name || ''}</div>
                                </div>
                                <span class="text-sm font-black ${pct > 70 ? 'text-green-600' : pct > 40 ? 'text-amber-600' : 'text-red-500'}">${pct}%</span>
                            </div>
                            <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div class="h-full bg-brand rounded-full" style="width:${pct}%"></div>
                            </div>
                        </div>`;
                }).join('')}
            </div>
            <button onclick="app.identify.startAudioId()" class="w-full mt-4 py-3 bg-brand text-white font-bold rounded-xl active:scale-95">Listen Again</button>`;
    }
};
