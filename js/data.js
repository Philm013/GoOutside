export const data = {
    VERSION: 4,

    LEVEL_TITLES: [
        'Curious Naturalist', 'Field Observer', 'Nature Enthusiast', 'Wildlife Tracker',
        'Ecosystem Explorer', 'Species Specialist', 'Conservation Guardian', 'Master Naturalist',
        'Nature Sage', 'Earth Steward', 'Wild Visionary', 'Biosphere Guardian',
        'Legendary Naturalist', 'Earth Day Champion', 'Planet Protector'
    ],

    BADGES: [
        { id: 'first_obs',      icon: '🌱', name: 'First Steps',        desc: 'Log your first observation.',        test: s => s.observations.length >= 1 },
        { id: 'obs_5',          icon: '👀', name: 'Keen Eye',            desc: 'Log 5 observations.',                test: s => s.observations.length >= 5 },
        { id: 'obs_25',         icon: '📒', name: 'Field Notes',         desc: 'Log 25 observations.',               test: s => s.observations.length >= 25 },
        { id: 'obs_100',        icon: '🏅', name: 'Centurion',           desc: 'Log 100 observations.',              test: s => s.observations.length >= 100 },
        { id: 'obs_250',        icon: '📖', name: "Naturalist's Bible",  desc: 'Log 250 observations.',              test: s => s.observations.length >= 250 },
        { id: 'obs_500',        icon: '✨', name: 'Living Encyclopedia', desc: 'Log 500 observations.',              test: s => s.observations.length >= 500 },
        { id: 'spp_10',         icon: '🗂️', name: 'Collector',           desc: 'Catalogue 10 species.',              test: s => Object.keys(s.catalogue).length >= 10 },
        { id: 'spp_50',         icon: '📚', name: 'Encyclopedist',       desc: 'Catalogue 50 species.',              test: s => Object.keys(s.catalogue).length >= 50 },
        { id: 'spp_100',        icon: '🏆', name: 'Species Champion',   desc: 'Catalogue 100 species.',             test: s => Object.keys(s.catalogue).length >= 100 },
        { id: 'streak_3',       icon: '🔥', name: 'Daily Observer',      desc: 'Maintain a 3-day streak.',           test: s => s.streak >= 3 },
        { id: 'streak_7',       icon: '⚡', name: 'Week in the Wild',    desc: 'Maintain a 7-day streak.',           test: s => s.streak >= 7 },
        { id: 'streak_30',      icon: '🌟', name: 'Month of Nature',     desc: 'Maintain a 30-day streak.',          test: s => s.streak >= 30 },
        { id: 'bird_10',        icon: '🐦', name: 'Bird Watcher',        desc: 'Catalogue 10 bird species.',         test: s => Object.values(s.catalogue).filter(c => c.iconic === 'Aves').length >= 10 },
        { id: 'bird_25',        icon: '🦅', name: 'Ornithologist',       desc: 'Catalogue 25 bird species.',         test: s => Object.values(s.catalogue).filter(c => c.iconic === 'Aves').length >= 25 },
        { id: 'plant_10',       icon: '🌿', name: 'Botanist',            desc: 'Catalogue 10 plant species.',        test: s => Object.values(s.catalogue).filter(c => c.iconic === 'Plantae').length >= 10 },
        { id: 'plant_25',       icon: '🌳', name: 'Arborist',            desc: 'Catalogue 25 plant species.',        test: s => Object.values(s.catalogue).filter(c => c.iconic === 'Plantae').length >= 25 },
        { id: 'insect_10',      icon: '🦋', name: 'Entomologist',        desc: 'Catalogue 10 insect species.',       test: s => Object.values(s.catalogue).filter(c => c.iconic === 'Insecta').length >= 10 },
        { id: 'mammal_5',       icon: '🦊', name: 'Mammal Tracker',      desc: 'Catalogue 5 mammal species.',        test: s => Object.values(s.catalogue).filter(c => c.iconic === 'Mammalia').length >= 5 },
        { id: 'mammal_15',      icon: '🐻', name: 'Mammalogist',         desc: 'Catalogue 15 mammal species.',       test: s => Object.values(s.catalogue).filter(c => c.iconic === 'Mammalia').length >= 15 },
        { id: 'reptile_3',      icon: '🦎', name: 'Reptile Wrangler',    desc: 'Catalogue 3 reptile species.',       test: s => Object.values(s.catalogue).filter(c => c.iconic === 'Reptilia').length >= 3 },
        { id: 'amphibian_3',    icon: '🐸', name: 'Frogger',             desc: 'Catalogue 3 amphibian species.',     test: s => Object.values(s.catalogue).filter(c => c.iconic === 'Amphibia').length >= 3 },
        { id: 'fish_5',         icon: '🐟', name: 'Angler',              desc: 'Catalogue 5 fish species.',          test: s => Object.values(s.catalogue).filter(c => c.iconic === 'Actinopterygii').length >= 5 },
        { id: 'shell_5',        icon: '🐚', name: 'Shell Collector',     desc: 'Catalogue 5 shell/mollusk species.', test: s => Object.values(s.catalogue).filter(c => c.iconic === 'Mollusca').length >= 5 },
        { id: 'fungi_5',        icon: '🍄', name: 'Mycologist',          desc: 'Catalogue 5 fungi species.',         test: s => Object.values(s.catalogue).filter(c => c.iconic === 'Fungi').length >= 5 },
        { id: 'arachnid_3',     icon: '🕷️', name: 'Arachnologist',       desc: 'Catalogue 3 arachnid species.',      test: s => Object.values(s.catalogue).filter(c => c.iconic === 'Arachnida').length >= 3 },
        { id: 'all_taxa',       icon: '🌍', name: 'Citizen Scientist',   desc: 'Observe 6 different taxa groups.',   test: s => new Set(Object.values(s.catalogue).map(c => c.iconic)).size >= 6 },
        { id: 'all_10_taxa',    icon: '🧬', name: 'Full Spectrum',       desc: 'Observe all 10 taxa groups.',        test: s => new Set(Object.values(s.catalogue).map(c => c.iconic)).size >= 10 },
        { id: 'rare_find',      icon: '💎', name: 'Rare Find',           desc: 'Log a rare species observation.',    test: s => s.observations.some(o => o.rarity === 'Rare') },
        { id: 'photo_logger',   icon: '📷', name: 'Photo Logger',        desc: 'Log an observation with a photo.',   test: s => s.observations.some(o => o.imageUri) },
        { id: 'first_audio_id', icon: '🎤', name: 'Ear to the Ground',   desc: 'Use the Audio ID tool.',             test: s => s._usedAudioId === true },
        { id: 'first_key_out',  icon: '🔬', name: 'Nature Detective',    desc: 'Use the Knowledge Graph ID.',        test: s => s._usedKeyOut === true },
        { id: 'first_party',    icon: '👥', name: 'Nature Party',        desc: 'Join a nature exploration party.',   test: s => s._joinedParty === true },
        { id: 'gift_sender',    icon: '🎁', name: 'Gift Giver',          desc: 'Send a gift to a party member.',     test: s => s._sentGift === true },
        { id: 'party_sighting', icon: '🤝', name: 'Shared Discovery',    desc: 'Share a sighting with your party.',  test: s => s._sharedSighting === true },
    ],

    calcLevel(dp) {
        let lvl = 1, req = 500;
        let remaining = dp;
        while (remaining >= req) {
            remaining -= req;
            lvl++;
            req = Math.floor(req * 1.8);
        }
        const title = this.LEVEL_TITLES[Math.min(lvl - 1, this.LEVEL_TITLES.length - 1)];
        return { level: lvl, curr: remaining, req, pct: (remaining / req) * 100, title };
    },

    calcObservationDP(species, state) {
        const base = species.dp || 50;
        const catalogueEntry = state.catalogue[species.id];
        const isFirst = !catalogueEntry;
        const streakBonus = Math.min(state.streak, 30) * 0.01; // up to +30%
        let dp = base;
        if (isFirst) dp *= 2;
        dp = Math.round(dp * (1 + streakBonus));
        return dp;
    },

    checkBadges(state) {
        const newBadges = [];
        for (const badge of this.BADGES) {
            if (!state.badges.includes(badge.id) && badge.test(state)) {
                state.badges.push(badge.id);
                newBadges.push(badge);
            }
        }
        return newBadges;
    },

    updateStreak(state) {
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        if (state.lastSeen === today) return; // already counted today
        if (state.lastSeen === yesterday) {
            state.streak = (state.streak || 0) + 1;
        } else if (state.lastSeen !== today) {
            state.streak = 1; // reset
        }
        state.longestStreak = Math.max(state.streak, state.longestStreak || 0);
        state.lastSeen = today;
    },

    // Current month name for season display
    currentSeason() {
        const m = new Date().getMonth();
        if (m >= 2 && m <= 4) return { name: 'Spring', icon: '🌸', color: 'pink' };
        if (m >= 5 && m <= 7) return { name: 'Summer', icon: '☀️', color: 'amber' };
        if (m >= 8 && m <= 10) return { name: 'Autumn', icon: '🍂', color: 'orange' };
        return { name: 'Winter', icon: '❄️', color: 'blue' };
    },

    normalizeState(raw = {}) {
        const def = this.defaultState();
        const s = { ...def, ...raw };
        if (!Array.isArray(s.observations)) s.observations = [];
        if (typeof s.catalogue !== 'object' || s.catalogue === null) s.catalogue = {};
        if (!Array.isArray(s.badges)) s.badges = [];
        if (typeof s.settings !== 'object') s.settings = {};
        // Migrate from old xp field: only if raw had no discoveryPoints of its own
        if (!('discoveryPoints' in (raw || {})) && raw && raw.xp) s.discoveryPoints = raw.xp;
        // Migrate old catalogue entries lacking iconic field
        for (const [k, v] of Object.entries(s.catalogue)) {
            if (!v.iconic) s.catalogue[k].iconic = 'Animalia';
        }
        return s;
    },

    defaultState() {
        return {
            version: this.VERSION,
            username: `Naturalist${Math.floor(Math.random() * 9999)}`,
            avatar: '🦋',
            bio: '',
            discoveryPoints: 0,
            streak: 0,
            longestStreak: 0,
            lastSeen: '',
            observations: [],
            catalogue: {},
            badges: [],
            settings: {}
        };
    }
};
