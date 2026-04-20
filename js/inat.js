// iNaturalist API module — v2 REST API (unauthenticated)
export const inat = {
    BASE: 'https://api.inaturalist.org/v2',

    // Cache: { key → { data, ts } }
    _cache: {},
    _ttl: 10 * 60 * 1000, // 10 min

    _get(key) {
        const e = this._cache[key];
        return e && Date.now() - e.ts < this._ttl ? e.data : null;
    },
    _set(key, data) {
        this._cache[key] = { data, ts: Date.now() };
        return data;
    },

    normalizeIconicTaxon(iconic) {
        const raw = String(iconic || '').trim();
        if (!raw) return 'Animalia';
        const key = raw.toLowerCase();
        const map = {
            aves: 'Aves', bird: 'Aves', birds: 'Aves',
            plantae: 'Plantae', plant: 'Plantae', plants: 'Plantae',
            mammalia: 'Mammalia', mammal: 'Mammalia', mammals: 'Mammalia',
            insecta: 'Insecta', insect: 'Insecta', insects: 'Insecta',
            reptilia: 'Reptilia', reptile: 'Reptilia', reptiles: 'Reptilia',
            amphibia: 'Amphibia', amphibian: 'Amphibia', amphibians: 'Amphibia',
            actinopterygii: 'Actinopterygii', fish: 'Actinopterygii', fishes: 'Actinopterygii',
            mollusca: 'Mollusca', mollusk: 'Mollusca', mollusks: 'Mollusca', mollusc: 'Mollusca', molluscs: 'Mollusca', shell: 'Mollusca', shells: 'Mollusca',
            arachnida: 'Arachnida', arachnid: 'Arachnida', arachnids: 'Arachnida', spider: 'Arachnida', spiders: 'Arachnida',
            fungi: 'Fungi', fungus: 'Fungi',
            animalia: 'Animalia', animal: 'Animalia', animals: 'Animalia'
        };
        return map[key] || raw;
    },

    // Shared field sets
    OBS_FIELDS: [
        'id', 'uuid', 'observed_on', 'place_guess', 'location', 'description',
        'quality_grade',
        'taxon.id', 'taxon.name', 'taxon.preferred_common_name',
        'taxon.iconic_taxon_name', 'taxon.rank',
        'taxon.conservation_status.status_name',
        'taxon.default_photo.url', 'taxon.default_photo.medium_url', 'taxon.default_photo.square_url',
        'photos.url', 'photos.medium_url', 'photos.square_url',
        'user.login', 'user.icon_url'
    ].join(','),

    TAXON_FIELDS: [
        'taxon.id', 'taxon.name', 'taxon.preferred_common_name',
        'taxon.iconic_taxon_name', 'taxon.rank',
        'taxon.conservation_status.status_name',
        'taxon.default_photo.url', 'taxon.default_photo.medium_url', 'taxon.default_photo.square_url'
    ].join(','),

    // Nearby community observations (for map & discover feed)
    async nearbyObservations(lat, lng, { radius = 30, limit = 60, days = 14, iconic = null } = {}) {
        const d = new Date();
        d.setDate(d.getDate() - days);
        const since = d.toISOString().split('T')[0];
        const iconicParam = iconic ? `&iconic_taxa=${iconic}` : '';
        const key = `nearbyObs:${lat.toFixed(2)}:${lng.toFixed(2)}:${radius}:${days}:${iconic}`;
        const cached = this._get(key);
        if (cached) return cached;
        try {
            const res = await fetch(
                `${this.BASE}/observations?lat=${lat}&lng=${lng}&radius=${radius}&d1=${since}` +
                `&order_by=observed_on&order=desc&per_page=${limit}` +
                `&has[]=photos&verifiable=true${iconicParam}&fields=${this.OBS_FIELDS}`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            return this._set(key, json.results || []);
        } catch (e) {
            console.error('inat.nearbyObservations', e);
            return [];
        }
    },

    // Species counts near location in current month (for field guide & seasonal)
    // Now includes Fish (Actinopterygii) and Shells/Mollusks (Mollusca) by default
    async seasonalSpecies(lat, lng, { radius = 50, limit = 200, iconic = null } = {}) {
        const month = new Date().getMonth() + 1;
        const iconicParam = iconic
            ? `&iconic_taxa=${iconic}`
            : `&iconic_taxa=Plantae,Aves,Mammalia,Insecta,Amphibia,Reptilia,Actinopterygii,Mollusca`;
        const key = `seasonal:${lat.toFixed(2)}:${lng.toFixed(2)}:${radius}:${month}:${iconic}`;
        const cached = this._get(key);
        if (cached) return cached;
        try {
            const res = await fetch(
                `${this.BASE}/observations/species_counts?lat=${lat}&lng=${lng}&radius=${radius}` +
                `&month=${month}${iconicParam}&verifiable=true&per_page=${limit}&fields=${this.TAXON_FIELDS}`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const results = (json.results || []).map(i => {
                const c = i.count;
                const t = i.taxon;
                return {
                    id: t.id,
                    name: t.preferred_common_name || t.name,
                    sciName: t.name,
                    img: t.default_photo?.medium_url,
                    squareImg: t.default_photo?.square_url,
                    iconic: t.iconic_taxon_name,
                    rank: t.rank,
                    conservationStatus: t.conservation_status?.status_name || null,
                    count: c,
                    rarity: c > 100 ? 'Common' : c > 20 ? 'Uncommon' : 'Rare',
                    dp: Math.round(c > 100 ? 50 : c > 20 ? 100 : 200)
                };
            });
            return this._set(key, results);
        } catch (e) {
            console.error('inat.seasonalSpecies', e);
            return [];
        }
    },

    // Taxa autocomplete search
    async searchTaxa(q, { iconic = null, lat = null, lng = null, limit = 20 } = {}) {
        if (!q || q.length < 2) return [];
        const iconicParam = iconic ? `&iconic_taxa=${iconic}` : '';
        const locationParam = lat && lng ? `&lat=${lat}&lng=${lng}` : '';
        const key = `taxa:${q}:${iconic}`;
        const cached = this._get(key);
        if (cached) return cached;
        try {
            const fields = 'id,name,preferred_common_name,iconic_taxon_name,rank,default_photo.square_url,default_photo.medium_url';
            const res = await fetch(
                `${this.BASE}/taxa/autocomplete?q=${encodeURIComponent(q)}&per_page=${limit}${iconicParam}${locationParam}&fields=${fields}`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            return this._set(key, json.results || []);
        } catch (e) {
            console.error('inat.searchTaxa', e);
            return [];
        }
    },

    // Taxa details by ID (for species detail panel)
    async getTaxon(id) {
        const key = `taxon:${id}`;
        const cached = this._get(key);
        if (cached) return cached;
        try {
            const fields = 'id,name,preferred_common_name,iconic_taxon_name,rank,wikipedia_summary,' +
                'conservation_status.status_name,conservation_status.iucn_status_code,' +
                'establishment_means.establishment_means,' +
                'default_photo.url,default_photo.medium_url,default_photo.square_url,' +
                'taxon_photos.photo.url,taxon_photos.photo.medium_url,taxon_photos.photo.square_url,' +
                'taxon_photos.photo.attribution';
            const res = await fetch(`${this.BASE}/taxa/${id}?fields=${fields}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const t = (json.results || [])[0];
            return t ? this._set(key, t) : null;
        } catch (e) {
            console.error('inat.getTaxon', e);
            return null;
        }
    },

    // ID summaries for a taxon — photo tips & visual key groups from community identifiers
    // See: GET /taxa/{id}/id_summaries
    async getTaxonIdSummary(id) {
        const key = `idsum:${id}`;
        const cached = this._get(key);
        if (cached) return cached;
        try {
            const res = await fetch(`${this.BASE}/taxa/${id}/id_summaries`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const results = (json.results || []).slice(0, 5).map(s => ({
                summary: s.summary || '',
                photoTip: s.photo_tip || '',
                visualKeyGroup: s.visual_key_group || ''
            })).filter(s => s.summary || s.photoTip);
            return this._set(key, results);
        } catch (e) {
            // ID summaries endpoint may not have data for all taxa; that's fine
            return this._set(key, []);
        }
    },

    // Top species for an iconic taxon — used by knowledge graph
    async queryByTraits(lat, lng, { iconic, q = null, month = null, limit = 24 } = {}) {
        const m = month || (new Date().getMonth() + 1);
        const qParam = q ? `&q=${encodeURIComponent(q)}` : '';
        const key = `traits:${lat.toFixed(2)}:${lng.toFixed(2)}:${iconic}:${m}:${q}`;
        const cached = this._get(key);
        if (cached) return cached;
        try {
            const res = await fetch(
                `${this.BASE}/observations/species_counts?lat=${lat}&lng=${lng}&radius=100` +
                `&month=${m}&iconic_taxa=${iconic}&verifiable=true&per_page=${limit}${qParam}&fields=${this.TAXON_FIELDS}`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            return this._set(key, (json.results || []).map(i => ({
                id: i.taxon.id,
                name: i.taxon.preferred_common_name || i.taxon.name,
                sciName: i.taxon.name,
                img: i.taxon.default_photo?.medium_url,
                squareImg: i.taxon.default_photo?.square_url,
                iconic: i.taxon.iconic_taxon_name,
                rank: i.taxon.rank,
                conservationStatus: i.taxon.conservation_status?.status_name || null,
                count: i.count,
                rarity: i.count > 100 ? 'Common' : i.count > 20 ? 'Uncommon' : 'Rare',
                dp: Math.round(i.count > 100 ? 50 : i.count > 20 ? 100 : 200),
                taxonDetails: i.taxon
            })).filter(s => s.img));
        } catch (e) {
            console.error('inat.queryByTraits', e);
            return [];
        }
    },

    // Top species for "In Season" spotlight
    async spotlight(lat, lng) {
        const allObs = await this.seasonalSpecies(lat, lng, { limit: 100 });
        const picks = allObs.filter(s => s.rarity !== 'Common').slice(0, 6);
        if (picks.length < 3) return allObs.slice(0, 6);
        return picks;
    },

    // Helper: quality grade label + icon
    qualityGradeLabel(grade) {
        if (grade === 'research') return { label: 'Research Grade', icon: '🔬', css: 'bg-green-100 text-green-700' };
        if (grade === 'needs_id')  return { label: 'Needs ID',       icon: '🔍', css: 'bg-blue-100 text-blue-700' };
        return { label: 'Casual', icon: '📷', css: 'bg-gray-100 text-gray-500' };
    },

    // Helper: IUCN conservation status badge
    conservationBadge(statusName) {
        if (!statusName) return null;
        const s = statusName.toLowerCase();
        if (s.includes('extinct') && !s.includes('wild'))  return { label: statusName, css: 'bg-gray-900 text-white' };
        if (s.includes('extinct in the wild'))              return { label: statusName, css: 'bg-purple-700 text-white' };
        if (s.includes('critically'))                       return { label: statusName, css: 'bg-red-700 text-white' };
        if (s.includes('endangered'))                       return { label: statusName, css: 'bg-red-500 text-white' };
        if (s.includes('vulnerable'))                       return { label: statusName, css: 'bg-orange-500 text-white' };
        if (s.includes('near'))                             return { label: statusName, css: 'bg-yellow-500 text-black' };
        if (s.includes('least'))                            return { label: statusName, css: 'bg-green-500 text-white' };
        return { label: statusName, css: 'bg-gray-200 text-gray-700' };
    },

    // Helper: iconic taxon label
    iconicLabel(iconic) {
        const map = {
            Aves: 'Bird', Plantae: 'Plant', Mammalia: 'Mammal',
            Insecta: 'Insect', Reptilia: 'Reptile', Amphibia: 'Amphibian',
            Arachnida: 'Arachnid', Fungi: 'Fungus', Actinopterygii: 'Fish',
            Mollusca: 'Mollusk', Animalia: 'Animal', Chromista: 'Seaweed',
            Protozoa: 'Protozoa'
        };
        return map[iconic] || iconic || 'Wildlife';
    },

    // Iconic taxon icon
    iconicEmoji(iconic) {
        const map = {
            Aves: '🐦', Plantae: '🌿', Mammalia: '🦊',
            Insecta: '🦋', Reptilia: '🦎', Amphibia: '🐸',
            Arachnida: '🕷️', Fungi: '🍄', Actinopterygii: '🐟',
            Mollusca: '🐚', Animalia: '🐾', Chromista: '🪸',
            Protozoa: '🔬'
        };
        return map[iconic] || '🌍';
    }
};
