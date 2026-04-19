import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ui } from '../js/ui.js';
import { inat } from '../js/inat.js';
import { data } from '../js/data.js';
import { journal } from '../js/journal.js';

// Build minimal mock app for ui tests
function makeApp(stateOverride = {}) {
    const state = { ...data.defaultState(), ...stateOverride };
    const j = Object.create(journal);
    j.app = { inat, state };

    return {
        inat,
        data,
        state,
        haptics: null,
        map: null,
        journal: j,
        hud: { renderHUDStats() {} },
        localSpecies: [
            { id: 9, name: 'American Robin', sciName: 'Turdus migratorius', iconic: 'Aves', rarity: 'Common', dp: 50, img: 'https://x.com/img.jpg', squareImg: 'https://x.com/sq.jpg' },
            { id: 14, name: 'Red Fox', sciName: 'Vulpes vulpes', iconic: 'Mammalia', rarity: 'Uncommon', dp: 100, img: 'https://x.com/fox.jpg', squareImg: 'https://x.com/foxsq.jpg' },
            { id: 27, name: 'Monarch Butterfly', sciName: 'Danaus plexippus', iconic: 'Insecta', rarity: 'Rare', dp: 200, img: 'https://x.com/monarch.jpg', squareImg: 'https://x.com/monarchsq.jpg' }
        ]
    };
}

describe('ui._emptyState()', () => {
    test('returns HTML string containing the message', () => {
        const html = ui._emptyState('Nothing found here.');
        assert.ok(html.includes('Nothing found here.'));
    });

    test('returns a non-empty string', () => {
        const html = ui._emptyState('test');
        assert.ok(typeof html === 'string' && html.length > 0);
    });

    test('includes the plant emoji', () => {
        const html = ui._emptyState('x');
        assert.ok(html.includes('🌿'));
    });
});

describe('ui._setDiscoverTab()', () => {
    let buttons;

    beforeEach(() => {
        // Simulate 4 discover tab buttons
        buttons = ['nearby', 'season', 'community', 'foryou'].map(tab => ({
            dataset: { tab },
            classList: {
                _classes: new Set(),
                toggle(cls, force) { force ? this._classes.add(cls) : this._classes.delete(cls); },
                has(cls) { return this._classes.has(cls); }
            }
        }));

        // Patch querySelectorAll for this test context
        global.document = {
            querySelectorAll: (sel) => sel === '.discover-tab' ? buttons : []
        };
    });

    test('sets active class on the correct tab', () => {
        ui._setDiscoverTab('season');
        const seasonBtn = buttons.find(b => b.dataset.tab === 'season');
        assert.ok(seasonBtn.classList.has('active'));
    });

    test('removes active class from other tabs', () => {
        buttons[0].classList._classes.add('active'); // pre-set nearby as active
        ui._setDiscoverTab('community');
        const nearbyBtn = buttons.find(b => b.dataset.tab === 'nearby');
        assert.ok(!nearbyBtn.classList.has('active'));
    });

    test('only one tab is active at a time', () => {
        ui._setDiscoverTab('foryou');
        const activeCount = buttons.filter(b => b.classList.has('active')).length;
        assert.equal(activeCount, 1);
    });
});

describe('ui._speciesCard()', () => {
    beforeEach(() => {
        ui.app = makeApp();
    });

    test('returns HTML string', () => {
        const html = ui._speciesCard({ id: 9, name: 'Robin', sciName: 'Turdus migratorius', rarity: 'Common', img: 'x.jpg', squareImg: 'sq.jpg' });
        assert.ok(typeof html === 'string');
    });

    test('contains species name', () => {
        const html = ui._speciesCard({ id: 9, name: 'American Robin', sciName: 'T.m.', rarity: 'Common', img: '', squareImg: '' });
        assert.ok(html.includes('American Robin'));
    });

    test('contains onclick with taxon id', () => {
        const html = ui._speciesCard({ id: 42, name: 'Test', sciName: '', rarity: 'Rare', img: '', squareImg: '' });
        assert.ok(html.includes('openSpeciesDetail(42)'));
    });

    test('Common rarity uses green color class', () => {
        const html = ui._speciesCard({ id: 1, name: 'X', sciName: '', rarity: 'Common', img: '', squareImg: '' });
        assert.ok(html.includes('rarity-common'));
    });

    test('Uncommon rarity uses amber color class', () => {
        const html = ui._speciesCard({ id: 1, name: 'X', sciName: '', rarity: 'Uncommon', img: '', squareImg: '' });
        assert.ok(html.includes('rarity-uncommon'));
    });

    test('Rare rarity uses red color class', () => {
        const html = ui._speciesCard({ id: 1, name: 'X', sciName: '', rarity: 'Rare', img: '', squareImg: '' });
        assert.ok(html.includes('rarity-rare'));
    });
});

describe('ui._obsCard()', () => {
    beforeEach(() => {
        ui.app = makeApp();
    });

    test('returns HTML string with species name', () => {
        const obs = {
            taxon: { id: 9, preferred_common_name: 'American Robin', name: 'Turdus migratorius', iconic_taxon_name: 'Aves' },
            photos: [{ url: 'https://x.com/photo-square.jpg' }],
            place_guess: 'Central Park',
            user: { login: 'user123' },
            observed_on: '2025-04-10'
        };
        const html = ui._obsCard(obs);
        assert.ok(html.includes('American Robin'));
    });

    test('uses taxon.name as fallback when no preferred_common_name', () => {
        const obs = {
            taxon: { id: 1, name: 'Turdus migratorius', iconic_taxon_name: 'Aves' },
            photos: [],
        };
        const html = ui._obsCard(obs);
        assert.ok(html.includes('Turdus migratorius'));
    });

    test('shows unknown for obs with no taxon', () => {
        const html = ui._obsCard({ taxon: null, photos: [] });
        assert.ok(html.includes('Unknown'));
    });

    test('shows emoji placeholder when no photo', () => {
        const html = ui._obsCard({ taxon: { id: 1, name: 'X', iconic_taxon_name: 'Aves' }, photos: [] });
        assert.ok(html.includes('🐦'));
    });

    test('replaces square with small in photo URL', () => {
        const obs = {
            taxon: { id: 1, name: 'X', iconic_taxon_name: 'Aves' },
            photos: [{ url: 'https://inaturalist.org/photos/1/square.jpg' }]
        };
        const html = ui._obsCard(obs);
        assert.ok(html.includes('small.jpg'));
        assert.ok(!html.includes('square.jpg'));
    });

    test('shows username when present', () => {
        const html = ui._obsCard({
            taxon: { id: 1, name: 'X', iconic_taxon_name: 'Plantae' },
            photos: [],
            user: { login: 'naturelover42' }
        });
        assert.ok(html.includes('@naturelover42'));
    });
});

describe('ui._renderTaxaBreakdown()', () => {
    test('is a function', () => {
        assert.equal(typeof ui._renderTaxaBreakdown, 'function');
    });
});

describe('ui module structure', () => {
    test('exports an object', () => {
        assert.equal(typeof ui, 'object');
    });

    test('has all required methods', () => {
        const required = [
            'init', 'openPanel', 'renderProfile', 'renderHUDStats',
            'renderDiscover', 'switchDiscoverTab',
            'openSpeciesDetail', 'closeSpeciesDetail',
            'openObsDetail', 'closeObsDetail',
            'openLogObservation', 'closeLogObservation',
            'openSpeciesSelector', 'closeSpeciesSelector',
            'showObsSuccess', 'closeObsSuccess',
            'openKGModal', 'closeKGModal',
            'openAudioId', 'closeAudioId',
            'setJournalFilter', 'toggleMapLayers',
            'saveSettings', 'confirmClearData',
            'showToast', 'toggleProfileEdit',
            'setAvatar', 'animateAvatar'
        ];
        for (const method of required) {
            assert.equal(typeof ui[method], 'function', `ui.${method} is not a function`);
        }
    });

    test('avatars array has at least 10 items', () => {
        assert.ok(Array.isArray(ui.avatars));
        assert.ok(ui.avatars.length >= 10);
    });

    test('editingProfile starts false', () => {
        assert.equal(ui.editingProfile, false);
    });

    test('selectorTarget starts null', () => {
        assert.equal(ui.selectorTarget, null);
    });
});

describe('ui._selectSpecies()', () => {
    beforeEach(() => {
        // Provide minimal DOM mock for closeSpeciesSelector
        const noop = { classList: { add() {}, remove() {} } };
        global.document = {
            getElementById: () => noop,
            querySelectorAll: () => []
        };
    });

    test('does nothing if localSpecies is empty', () => {
        ui.app = makeApp();
        ui.app.localSpecies = [];
        ui.selectorTarget = { textContent: '', dataset: {} };
        ui._selectSpecies(99);
        assert.equal(ui.selectorTarget.textContent, '');
    });

    test('sets textContent and dataset on selectorTarget', () => {
        ui.app = makeApp();
        const btn = { textContent: '', dataset: {} };
        ui.selectorTarget = btn;
        ui._selectSpecies(9); // American Robin
        assert.equal(btn.textContent, 'American Robin');
        assert.equal(btn.dataset.id, 9);
        assert.equal(btn.dataset.iconic, 'Aves');
    });
});
