import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { inat } from '../js/inat.js';

describe('inat.iconicLabel()', () => {
    const cases = [
        ['Aves', 'Bird'],
        ['Plantae', 'Plant'],
        ['Mammalia', 'Mammal'],
        ['Insecta', 'Insect'],
        ['Reptilia', 'Reptile'],
        ['Amphibia', 'Amphibian'],
        ['Arachnida', 'Arachnid'],
        ['Fungi', 'Fungus'],
        ['Actinopterygii', 'Fish'],
        ['Mollusca', 'Mollusk'],
        ['Animalia', 'Animal'],
    ];
    for (const [iconic, expected] of cases) {
        test(`${iconic} => ${expected}`, () => {
            assert.equal(inat.iconicLabel(iconic), expected);
        });
    }

    test('unknown taxon returns the taxon name itself', () => {
        assert.equal(inat.iconicLabel('Chromista'), 'Chromista');
    });

    test('null/undefined returns Wildlife', () => {
        assert.equal(inat.iconicLabel(null), 'Wildlife');
        assert.equal(inat.iconicLabel(undefined), 'Wildlife');
    });
});

describe('inat.iconicEmoji()', () => {
    const cases = [
        ['Aves', '🐦'],
        ['Plantae', '🌿'],
        ['Mammalia', '🦊'],
        ['Insecta', '🦋'],
        ['Reptilia', '🦎'],
        ['Amphibia', '🐸'],
        ['Arachnida', '🕷️'],
        ['Fungi', '🍄'],
        ['Actinopterygii', '🐟'],
        ['Mollusca', '🐌'],
        ['Animalia', '🐾'],
    ];
    for (const [iconic, expected] of cases) {
        test(`${iconic} => ${expected}`, () => {
            assert.equal(inat.iconicEmoji(iconic), expected);
        });
    }

    test('unknown taxon returns globe emoji', () => {
        assert.equal(inat.iconicEmoji('Chromista'), '🌍');
    });

    test('null/undefined returns globe emoji', () => {
        assert.equal(inat.iconicEmoji(null), '🌍');
        assert.equal(inat.iconicEmoji(undefined), '🌍');
    });
});

describe('inat cache (_get/_set)', () => {
    beforeEach(() => {
        // Reset cache before each test
        inat._cache = {};
    });

    test('_get returns null for missing key', () => {
        assert.equal(inat._get('nonexistent'), null);
    });

    test('_set stores data retrievable by _get', () => {
        const data = [{ id: 1, name: 'Robin' }];
        inat._set('test-key', data);
        assert.deepEqual(inat._get('test-key'), data);
    });

    test('_get returns null for expired entry (TTL elapsed)', () => {
        const key = 'expired-key';
        inat._cache[key] = { data: ['old'], ts: Date.now() - inat._ttl - 1 };
        assert.equal(inat._get(key), null);
    });

    test('_get returns data for fresh entry', () => {
        const key = 'fresh-key';
        inat._cache[key] = { data: ['fresh'], ts: Date.now() - (inat._ttl / 2) };
        assert.deepEqual(inat._get(key), ['fresh']);
    });

    test('TTL is 10 minutes (600000ms)', () => {
        assert.equal(inat._ttl, 10 * 60 * 1000);
    });

    test('_set returns the data passed in', () => {
        const d = { foo: 'bar' };
        assert.deepEqual(inat._set('retval-key', d), d);
    });

    test('overwriting a cache key updates timestamp', () => {
        inat._cache['k'] = { data: ['old'], ts: Date.now() - inat._ttl - 1 };
        inat._set('k', ['new']);
        assert.deepEqual(inat._get('k'), ['new']);
    });
});

describe('inat.nearbyObservations() with mocked fetch', () => {
    const mockObs = [{ id: 101, taxon: { id: 1 }, observed_on: '2025-01-01' }];

    beforeEach(() => {
        inat._cache = {};
        global.fetch = async () => ({ json: async () => ({ results: mockObs }) });
    });

    test('returns array from API results', async () => {
        const results = await inat.nearbyObservations(40.71, -74.00);
        assert.deepEqual(results, mockObs);
    });

    test('caches result on second call (fetch not called again)', async () => {
        let calls = 0;
        global.fetch = async () => { calls++; return { json: async () => ({ results: mockObs }) }; };
        await inat.nearbyObservations(40.71, -74.00);
        await inat.nearbyObservations(40.71, -74.00);
        assert.equal(calls, 1);
    });

    test('returns [] on fetch error', async () => {
        global.fetch = async () => { throw new Error('network error'); };
        const results = await inat.nearbyObservations(40.71, -74.00);
        assert.deepEqual(results, []);
    });
});

describe('inat.seasonalSpecies() result shaping', () => {
    beforeEach(() => {
        inat._cache = {};
        global.fetch = async () => ({
            json: async () => ({
                results: [
                    {
                        count: 150,
                        taxon: {
                            id: 9, name: 'Turdus migratorius',
                            preferred_common_name: 'American Robin',
                            iconic_taxon_name: 'Aves',
                            default_photo: { medium_url: 'https://x.com/med.jpg', square_url: 'https://x.com/sq.jpg' }
                        }
                    },
                    {
                        count: 5,
                        taxon: {
                            id: 10, name: 'Rare Plant',
                            preferred_common_name: null,
                            iconic_taxon_name: 'Plantae',
                            default_photo: { medium_url: 'https://x.com/med2.jpg', square_url: 'https://x.com/sq2.jpg' }
                        }
                    },
                    {
                        count: 50,
                        taxon: {
                            id: 11, name: 'No Photo Plant',
                            preferred_common_name: 'No Photo',
                            iconic_taxon_name: 'Plantae',
                            default_photo: null  // should be filtered out
                        }
                    }
                ]
            })
        });
    });

    test('shapes results to expected format', async () => {
        const results = await inat.seasonalSpecies(40.0, -74.0);
        assert.equal(results.length, 2); // no-photo filtered out
        assert.equal(results[0].name, 'American Robin');
        assert.equal(results[0].sciName, 'Turdus migratorius');
        assert.equal(results[0].id, 9);
        assert.equal(results[0].iconic, 'Aves');
        assert.equal(results[0].img, 'https://x.com/med.jpg');
        assert.equal(results[0].squareImg, 'https://x.com/sq.jpg');
    });

    test('count > 100 => Common, dp=50', async () => {
        const results = await inat.seasonalSpecies(40.0, -74.0);
        assert.equal(results[0].rarity, 'Common');
        assert.equal(results[0].dp, 50);
    });

    test('count <= 20 => Rare, dp=200', async () => {
        const results = await inat.seasonalSpecies(40.0, -74.0);
        const rare = results.find(s => s.id === 10);
        assert.equal(rare.rarity, 'Rare');
        assert.equal(rare.dp, 200);
    });

    test('uses taxon.name as fallback for preferred_common_name', async () => {
        const results = await inat.seasonalSpecies(40.0, -74.0);
        const noCommon = results.find(s => s.id === 10);
        assert.equal(noCommon.name, 'Rare Plant');
    });
});

describe('inat.searchTaxa() query guard', () => {
    beforeEach(() => {
        inat._cache = {};
        global.fetch = async () => ({ json: async () => ({ results: [{ id: 1 }] }) });
    });

    test('returns [] for empty query', async () => {
        const r = await inat.searchTaxa('');
        assert.deepEqual(r, []);
    });

    test('returns [] for single-char query', async () => {
        const r = await inat.searchTaxa('a');
        assert.deepEqual(r, []);
    });

    test('returns results for 2+ char query', async () => {
        const r = await inat.searchTaxa('ro');
        assert.ok(r.length > 0);
    });
});
