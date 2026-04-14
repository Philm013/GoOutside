export const data = {
    async fetchSpecies(app) {
        const lat = app.map.pos.lat || 40.71;
        const lng = app.map.pos.lng || -74.00;
        try {
            // Increased per_page to 500 for a much larger field guide
            const res = await fetch(`https://api.inaturalist.org/v1/observations/species_counts?lat=${lat}&lng=${lng}&radius=50&month=${new Date().getMonth() + 1}&iconic_taxa=Plantae,Aves,Mammalia,Insecta,Amphibia,Reptilia&verifiable=true&per_page=500`);
            const json = await res.json();
            app.localSpecies = json.results.map(i => {
                const c = i.count;
                return {
                    id: i.taxon.id,
                    name: i.taxon.preferred_common_name || i.taxon.name,
                    img: i.taxon.default_photo?.medium_url,
                    category: i.taxon.iconic_taxon_name,
                    xp: Math.round(1000 / (c + 10)),
                    seeds: Math.round(100 / (c + 10)),
                    rarity: c > 100 ? 'Common' : c > 20 ? 'Uncommon' : 'Rare'
                };
            }).filter(s => s.img).sort((a, b) => a.name.localeCompare(b.name));
            if (app.ui) app.ui.renderFieldGuide(true);
        } catch (e) {
            console.error("Failed to fetch species:", e);
        }
    },
    getSpecies(app, id) {
        return app.localSpecies.find(s => s.id == id);
    },
    calcLevel(xp) {
        let lvl = 1, req = 100;
        while (xp >= req) {
            xp -= req;
            lvl++;
            req = Math.floor(req * 1.5);
        }
        return { level: lvl, curr: xp, req, pct: (xp / req) * 100 };
    },
    defaultState: () => ({
        username: `Explorer${Math.floor(Math.random() * 999)}`,
        xp: 0,
        seeds: 0,
        streak: 1,
        lastLogin: new Date().toDateString(),
        avatar: '🦋',
        speciesData: {},
        quests: {
            daily: {
                description: "Log 3 species",
                progress: 0,
                target: 3,
                rewards: { xp: 150, seeds: 50 }
            }
        }
    })
};
