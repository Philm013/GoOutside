import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hud } from '../js/hud.js';

// ── hud._esc() ────────────────────────────────────────────────────────────────
describe('hud._esc()', () => {
    test('returns plain text unchanged', () => {
        assert.equal(hud._esc('hello world'), 'hello world');
    });

    test('escapes ampersand', () => {
        assert.equal(hud._esc('a & b'), 'a &amp; b');
    });

    test('escapes less-than', () => {
        assert.equal(hud._esc('<tag>'), '&lt;tag&gt;');
    });

    test('escapes greater-than', () => {
        assert.equal(hud._esc('x > y'), 'x &gt; y');
    });

    test('escapes double quotes', () => {
        assert.equal(hud._esc('"quoted"'), '&quot;quoted&quot;');
    });

    test('escapes single quotes / apostrophes', () => {
        assert.equal(hud._esc("Cooper's Hawk"), "Cooper&#39;s Hawk");
    });

    test('escapes regional-name double quotes (iNat style)', () => {
        assert.equal(hud._esc('"California" Towhee'), '&quot;California&quot; Towhee');
    });

    test('escapes multiple special chars in one string', () => {
        assert.equal(hud._esc('<b>a & b</b>'), '&lt;b&gt;a &amp; b&lt;/b&gt;');
    });

    test('returns empty string for null', () => {
        assert.equal(hud._esc(null), '');
    });

    test('returns empty string for undefined', () => {
        assert.equal(hud._esc(undefined), '');
    });

    test('converts numbers to string', () => {
        assert.equal(hud._esc(42), '42');
    });

    test('returns empty string for empty string input', () => {
        assert.equal(hud._esc(''), '');
    });
});

// ── hud._relativeDate() ───────────────────────────────────────────────────────
describe('hud._relativeDate()', () => {
    const now = Date.now();

    test('returns "Just now" for dates within the last hour', () => {
        const recent = new Date(now - 30 * 60 * 1000).toISOString(); // 30 min ago
        assert.equal(hud._relativeDate(recent), 'Just now');
    });

    test('returns "Just now" for dates only minutes ago', () => {
        const recent = new Date(now - 5 * 60 * 1000).toISOString();
        assert.equal(hud._relativeDate(recent), 'Just now');
    });

    test('returns "Xh ago" for dates 1–23 hours ago', () => {
        const twoHours = new Date(now - 2 * 3600 * 1000).toISOString();
        assert.equal(hud._relativeDate(twoHours), '2h ago');
    });

    test('returns "1h ago" for exactly 1 hour ago', () => {
        const oneHour = new Date(now - 3600 * 1000 - 60 * 1000).toISOString();
        assert.equal(hud._relativeDate(oneHour), '1h ago');
    });

    test('returns "Xd ago" for 1–6 days ago', () => {
        const threeDays = new Date(now - 3 * 24 * 3600 * 1000).toISOString();
        assert.equal(hud._relativeDate(threeDays), '3d ago');
    });

    test('returns "1d ago" for exactly 24 hours ago', () => {
        const oneDay = new Date(now - 25 * 3600 * 1000).toISOString();
        assert.equal(hud._relativeDate(oneDay), '1d ago');
    });

    test('returns "Xw ago" for 7+ days ago', () => {
        const twoWeeks = new Date(now - 14 * 24 * 3600 * 1000).toISOString();
        assert.equal(hud._relativeDate(twoWeeks), '2w ago');
    });

    test('returns "1w ago" for exactly 7 days ago', () => {
        const oneWeek = new Date(now - 8 * 24 * 3600 * 1000).toISOString();
        assert.equal(hud._relativeDate(oneWeek), '1w ago');
    });

    test('works with YYYY-MM-DD date string format (iNat observed_on)', () => {
        // A date 2 days ago in YYYY-MM-DD format
        const d = new Date(now - 2 * 24 * 3600 * 1000);
        const dateStr = d.toISOString().slice(0, 10);
        const result = hud._relativeDate(dateStr);
        // Should be "1d ago" or "2d ago" depending on time-of-day rounding
        assert.match(result, /^\dd ago$/);
    });
});

// ── hud._badgeProgress() ─────────────────────────────────────────────────────
describe('hud._badgeProgress()', () => {
    const makeState = (overrides = {}) => ({
        observations: [],
        catalogue: {},
        streak: 0,
        badges: [],
        _usedAudioId: false,
        _usedKeyOut: false,
        ...overrides,
    });

    test('first_obs: max is 1', () => {
        const r = hud._badgeProgress({ id: 'first_obs' }, makeState({ observations: [] }));
        assert.equal(r.max, 1);
        assert.equal(r.curr, 0);
    });

    test('first_obs: curr equals obs count', () => {
        const r = hud._badgeProgress({ id: 'first_obs' }, makeState({ observations: [1, 2] }));
        assert.equal(r.curr, 2);
    });

    test('obs_5: correct max', () => {
        const r = hud._badgeProgress({ id: 'obs_5' }, makeState({ observations: [1, 2, 3] }));
        assert.equal(r.max, 5);
        assert.equal(r.curr, 3);
    });

    test('obs_25: correct max', () => {
        const r = hud._badgeProgress({ id: 'obs_25' }, makeState());
        assert.equal(r.max, 25);
    });

    test('obs_100: correct max', () => {
        const r = hud._badgeProgress({ id: 'obs_100' }, makeState());
        assert.equal(r.max, 100);
    });

    test('streak_3 uses streak value', () => {
        const r = hud._badgeProgress({ id: 'streak_3' }, makeState({ streak: 2 }));
        assert.equal(r.curr, 2);
        assert.equal(r.max, 3);
    });

    test('streak_7 uses streak value', () => {
        const r = hud._badgeProgress({ id: 'streak_7' }, makeState({ streak: 5 }));
        assert.equal(r.curr, 5);
        assert.equal(r.max, 7);
    });

    test('streak_30: correct max', () => {
        const r = hud._badgeProgress({ id: 'streak_30' }, makeState({ streak: 10 }));
        assert.equal(r.max, 30);
    });

    test('spp_10 counts catalogue keys', () => {
        const cat = { a: {}, b: {}, c: {} };
        const r = hud._badgeProgress({ id: 'spp_10' }, makeState({ catalogue: cat }));
        assert.equal(r.curr, 3);
        assert.equal(r.max, 10);
    });

    test('spp_50: correct max', () => {
        const r = hud._badgeProgress({ id: 'spp_50' }, makeState());
        assert.equal(r.max, 50);
    });

    test('bird_10 counts Aves entries in catalogue', () => {
        const cat = {
            a: { iconic: 'Aves' }, b: { iconic: 'Aves' },
            c: { iconic: 'Plantae' },
        };
        const r = hud._badgeProgress({ id: 'bird_10' }, makeState({ catalogue: cat }));
        assert.equal(r.curr, 2);
        assert.equal(r.max, 10);
    });

    test('plant_10 counts Plantae entries', () => {
        const cat = { x: { iconic: 'Plantae' }, y: { iconic: 'Aves' } };
        const r = hud._badgeProgress({ id: 'plant_10' }, makeState({ catalogue: cat }));
        assert.equal(r.curr, 1);
        assert.equal(r.max, 10);
    });

    test('insect_10 counts Insecta entries', () => {
        const cat = { x: { iconic: 'Insecta' }, y: { iconic: 'Insecta' }, z: { iconic: 'Aves' } };
        const r = hud._badgeProgress({ id: 'insect_10' }, makeState({ catalogue: cat }));
        assert.equal(r.curr, 2);
        assert.equal(r.max, 10);
    });

    test('mammal_5 counts Mammalia entries', () => {
        const cat = { a: { iconic: 'Mammalia' } };
        const r = hud._badgeProgress({ id: 'mammal_5' }, makeState({ catalogue: cat }));
        assert.equal(r.curr, 1);
        assert.equal(r.max, 5);
    });

    test('all_taxa counts unique iconic groups', () => {
        const cat = {
            a: { iconic: 'Aves' }, b: { iconic: 'Aves' },
            c: { iconic: 'Plantae' },
            d: { iconic: 'Mammalia' },
        };
        const r = hud._badgeProgress({ id: 'all_taxa' }, makeState({ catalogue: cat }));
        assert.equal(r.curr, 3); // Aves, Plantae, Mammalia
        assert.equal(r.max, 6);
    });

    test('first_audio_id: 0 when not used', () => {
        const r = hud._badgeProgress({ id: 'first_audio_id' }, makeState({ _usedAudioId: false }));
        assert.equal(r.curr, 0);
        assert.equal(r.max, 1);
    });

    test('first_audio_id: 1 when used', () => {
        const r = hud._badgeProgress({ id: 'first_audio_id' }, makeState({ _usedAudioId: true }));
        assert.equal(r.curr, 1);
    });

    test('first_key_out: 0 when not used', () => {
        const r = hud._badgeProgress({ id: 'first_key_out' }, makeState({ _usedKeyOut: false }));
        assert.equal(r.curr, 0);
    });

    test('first_key_out: 1 when used', () => {
        const r = hud._badgeProgress({ id: 'first_key_out' }, makeState({ _usedKeyOut: true }));
        assert.equal(r.curr, 1);
    });

    test('unknown badge id returns { curr: 0, max: 1 }', () => {
        const r = hud._badgeProgress({ id: 'some_future_badge' }, makeState());
        assert.deepEqual(r, { curr: 0, max: 1 });
    });

    test('handles missing catalogue gracefully', () => {
        const r = hud._badgeProgress({ id: 'bird_10' }, { observations: [], streak: 0 });
        assert.equal(r.curr, 0);
    });

    test('handles missing observations gracefully', () => {
        const r = hud._badgeProgress({ id: 'obs_5' }, { catalogue: {}, streak: 0 });
        assert.equal(r.curr, 0);
    });
});
