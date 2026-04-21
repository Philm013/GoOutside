// Identification module: Knowledge Graph wizard + BirdNET in-browser Audio ID
export const identify = {
    app: null,
    // Audio pipeline
    audioCtx: null,
    analyser: null,
    mediaStream: null,
    animFrame: null,
    isListening: false,
    _audioWorkletNode: null,
    _audioSamples: null,
    _lastPredictMs: 0,
    _countdownTimer: null,
    _listenStartTime: 0,
    _liveDetections: [],
    // BirdNET worker (kept alive across sessions to avoid reloading 50MB model)
    _birdnetWorker: null,
    _birdnetReady: false,
    _birdnetLoading: false,
    _pendingMicStart: false,

    // Knowledge Graph state
    kgCategory: null,
    kgSelections: {},
    kgStep: 0,
    kgResults: [],
    selectedTraits: {},

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
                },
                {
                    id: 'habitat', question: 'Where did you find it?',
                    options: [
                        { id: 'forest',  label: 'Forest/Woodland',    icon: '🌲' },
                        { id: 'meadow',  label: 'Meadow/Garden',      icon: '🌸' },
                        { id: 'water',   label: 'Near Water',         icon: '💧' },
                        { id: 'urban',   label: 'Urban/Indoor',       icon: '🏙️' },
                        { id: 'any',     label: 'Not sure',           icon: '🌍' }
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
                },
                {
                    id: 'color', question: 'What best describes the coloring/pattern?', multi: true,
                    options: [
                        { id: 'brown_gray',  label: 'Brown/Gray',      color: '#8B6914' },
                        { id: 'green',       label: 'Green',           color: '#27ae60' },
                        { id: 'black',       label: 'Black',           color: '#1a1a1a' },
                        { id: 'striped',     label: 'Striped',         icon: '〰️' },
                        { id: 'spotted',     label: 'Spotted/Blotched',icon: '🔵' },
                        { id: 'orange_red',  label: 'Orange/Red',      color: '#e74c3c' }
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
                },
                {
                    id: 'habitat', question: 'Where did you find it?',
                    options: [
                        { id: 'pond_lake',  label: 'Pond/Lake',        icon: '🏞️' },
                        { id: 'stream',     label: 'Stream/River',     icon: '🌊' },
                        { id: 'forest',     label: 'Forest/Leaf Litter',icon: '🌲' },
                        { id: 'meadow',     label: 'Meadow/Grass',     icon: '🌾' },
                        { id: 'underground',label: 'Under rocks/logs', icon: '🪨' }
                    ]
                }
            ]
        },
        Actinopterygii: {
            label: 'Fish', icon: '🐟',
            steps: [
                {
                    id: 'water_type', question: 'What type of water?',
                    options: [
                        { id: 'freshwater_still', label: 'Lake / Pond',       icon: '🏞️', q: 'lake pond bass sunfish perch' },
                        { id: 'freshwater_flow',  label: 'Stream / River',    icon: '🌊', q: 'stream river trout salmon dace' },
                        { id: 'saltwater_coast',  label: 'Ocean / Coast',     icon: '🌊', q: 'ocean saltwater reef rockfish' },
                        { id: 'brackish',         label: 'Estuary / Marsh',   icon: '🌿', q: 'estuary brackish striped bass' },
                        { id: 'tidepool',         label: 'Tide Pool',         icon: '🪸', q: 'tidepool intertidal sculpin' }
                    ]
                },
                {
                    id: 'body_shape', question: 'What does the body look like?',
                    options: [
                        { id: 'deep_bodied',  label: 'Deep-bodied / Disc', icon: '⚪', q: 'sunfish bluegill crappie angelfish' },
                        { id: 'elongated',    label: 'Elongated / Torpedo', icon: '➡️', q: 'trout salmon pike minnow dace' },
                        { id: 'flat',         label: 'Flat / Pancake',     icon: '🫓', q: 'flounder halibut flatfish ray skate' },
                        { id: 'eel_like',     label: 'Eel-like / Long',    icon: '〰️', q: 'eel lamprey pipefish' },
                        { id: 'round_blunt',  label: 'Round / Blunt head', icon: '🐡', q: 'puffer sculpin bullhead catfish' }
                    ]
                },
                {
                    id: 'features', question: 'Any distinctive features?', multi: true,
                    options: [
                        { id: 'spiny_dorsal',  label: 'Spiny dorsal fin',     icon: '🌵', q: 'bass perch rockfish' },
                        { id: 'adipose_fin',   label: 'Small adipose fin',    icon: '💧', q: 'trout salmon char' },
                        { id: 'whiskers',      label: 'Whiskers / Barbels',   icon: '🐱', q: 'catfish bullhead sucker carp' },
                        { id: 'forked_tail',   label: 'Deeply forked tail',   icon: '✌️', q: 'tuna bluefish mackerel' },
                        { id: 'bright_colors', label: 'Bright / Bold colors', icon: '🌈', q: 'sunfish wrasse parrotfish dace' },
                        { id: 'large_mouth',   label: 'Very large mouth',     icon: '👄', q: 'bass walleye pike' }
                    ]
                },
                {
                    id: 'color', question: 'Primary color / pattern?', multi: true,
                    options: [
                        { id: 'silver_gray',  label: 'Silver / Gray',     color: '#c0c0c0' },
                        { id: 'brown_olive',  label: 'Brown / Olive',     color: '#6B8E23' },
                        { id: 'green',        label: 'Green',             color: '#2e7d32' },
                        { id: 'yellow',       label: 'Yellow / Gold',     color: '#f1c40f' },
                        { id: 'spotted',      label: 'Spotted / Speckled', icon: '🔵' },
                        { id: 'striped',      label: 'Striped',           icon: '〰️' },
                        { id: 'bright_red',   label: 'Red / Orange',      color: '#e74c3c' }
                    ]
                }
            ]
        },
        Mollusca: {
            label: 'Shell / Mollusk', icon: '🐚',
            steps: [
                {
                    id: 'shell_type', question: 'What type of shell or mollusk?',
                    options: [
                        { id: 'snail_spiral',  label: 'Coiled / Spiral snail',   icon: '🐌', q: 'snail gastropod periwinkle whelk conch' },
                        { id: 'bivalve',       label: 'Two-shelled / Bivalve',   icon: '🐚', q: 'clam oyster mussel scallop cockle' },
                        { id: 'limpet_cap',    label: 'Cap-shaped / Limpet',     icon: '⛰️', q: 'limpet abalone keyhole' },
                        { id: 'chiton',        label: 'Multi-plated / Chiton',   icon: '🪨', q: 'chiton polyplacophora' },
                        { id: 'slug_nudibranch', label: 'No shell / Slug',       icon: '🐛', q: 'slug nudibranch sea slug' },
                        { id: 'cephalopod',    label: 'Octopus / Squid',         icon: '🐙', q: 'octopus squid cuttlefish nautilus' }
                    ]
                },
                {
                    id: 'habitat', question: 'Where did you find it?',
                    options: [
                        { id: 'ocean_beach',   label: 'Ocean beach / Washed up', icon: '🏖️', q: 'marine ocean intertidal' },
                        { id: 'tide_pool',     label: 'Tide pool / Rocky shore', icon: '🪸', q: 'tidepool rocky intertidal' },
                        { id: 'shallow_sea',   label: 'Shallow water / Reef',    icon: '🌊', q: 'reef subtidal shallow marine' },
                        { id: 'freshwater',    label: 'Lake / Stream / Pond',    icon: '💧', q: 'freshwater pond river snail mussel' },
                        { id: 'land_forest',   label: 'Land / Garden / Forest',  icon: '🌲', q: 'land snail slug garden terrestrial' }
                    ]
                },
                {
                    id: 'size', question: 'How big is the shell?',
                    options: [
                        { id: 'tiny',   label: 'Tiny (< 1 cm)',    icon: '🔸', q: 'tiny small periwinkle micro' },
                        { id: 'small',  label: 'Small (1–4 cm)',   icon: '🐚', q: 'small cockle tellin scallop' },
                        { id: 'medium', label: 'Medium (4–12 cm)', icon: '🦪', q: 'medium oyster whelk turban' },
                        { id: 'large',  label: 'Large (> 12 cm)',  icon: '🐘', q: 'large conch abalone giant clam' }
                    ]
                },
                {
                    id: 'color', question: 'Color / pattern?', multi: true,
                    options: [
                        { id: 'white_cream',   label: 'White / Cream',         color: '#f5f0e8', border: true },
                        { id: 'brown_tan',     label: 'Brown / Tan',           color: '#8B6914' },
                        { id: 'orange_pink',   label: 'Orange / Pink',         color: '#e91e8c' },
                        { id: 'purple',        label: 'Purple / Lavender',     color: '#9b59b6' },
                        { id: 'banded',        label: 'Banded / Patterned',    icon: '〰️' },
                        { id: 'iridescent',    label: 'Iridescent / Pearly',   icon: '✨' }
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
                <div class="text-center mb-4">
                    <h3 class="text-lg font-black text-gray-900 dark:text-white mb-0.5">What did you find?</h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400">Pick a category to start</p>
                </div>
                <div class="grid grid-cols-4 gap-2">
                    ${Object.entries(this.TRAIT_TREES).map(([k, v]) => `
                        <button onclick="app.identify.selectCategory('${k}')"
                            class="kg-cat-btn flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent active:border-brand active:scale-95 transition-all">
                            <span class="text-2xl leading-none">${v.icon}</span>
                            <span class="font-bold text-[10px] text-gray-700 dark:text-gray-200 text-center leading-tight">${v.label}</span>
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
            </div>
            ${step.multi ? `
            <button onclick="app.identify.kgNext()"
                class="mt-4 w-full py-4 rounded-2xl font-black text-base transition-all ${Array.isArray(currentSel) && currentSel.length > 0 ? 'bg-brand text-white shadow-lg shadow-brand/30 active:scale-95' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}">
                ${Array.isArray(currentSel) && currentSel.length > 0
                    ? 'Next <span class="material-symbols-rounded" style="vertical-align:middle;font-size:18px">arrow_forward</span>'
                    : 'Select options above &mdash; or <span style="text-decoration:underline;cursor:pointer" onclick="event.stopPropagation();app.identify.kgNext()">Skip</span>'}
            </button>` : ''}
            `;
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

        const lat = this.app.map.pos?.lat || 40.71;
        const lng = this.app.map.pos?.lng || -74.00;
        const tree = this.TRAIT_TREES[this.kgCategory];

        // Collect keyword hints from trait selections (used for client-side scoring only)
        const keywords = [];
        for (const step of tree.steps) {
            const sel = this.kgSelections[step.id];
            if (!sel) continue;
            const ids = Array.isArray(sel) ? sel : [sel];
            for (const id of ids) {
                const opt = step.options.find(o => o.id === id);
                if (opt?.q) keywords.push(...opt.q.split(' '));
                else if (opt && !opt.color) keywords.push(...opt.label.toLowerCase().split(/\s+/));
            }
        }

        try {
            // Fetch all nearby species for this taxon — no text filter (iNat &q= searches
            // observation notes, not species traits, so it always returns 0 for trait words)
            const all = await this.app.inat.queryByTraits(lat, lng, {
                iconic: this.kgCategory,
                limit: 60
            });

            // Score each species: +1 for each keyword that appears in common or scientific name
            if (keywords.length) {
                const kw = keywords.map(k => k.toLowerCase()).filter(k => k.length > 2);
                all.forEach(s => {
                    const haystack = ((s.name || '') + ' ' + (s.sciName || '')).toLowerCase();
                    s._score = kw.reduce((n, k) => n + (haystack.includes(k) ? 1 : 0), 0);
                });
                all.sort((a, b) => (b._score - a._score) || (b.count - a.count));
            }

            this.kgResults = all.slice(0, 20);
        } catch (e) {
            console.error('_fetchKGResults', e);
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

        const hasTarget = !!(this.app.ui && this.app.ui.selectorTarget);
        body.innerHTML = `
            <div class="mb-4">
                <div class="text-xs font-bold uppercase tracking-widest text-brand mb-1">Possible Matches Nearby</div>
                <h3 class="text-lg font-black text-gray-900 dark:text-white">${this.kgResults.length} candidate${this.kgResults.length !== 1 ? 's' : ''} found</h3>
                <p class="text-xs text-gray-400 mt-1">Based on your selections + current location. ${hasTarget ? 'Tap <strong>Use</strong> to log this species.' : 'Tap to view details.'}</p>
            </div>
            <div class="space-y-3">
                ${this.kgResults.map((s, i) => {
                    const nameEsc = (s.name || '').replace(/'/g, "\\'");
                    const sciEsc  = (s.sciName || '').replace(/'/g, "\\'");
                    const useBtn  = hasTarget
                        ? `<button onclick="app.ui._selectSpeciesFromiNat(${s.id}, '${nameEsc}', '${sciEsc}')"
                               class="px-3 py-1.5 bg-brand text-white text-xs font-bold rounded-xl active:scale-95 shrink-0">Use</button>`
                        : `<span class="material-symbols-rounded text-gray-400 text-xl shrink-0">chevron_right</span>`;
                    return `
                    <div class="w-full flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                        <button onclick="app.ui.openSpeciesDetail(${s.id})" class="flex items-center gap-3 flex-1 min-w-0 text-left">
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
                        </button>
                        ${useBtn}
                    </div>`;
                }).join('')}
            </div>
            <button onclick="app.ui.closeKGModal()" class="w-full mt-4 py-3 bg-brand text-white font-bold rounded-xl active:scale-95">Done</button>`;
    },

    // ─── AUDIO ID ─────────────────────────────────────────────────

    /** Lazily initialise the BirdNET web worker. Safe to call multiple times. */
    _initBirdNetWorker() {
        if (this._birdnetWorker) return;
        this._birdnetReady = false;
        this._birdnetLoading = true;
        try {
            this._birdnetWorker = new Worker('js/birdnet-worker.js');
            this._birdnetWorker.onmessage = (e) => this._onWorkerMessage(e);
            this._birdnetWorker.onerror = (e) => {
                console.error('BirdNET worker error:', e);
                this._birdnetLoading = false;
                this._updateLoadingUI(0, 'error');
            };
        } catch (e) {
            console.error('Failed to create BirdNET worker:', e);
            this._birdnetLoading = false;
        }
    },

    _onWorkerMessage(e) {
        const d = e.data;
        switch (d.message) {
            case 'load_model':
            case 'warmup':
            case 'load_geomodel':
            case 'load_labels':
                this._updateLoadingUI(d.progress, d.message);
                break;
            case 'loaded':
                this._birdnetReady = true;
                this._birdnetLoading = false;
                this._updateLoadingUI(100, 'ready');
                if (this._pendingMicStart) {
                    this._pendingMicStart = false;
                    this._startMicStream();
                }
                break;
            case 'pooled':
                if (this.isListening) this._onPooledResults(d.pooled);
                break;
        }
    },

    _updateLoadingUI(progress, stage) {
        const bar = document.getElementById('birdnet-load-bar');
        const label = document.getElementById('birdnet-load-label');
        if (bar) bar.style.width = `${progress}%`;
        if (label) {
            const msgs = {
                load_model: 'Downloading AI model (~50 MB)…',
                warmup: 'Warming up model…',
                load_geomodel: 'Loading regional species data…',
                load_labels: 'Loading species names…',
                ready: '✅ Ready!',
                error: '❌ Failed to load model'
            };
            label.textContent = msgs[stage] || 'Initializing…';
        }
        if (stage === 'ready') {
            const content = document.getElementById('audio-id-content');
            if (content) this._renderReadyToListen(content);
        }
    },

    async startAudioId() {
        this.app.state._usedAudioId = true;
        this.app.saveState();

        const container = document.getElementById('audio-id-content');
        if (!container) return;

        this.stopAudio();
        this._audioSamples = null;
        this._lastPredictMs = 0;
        this._liveDetections = [];

        if (!this._birdnetWorker) this._initBirdNetWorker();

        if (!this._birdnetReady) {
            this._pendingMicStart = true;
            this._showModelLoadingUI(container);
            return;
        }

        await this._startMicStream();
    },

    _showModelLoadingUI(container) {
        container.innerHTML = `
            <div class="flex flex-col items-center py-8 px-4 gap-4">
                <div class="text-5xl animate-pulse">🧠</div>
                <h3 class="font-bold text-gray-900 dark:text-white text-center">Loading BirdNET Model</h3>
                <p class="text-xs text-gray-400 text-center max-w-xs">First use downloads the AI model (~50 MB). It runs entirely on your device — no audio ever leaves your phone.</p>
                <div class="w-full max-w-xs">
                    <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div id="birdnet-load-bar" class="h-full bg-brand rounded-full transition-all duration-500" style="width:0%"></div>
                    </div>
                    <p id="birdnet-load-label" class="text-xs text-center text-gray-400 mt-2">Initializing…</p>
                </div>
                <p class="text-[11px] text-gray-300 dark:text-gray-600 text-center">Subsequent uses load instantly from cache.</p>
            </div>`;
    },

    _renderReadyToListen(container) {
        container.innerHTML = `
            <div class="flex flex-col items-center gap-5 py-6">
                <div class="text-6xl">🐦</div>
                <h3 class="text-xl font-black text-center">Ready to Listen</h3>
                <p class="text-sm text-gray-500 text-center max-w-xs">Point your phone toward birds you hear. BirdNET analyses audio in real-time, on your device.</p>
                <button onclick="app.identify.startAudioId()"
                    class="bg-brand text-white px-10 py-4 rounded-2xl font-black text-lg shadow-lg shadow-brand/30 active:scale-95 transition-transform">
                    <span class="material-symbols-rounded align-middle mr-1">mic</span> Start Listening
                </button>
                <p class="text-[10px] text-gray-300 dark:text-gray-600">🔒 All processing happens on-device</p>
            </div>`;
    },

    async _startMicStream() {
        const container = document.getElementById('audio-id-content');
        if (!container) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { sampleRate: { ideal: 48000 }, channelCount: 1, echoCancellation: false, noiseSuppression: false },
                video: false
            });
            this.mediaStream = stream;
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
            const source = this.audioCtx.createMediaStreamSource(stream);

            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            source.connect(this.analyser);

            await this.audioCtx.audioWorklet.addModule('js/audio-processor.js');
            this._audioWorkletNode = new AudioWorkletNode(this.audioCtx, 'audio-processor');
            source.connect(this._audioWorkletNode);

            const WINDOW = 144000; // 3s at 48 kHz
            const PREDICT_INTERVAL_MS = 750;

            this._audioWorkletNode.port.onmessage = (e) => {
                if (!this.isListening) return;
                const chunk = new Float32Array(e.data);
                const prev = this._audioSamples || new Float32Array(0);
                const combined = new Float32Array(prev.length + chunk.length);
                combined.set(prev);
                combined.set(chunk, prev.length);
                // Keep last 6 seconds to avoid unbounded growth
                this._audioSamples = combined.length > WINDOW * 2 ? combined.slice(-WINDOW * 2) : combined;

                const now = Date.now();
                if (this._audioSamples.length >= WINDOW && now - this._lastPredictMs >= PREDICT_INTERVAL_MS) {
                    this._lastPredictMs = now;
                    const window = this._audioSamples.slice(-WINDOW);
                    this._birdnetWorker.postMessage({ message: 'predict', pcmAudio: window, overlapSec: 1.5, sensitivity: 1.0 });
                }
            };

            this.isListening = true;
            this._listenStartTime = Date.now();

            this._renderAudioListening(container);
            this._drawSpectrogram(container);

            // Send geo context to improve predictions
            const pos = this.app.map?.pos;
            if (pos?.lat && this._birdnetWorker) {
                this._birdnetWorker.postMessage({ message: 'area-scores', latitude: pos.lat, longitude: pos.lng });
            }
        } catch (err) {
            console.error('Audio ID mic error:', err);
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
                <div class="relative w-24 h-24 flex items-center justify-center mb-3">
                    <div class="absolute inset-0 bg-brand/20 rounded-full animate-ping"></div>
                    <div class="absolute inset-2 bg-brand/30 rounded-full animate-ping" style="animation-delay:0.3s"></div>
                    <div class="w-16 h-16 bg-brand rounded-full flex items-center justify-center z-10 shadow-xl shadow-brand/40">
                        <span class="material-symbols-rounded text-white text-3xl">mic</span>
                    </div>
                </div>
                <p class="font-bold text-gray-800 dark:text-white mb-1">Listening…</p>
                <p class="text-xs text-gray-400 mb-3">Results appear in real-time below as birds are detected.</p>
                <canvas id="audio-spectrogram" width="320" height="64" class="rounded-xl bg-gray-900 w-full max-w-sm mb-3"></canvas>
                <div id="birdnet-live-results" class="w-full space-y-2 min-h-[60px]">
                    <p class="text-center text-xs text-gray-400 py-2">Collecting audio… results in ~3 seconds</p>
                </div>
                <button onclick="app.identify.stopAudio(true)"
                    class="mt-4 px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm active:scale-95">
                    Stop &amp; Save Results
                </button>
            </div>`;
    },

    _drawSpectrogram() {
        const draw = () => {
            if (!this.isListening || !this.analyser) return;
            this.animFrame = requestAnimationFrame(draw);
            const canvas = document.getElementById('audio-spectrogram');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const bufLen = this.analyser.frequencyBinCount;
            const data = new Uint8Array(bufLen);
            this.analyser.getByteFrequencyData(data);

            const imgData = ctx.getImageData(2, 0, canvas.width - 2, canvas.height);
            ctx.putImageData(imgData, 0, 0);
            ctx.fillStyle = '#111827';
            ctx.fillRect(canvas.width - 2, 0, 2, canvas.height);

            const slice = Math.floor(bufLen / canvas.height);
            for (let y = 0; y < canvas.height; y++) {
                const v = (data[y * slice] || 0) / 255;
                ctx.fillStyle = `rgb(${Math.round(v * 80)},${Math.round(50 + v * 200)},${Math.round(30 + v * 20)})`;
                ctx.fillRect(canvas.width - 2, canvas.height - y - 1, 2, 1);
            }
        };
        draw();
    },

    _onPooledResults(pooled) {
        const sorted = pooled
            .map(r => ({ ...r, score: r.confidence * Math.max(0.01, r.geoscore) }))
            .filter(r => r.score > 0.01 && r.commonName)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);
        this._liveDetections = sorted;
        this._updateLiveResults();
    },

    _updateLiveResults() {
        const el = document.getElementById('birdnet-live-results');
        if (!el) return;
        if (!this._liveDetections.length) return;

        const hasTarget = !!(this.app.ui && this.app.ui.selectorTarget);

        el.innerHTML = this._liveDetections.map(r => {
            const conf = Math.min(100, Math.round(r.confidence * 100));
            const confColor = conf > 70 ? 'text-green-600' : conf > 40 ? 'text-amber-500' : 'text-gray-400';
            const barColor = conf > 70 ? 'bg-green-500' : conf > 40 ? 'bg-amber-400' : 'bg-gray-400';
            const sciEsc = r.scientificName.replace(/'/g, "\\'");
            const nameEsc = r.commonName.replace(/'/g, "\\'");
            const useBtn = hasTarget
                ? `<button onclick="app.ui._selectSpeciesFromiNat('', '${nameEsc}', '${sciEsc}')"
                       class="ml-1 px-3 py-1.5 bg-brand text-white text-xs font-bold rounded-xl active:scale-95 shrink-0">Use</button>`
                : '';
            return `
                <div class="w-full flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <button onclick="app.ui.openSpeciesDetailByName('${sciEsc}')" class="flex items-center gap-3 flex-1 min-w-0 text-left">
                        <div class="text-2xl shrink-0">🐦</div>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold text-sm text-gray-900 dark:text-white truncate">${r.commonName}</div>
                            <div class="text-xs text-gray-400 italic truncate">${r.scientificName}</div>
                            <div class="mt-1.5 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div class="h-full ${barColor} rounded-full transition-all duration-500" style="width:${conf}%"></div>
                            </div>
                        </div>
                        <span class="text-sm font-black ${confColor} tabular-nums">${conf}%</span>
                    </button>
                    ${useBtn}
                </div>`;
        }).join('');
    },

    stopAudio(andShowFinal = false) {
        this.isListening = false;
        this._pendingMicStart = false;
        if (this.animFrame) { cancelAnimationFrame(this.animFrame); this.animFrame = null; }
        if (this._countdownTimer) { clearInterval(this._countdownTimer); this._countdownTimer = null; }
        if (this._audioWorkletNode) {
            try { this._audioWorkletNode.disconnect(); } catch (_) {}
            this._audioWorkletNode.port.onmessage = null;
            this._audioWorkletNode = null;
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
        this._audioSamples = null;

        if (andShowFinal) this._showFinalResults();
    },

    _showFinalResults() {
        const container = document.getElementById('audio-id-content');
        if (!container) return;

        if (!this._liveDetections.length) {
            container.innerHTML = `
                <div class="text-center py-8 px-4">
                    <div class="text-5xl mb-3">🔇</div>
                    <h3 class="font-bold text-gray-800 dark:text-white mb-2">No birds detected</h3>
                    <p class="text-sm text-gray-500 mb-4">Try again in a quieter outdoor spot, or hold the phone toward where you hear birds.</p>
                    <button onclick="app.identify.startAudioId()" class="bg-brand text-white px-8 py-3 rounded-xl font-bold active:scale-95">Try Again</button>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="mb-4">
                <div class="flex items-center gap-2 mb-1">
                    <span class="material-symbols-rounded text-brand text-xl">verified</span>
                    <h3 class="font-black text-gray-900 dark:text-white">BirdNET Results</h3>
                </div>
                <p class="text-xs text-gray-400">Identified from audio on your device. Tap a species to learn more or log it.</p>
            </div>
            <div id="birdnet-live-results" class="space-y-2"></div>
            <button onclick="app.identify.startAudioId()" class="w-full mt-4 py-3 bg-brand text-white font-bold rounded-xl active:scale-95">Listen Again</button>`;

        this._updateLiveResults();
    }
};

