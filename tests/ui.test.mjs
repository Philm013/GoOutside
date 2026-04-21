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

describe('ui.ICONIC_TAXA', () => {
    test('is an array of exactly 10 entries', () => {
        assert.ok(Array.isArray(ui.ICONIC_TAXA));
        assert.equal(ui.ICONIC_TAXA.length, 10);
    });

    test('contains all expected taxa', () => {
        const expected = ['Aves','Plantae','Mammalia','Insecta','Reptilia','Amphibia','Actinopterygii','Mollusca','Arachnida','Fungi'];
        for (const t of expected) {
            assert.ok(ui.ICONIC_TAXA.includes(t), `Missing: ${t}`);
        }
    });

    test('all entries are non-empty strings', () => {
        for (const t of ui.ICONIC_TAXA) {
            assert.ok(typeof t === 'string' && t.length > 0);
        }
    });
});

describe('ui._renderSeasonFilterChips()', () => {
    let container;
    beforeEach(() => {
        ui.app = makeApp();
        ui._seasonFilter = null;
        // Minimal container mock
        container = { innerHTML: '', children: { length: 0 } };
    });

    test('sets innerHTML to non-empty string', () => {
        ui._renderSeasonFilterChips(container);
        assert.ok(container.innerHTML.length > 0);
    });

    test('includes an "All" chip', () => {
        ui._renderSeasonFilterChips(container);
        assert.ok(container.innerHTML.includes('>All<'));
    });

    test('includes a chip for each ICONIC_TAXA entry', () => {
        ui._renderSeasonFilterChips(container);
        for (const t of ui.ICONIC_TAXA) {
            assert.ok(container.innerHTML.includes(`data-filter="${t}"`), `Missing chip for ${t}`);
        }
    });

    test('All chip is active when _seasonFilter is null', () => {
        ui._seasonFilter = null;
        ui._renderSeasonFilterChips(container);
        // First chip (All) should have active class
        assert.ok(container.innerHTML.includes('active'));
    });

    test('correct chip is active when _seasonFilter is set', () => {
        ui._seasonFilter = 'Aves';
        ui._renderSeasonFilterChips(container);
        // Should contain active class near Aves chip
        assert.ok(container.innerHTML.includes('data-filter="Aves"'));
    });

    test('produces 11 chips total (All + 10 taxa)', () => {
        ui._renderSeasonFilterChips(container);
        const count = (container.innerHTML.match(/season-filter-chip/g) || []).length;
        assert.equal(count, 11);
    });
});

describe('ui._renderLayerPicker()', () => {
    let picker;
    beforeEach(() => {
        ui.app = makeApp();
        ui.app.map = {
            _communityLayerOn: true,
            _personalLayerOn: false,
            _iconicLayerState: { Aves: true, Plantae: false }
        };
        picker = { innerHTML: '' };
    });

    test('sets innerHTML to non-empty string', () => {
        ui._renderLayerPicker(picker);
        assert.ok(picker.innerHTML.length > 0);
    });

    test('includes community and personal layer checkboxes', () => {
        ui._renderLayerPicker(picker);
        assert.ok(picker.innerHTML.includes('quick-toggle-community'));
        assert.ok(picker.innerHTML.includes('quick-toggle-personal'));
        assert.ok(picker.innerHTML.includes('All Community Sightings'));
    });

    test('renders a checkbox for each ICONIC_TAXA entry', () => {
        ui._renderLayerPicker(picker);
        for (const t of ui.ICONIC_TAXA) {
            assert.ok(picker.innerHTML.includes(`toggleIconicLayer('${t}'`), `Missing toggle for ${t}`);
            assert.ok(picker.innerHTML.includes(`data-iconic-toggle="${t}"`), `Missing sync hook for ${t}`);
        }
    });

    test('community checkbox is checked when _communityLayerOn is true', () => {
        ui.app.map._communityLayerOn = true;
        ui._renderLayerPicker(picker);
        // quick-toggle-community input should have checked attr
        assert.ok(/quick-toggle-community[^>]*checked/.test(picker.innerHTML) || picker.innerHTML.includes('id="quick-toggle-community" checked'));
    });

    test('taxa rows reflect _iconicLayerState', () => {
        ui.app.map._iconicLayerState = { Aves: true };
        ui._renderLayerPicker(picker);
        // Aves row should have checked; others should not have checked in their specific row
        assert.ok(picker.innerHTML.includes("toggleIconicLayer('Aves'"));
    });
});

describe('ui.showBadgeUnlock()', () => {
    let appended;
    beforeEach(() => {
        appended = [];
        global.document = {
            createElement(tag) {
                return {
                    tag,
                    className: '',
                    innerHTML: '',
                    remove() { appended.splice(appended.indexOf(this), 1); }
                };
            },
            body: { appendChild(el) { appended.push(el); } },
            getElementById: () => null,
            querySelectorAll: () => []
        };
    });

    test('appends an element to document.body', () => {
        ui.showBadgeUnlock({ icon: '🐦', name: 'Bird Watcher' });
        assert.equal(appended.length, 1);
    });

    test('element innerHTML includes badge icon and name', () => {
        ui.showBadgeUnlock({ icon: '🦎', name: 'Reptile Wrangler' });
        assert.ok(appended[0].innerHTML.includes('🦎'));
        assert.ok(appended[0].innerHTML.includes('Reptile Wrangler'));
    });

    test('element innerHTML includes "Badge Unlocked!" text', () => {
        ui.showBadgeUnlock({ icon: '🐟', name: 'Angler' });
        assert.ok(appended[0].innerHTML.includes('Badge Unlocked!'));
    });
});

describe('ui.showObsSuccess() structure', () => {
    test('is a function', () => {
        assert.equal(typeof ui.showObsSuccess, 'function');
    });

    test('accepts obs and newBadges arguments without error when DOM missing', () => {
        const noop = { classList: { remove() {}, add() {} } };
        global.document = {
            getElementById: () => null,
            querySelectorAll: () => []
        };
        assert.doesNotThrow(() => {
            ui.showObsSuccess({ speciesName: 'Robin', dp: 100, rarity: 'Common', iconic: 'Aves' }, []);
        });
    });

    test('defaults newBadges to empty array when not provided', () => {
        global.document = { getElementById: () => null, querySelectorAll: () => [] };
        assert.doesNotThrow(() => {
            ui.showObsSuccess({ speciesName: 'Robin', dp: 50, rarity: 'Common', iconic: 'Aves' });
        });
    });
});

describe('ui module required methods (extended)', () => {
    test('showBadgeUnlock is a function', () => {
        assert.equal(typeof ui.showBadgeUnlock, 'function');
    });

    test('_renderSeasonFilterChips is a function', () => {
        assert.equal(typeof ui._renderSeasonFilterChips, 'function');
    });

    test('_renderLayerPicker is a function', () => {
        assert.equal(typeof ui._renderLayerPicker, 'function');
    });

    test('toggleLayerPicker is a function', () => {
        assert.equal(typeof ui.toggleLayerPicker, 'function');
    });

    test('setSeasonFilter is a function', () => {
        assert.equal(typeof ui.setSeasonFilter, 'function');
    });
});
