import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { data } from '../js/data.js';

describe('data.defaultState()', () => {
    test('returns all required fields', () => {
        const s = data.defaultState();
        assert.equal(s.version, 4);
        assert.ok(typeof s.username === 'string');
        assert.ok(s.username.startsWith('Naturalist'));
        assert.equal(s.avatar, '🦋');
        assert.equal(s.discoveryPoints, 0);
        assert.equal(s.streak, 0);
        assert.equal(s.longestStreak, 0);
        assert.equal(s.lastSeen, '');
        assert.deepEqual(s.observations, []);
        assert.deepEqual(s.catalogue, {});
        assert.deepEqual(s.badges, []);
        assert.deepEqual(s.settings, {});
        assert.deepEqual(s.syncQueue, []);
        assert.strictEqual(s.lastSyncAt, null);
    });

    test('username has randomness (two calls differ with high probability)', () => {
        const names = new Set(Array.from({ length: 20 }, () => data.defaultState().username));
        assert.ok(names.size > 1, 'Expected varying usernames');
    });
});

describe('data.calcLevel()', () => {
    test('0 DP => level 1', () => {
        const r = data.calcLevel(0);
        assert.equal(r.level, 1);
        assert.equal(r.curr, 0);
        assert.equal(r.req, 500);
        assert.equal(r.pct, 0);
        assert.equal(r.title, 'Curious Naturalist');
    });

    test('499 DP stays at level 1', () => {
        assert.equal(data.calcLevel(499).level, 1);
    });

    test('500 DP => level 2', () => {
        const r = data.calcLevel(500);
        assert.equal(r.level, 2);
        assert.equal(r.curr, 0);
        assert.equal(r.req, 900); // 500 * 1.8
    });

    test('level 2 title is Field Observer', () => {
        assert.equal(data.calcLevel(500).title, 'Field Observer');
    });

    test('level 3 threshold is 500 + 900 = 1400 DP', () => {
        assert.equal(data.calcLevel(1399).level, 2);
        assert.equal(data.calcLevel(1400).level, 3);
    });

    test('pct is between 0 and 100', () => {
        for (const dp of [0, 250, 499, 500, 1000, 5000]) {
            const { pct } = data.calcLevel(dp);
            assert.ok(pct >= 0 && pct <= 100, `pct=${pct} for dp=${dp}`);
        }
    });

    test('very high DP caps title at Planet Protector (index 14)', () => {
        const r = data.calcLevel(10_000_000);
        assert.equal(r.title, 'Planet Protector');
    });
});

describe('data.calcObservationDP()', () => {
    const makeState = (extra = {}) => ({
        streak: 0, catalogue: {}, ...extra
    });

    test('base DP from species.dp field', () => {
        const s = makeState();
        const dp = data.calcObservationDP({ id: 1, dp: 100 }, s);
        assert.equal(dp, 200); // first-ever species → 2x
    });

    test('Common species gives 50 dp base when no dp field', () => {
        const s = makeState();
        const dp = data.calcObservationDP({ id: 1 }, s);
        assert.equal(dp, 100); // no dp field → default 50, first → *2 = 100
    });

    test('no first-species multiplier for already catalogued species', () => {
        const s = makeState({ catalogue: { 1: { count: 3 } } });
        const dp = data.calcObservationDP({ id: 1, dp: 100 }, s);
        assert.equal(dp, 100); // no 2x
    });

    test('streak bonus applies (+30% max at streak 30)', () => {
        const s = makeState({ catalogue: { 1: { count: 1 } }, streak: 30 });
        const base = 100;
        const dp = data.calcObservationDP({ id: 1, dp: base }, s);
        assert.equal(dp, Math.round(100 * 1.30));
    });

    test('streak bonus capped at 30 days', () => {
        const s50 = makeState({ catalogue: { 1: { count: 1 } }, streak: 50 });
        const s30 = makeState({ catalogue: { 1: { count: 1 } }, streak: 30 });
        assert.equal(
            data.calcObservationDP({ id: 1, dp: 100 }, s50),
            data.calcObservationDP({ id: 1, dp: 100 }, s30)
        );
    });

    test('streak 10 + first species combined', () => {
        const s = makeState({ streak: 10 });
        const dp = data.calcObservationDP({ id: 99, dp: 100 }, s);
        // first → 2x = 200, then streak +10% → 200 * 1.10 = 220
        assert.equal(dp, Math.round(200 * 1.10));
    });
});

describe('data.checkBadges()', () => {
    test('awards first_obs badge on first observation', () => {
        const s = { observations: [{}], catalogue: {}, streak: 0, badges: [] };
        const awarded = data.checkBadges(s);
        assert.ok(awarded.some(b => b.id === 'first_obs'));
        assert.ok(s.badges.includes('first_obs'));
    });

    test('does not award badge twice', () => {
        const s = { observations: [{}], catalogue: {}, streak: 0, badges: ['first_obs'] };
        const awarded = data.checkBadges(s);
        assert.ok(!awarded.some(b => b.id === 'first_obs'));
    });

    test('awards obs_5 at 5 observations', () => {
        const s = { observations: [{},{},{},{},{}], catalogue: {}, streak: 0, badges: [] };
        const awarded = data.checkBadges(s);
        assert.ok(awarded.some(b => b.id === 'obs_5'));
    });

    test('does not award obs_25 at fewer than 25 observations', () => {
        const s = { observations: Array(10).fill({}), catalogue: {}, streak: 0, badges: [] };
        const awarded = data.checkBadges(s);
        assert.ok(!awarded.some(b => b.id === 'obs_25'));
    });

    test('awards streak_3 badge when streak >= 3', () => {
        const s = { observations: [], catalogue: {}, streak: 3, badges: [] };
        const awarded = data.checkBadges(s);
        assert.ok(awarded.some(b => b.id === 'streak_3'));
    });

    test('awards streak_7 but not streak_30 at streak=7', () => {
        const s = { observations: [], catalogue: {}, streak: 7, badges: [] };
        const awarded = data.checkBadges(s);
        assert.ok(awarded.some(b => b.id === 'streak_7'));
        assert.ok(!awarded.some(b => b.id === 'streak_30'));
    });

    test('awards bird_10 badge with 10 Aves in catalogue', () => {
        const catalogue = {};
        for (let i = 0; i < 10; i++) catalogue[i] = { iconic: 'Aves' };
        const s = { observations: [], catalogue, streak: 0, badges: [] };
        const awarded = data.checkBadges(s);
        assert.ok(awarded.some(b => b.id === 'bird_10'));
    });

    test('awards all_taxa badge with 6 different iconic groups', () => {
        const catalogue = {
            1: { iconic: 'Aves' }, 2: { iconic: 'Plantae' }, 3: { iconic: 'Mammalia' },
            4: { iconic: 'Insecta' }, 5: { iconic: 'Reptilia' }, 6: { iconic: 'Amphibia' }
        };
        const s = { observations: [], catalogue, streak: 0, badges: [] };
        const awarded = data.checkBadges(s);
        assert.ok(awarded.some(b => b.id === 'all_taxa'));
    });

    test('all 34 badges defined', () => {
        assert.equal(data.BADGES.length, 34);
    });

    // ── New taxa badges ────────────────────────────────────────────

    test('awards reptile_3 badge with 3 Reptilia', () => {
        const catalogue = { 1: { iconic: 'Reptilia' }, 2: { iconic: 'Reptilia' }, 3: { iconic: 'Reptilia' } };
        const s = { observations: [], catalogue, streak: 0, badges: [] };
        assert.ok(data.checkBadges(s).some(b => b.id === 'reptile_3'));
    });

    test('does not award reptile_3 with only 2', () => {
        const catalogue = { 1: { iconic: 'Reptilia' }, 2: { iconic: 'Reptilia' } };
        const s = { observations: [], catalogue, streak: 0, badges: [] };
        assert.ok(!data.checkBadges(s).some(b => b.id === 'reptile_3'));
    });

    test('awards amphibian_3 with 3 Amphibia', () => {
        const catalogue = { 1: { iconic: 'Amphibia' }, 2: { iconic: 'Amphibia' }, 3: { iconic: 'Amphibia' } };
        const s = { observations: [], catalogue, streak: 0, badges: [] };
        assert.ok(data.checkBadges(s).some(b => b.id === 'amphibian_3'));
    });

    test('awards fish_5 with 5 Actinopterygii', () => {
        const catalogue = {};
        for (let i = 0; i < 5; i++) catalogue[i] = { iconic: 'Actinopterygii' };
        const s = { observations: [], catalogue, streak: 0, badges: [] };
        assert.ok(data.checkBadges(s).some(b => b.id === 'fish_5'));
    });

    test('awards shell_5 with 5 Mollusca', () => {
        const catalogue = {};
        for (let i = 0; i < 5; i++) catalogue[i] = { iconic: 'Mollusca' };
        const s = { observations: [], catalogue, streak: 0, badges: [] };
        assert.ok(data.checkBadges(s).some(b => b.id === 'shell_5'));
    });

    test('awards fungi_5 with 5 Fungi', () => {
        const catalogue = {};
        for (let i = 0; i < 5; i++) catalogue[i] = { iconic: 'Fungi' };
        const s = { observations: [], catalogue, streak: 0, badges: [] };
        assert.ok(data.checkBadges(s).some(b => b.id === 'fungi_5'));
    });

    test('awards arachnid_3 with 3 Arachnida', () => {
        const catalogue = { 1: { iconic: 'Arachnida' }, 2: { iconic: 'Arachnida' }, 3: { iconic: 'Arachnida' } };
        const s = { observations: [], catalogue, streak: 0, badges: [] };
        assert.ok(data.checkBadges(s).some(b => b.id === 'arachnid_3'));
    });

    test('awards all_10_taxa with all 10 iconic groups', () => {
        const iconics = ['Aves','Plantae','Mammalia','Insecta','Reptilia','Amphibia','Actinopterygii','Mollusca','Arachnida','Fungi'];
        const catalogue = {};
        iconics.forEach((ic, i) => { catalogue[i] = { iconic: ic }; });
        const s = { observations: [], catalogue, streak: 0, badges: [] };
        const awarded = data.checkBadges(s);
        assert.ok(awarded.some(b => b.id === 'all_10_taxa'));
    });

    test('does not award all_10_taxa with only 9 groups', () => {
        const iconics = ['Aves','Plantae','Mammalia','Insecta','Reptilia','Amphibia','Actinopterygii','Mollusca','Arachnida'];
        const catalogue = {};
        iconics.forEach((ic, i) => { catalogue[i] = { iconic: ic }; });
        const s = { observations: [], catalogue, streak: 0, badges: [] };
        assert.ok(!data.checkBadges(s).some(b => b.id === 'all_10_taxa'));
    });

    // ── Quality badges ─────────────────────────────────────────────

    test('awards rare_find when an observation has rarity Rare', () => {
        const s = { observations: [{ rarity: 'Common' }, { rarity: 'Rare' }], catalogue: {}, streak: 0, badges: [] };
        assert.ok(data.checkBadges(s).some(b => b.id === 'rare_find'));
    });

    test('does not award rare_find with only Common/Uncommon', () => {
        const s = { observations: [{ rarity: 'Common' }, { rarity: 'Uncommon' }], catalogue: {}, streak: 0, badges: [] };
        assert.ok(!data.checkBadges(s).some(b => b.id === 'rare_find'));
    });

    test('awards photo_logger when an observation has imageUri', () => {
        const s = { observations: [{ imageUri: 'file://photo.jpg' }], catalogue: {}, streak: 0, badges: [] };
        assert.ok(data.checkBadges(s).some(b => b.id === 'photo_logger'));
    });

    test('does not award photo_logger with no imageUri', () => {
        const s = { observations: [{ rarity: 'Common' }], catalogue: {}, streak: 0, badges: [] };
        assert.ok(!data.checkBadges(s).some(b => b.id === 'photo_logger'));
    });

    // ── Multiplayer badges ─────────────────────────────────────────

    test('awards first_party when _joinedParty is true', () => {
        const s = { observations: [], catalogue: {}, streak: 0, badges: [], _joinedParty: true };
        assert.ok(data.checkBadges(s).some(b => b.id === 'first_party'));
    });

    test('does not award first_party when _joinedParty is false', () => {
        const s = { observations: [], catalogue: {}, streak: 0, badges: [] };
        assert.ok(!data.checkBadges(s).some(b => b.id === 'first_party'));
    });

    test('awards gift_sender when _sentGift is true', () => {
        const s = { observations: [], catalogue: {}, streak: 0, badges: [], _sentGift: true };
        assert.ok(data.checkBadges(s).some(b => b.id === 'gift_sender'));
    });

    test('awards party_sighting when _sharedSighting is true', () => {
        const s = { observations: [], catalogue: {}, streak: 0, badges: [], _sharedSighting: true };
        assert.ok(data.checkBadges(s).some(b => b.id === 'party_sighting'));
    });

    // ── Milestone badges ───────────────────────────────────────────

    test('awards obs_250 at 250 observations', () => {
        const s = { observations: Array(250).fill({}), catalogue: {}, streak: 0, badges: [] };
        assert.ok(data.checkBadges(s).some(b => b.id === 'obs_250'));
    });

    test('does not award obs_250 at 249', () => {
        const s = { observations: Array(249).fill({}), catalogue: {}, streak: 0, badges: [] };
        assert.ok(!data.checkBadges(s).some(b => b.id === 'obs_250'));
    });

    test('awards spp_100 at 100 catalogued species', () => {
        const catalogue = {};
        for (let i = 0; i < 100; i++) catalogue[i] = { iconic: 'Aves' };
        const s = { observations: [], catalogue, streak: 0, badges: [] };
        assert.ok(data.checkBadges(s).some(b => b.id === 'spp_100'));
    });
});

describe('data.updateStreak()', () => {
    test('sets streak to 1 on first ever call', () => {
        const s = { streak: 0, longestStreak: 0, lastSeen: '' };
        data.updateStreak(s);
        assert.equal(s.streak, 1);
        assert.equal(s.lastSeen, new Date().toDateString());
    });

    test('does not double-count if called twice same day', () => {
        const s = { streak: 1, longestStreak: 1, lastSeen: new Date().toDateString() };
        data.updateStreak(s);
        assert.equal(s.streak, 1);
    });

    test('increments streak when lastSeen was yesterday', () => {
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        const s = { streak: 4, longestStreak: 4, lastSeen: yesterday };
        data.updateStreak(s);
        assert.equal(s.streak, 5);
    });

    test('resets streak when lastSeen was 2+ days ago', () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toDateString();
        const s = { streak: 10, longestStreak: 10, lastSeen: twoDaysAgo };
        data.updateStreak(s);
        assert.equal(s.streak, 1);
    });

    test('updates longestStreak when streak exceeds it', () => {
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        const s = { streak: 7, longestStreak: 7, lastSeen: yesterday };
        data.updateStreak(s);
        assert.equal(s.longestStreak, 8);
    });
});

describe('data.currentSeason()', () => {
    const originalGetMonth = Date.prototype.getMonth;
    const mockMonth = (m) => {
        Date.prototype.getMonth = () => m;
    };
    const restoreMonth = () => {
        Date.prototype.getMonth = originalGetMonth;
    };

    test('month 2 (March) = Spring', () => {
        mockMonth(2);
        assert.equal(data.currentSeason().name, 'Spring');
        restoreMonth();
    });

    test('month 5 (June) = Summer', () => {
        mockMonth(5);
        assert.equal(data.currentSeason().name, 'Summer');
        restoreMonth();
    });

    test('month 8 (September) = Autumn', () => {
        mockMonth(8);
        assert.equal(data.currentSeason().name, 'Autumn');
        restoreMonth();
    });

    test('month 11 (December) = Winter', () => {
        mockMonth(11);
        assert.equal(data.currentSeason().name, 'Winter');
        restoreMonth();
    });

    test('month 0 (January) = Winter', () => {
        mockMonth(0);
        assert.equal(data.currentSeason().name, 'Winter');
        restoreMonth();
    });

    test('season has icon and color', () => {
        const s = data.currentSeason();
        assert.ok(s.icon);
        assert.ok(s.color);
    });
});

describe('data.normalizeState()', () => {
    test('fills missing fields with defaults', () => {
        const s = data.normalizeState({});
        assert.equal(s.version, 4);
        assert.deepEqual(s.observations, []);
        assert.deepEqual(s.catalogue, {});
        assert.deepEqual(s.badges, []);
    });

    test('preserves existing discoveryPoints', () => {
        const s = data.normalizeState({ discoveryPoints: 1234 });
        assert.equal(s.discoveryPoints, 1234);
    });

    test('migrates old xp to discoveryPoints when no discoveryPoints', () => {
        const s = data.normalizeState({ xp: 500 });
        assert.equal(s.discoveryPoints, 500);
    });

    test('heals non-array observations', () => {
        const s = data.normalizeState({ observations: null });
        assert.deepEqual(s.observations, []);
    });

    test('heals non-object catalogue', () => {
        const s = data.normalizeState({ catalogue: 'bad' });
        assert.deepEqual(s.catalogue, {});
    });

    test('adds iconic=Animalia to catalogue entries missing it', () => {
        const s = data.normalizeState({ catalogue: { 42: { count: 1 } } });
        assert.equal(s.catalogue[42].iconic, 'Animalia');
    });

    test('preserves existing iconic field', () => {
        const s = data.normalizeState({ catalogue: { 99: { count: 2, iconic: 'Aves' } } });
        assert.equal(s.catalogue[99].iconic, 'Aves');
    });

    test('normalizes missing syncQueue to empty array', () => {
        const s = data.normalizeState({});
        assert.deepEqual(s.syncQueue, []);
    });

    test('heals non-array syncQueue', () => {
        const s = data.normalizeState({ syncQueue: null });
        assert.deepEqual(s.syncQueue, []);
    });

    test('normalizes missing lastSyncAt to null', () => {
        const s = data.normalizeState({});
        assert.strictEqual(s.lastSyncAt, null);
    });

    test('preserves existing lastSyncAt value', () => {
        const ts = '2024-04-22T10:00:00.000Z';
        const s = data.normalizeState({ lastSyncAt: ts });
        assert.equal(s.lastSyncAt, ts);
    });
});
