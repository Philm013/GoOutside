import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { journal } from '../js/journal.js';
import { inat } from '../js/inat.js';
import { data } from '../js/data.js';

// Build a minimal app mock for journal tests
function makeApp(observations = []) {
    return {
        inat,
        data,
        state: {
            ...data.defaultState(),
            observations,
        }
    };
}

describe('journal.getTaxaBreakdown()', () => {
    test('returns empty array with no observations', () => {
        const j = Object.create(journal);
        j.app = makeApp([]);
        assert.deepEqual(j.getTaxaBreakdown(), []);
    });

    test('counts single iconic group correctly', () => {
        const j = Object.create(journal);
        j.app = makeApp([
            { iconic: 'Aves' }, { iconic: 'Aves' }, { iconic: 'Aves' }
        ]);
        const result = j.getTaxaBreakdown();
        assert.equal(result.length, 1);
        assert.equal(result[0].iconic, 'Aves');
        assert.equal(result[0].count, 3);
        assert.equal(result[0].emoji, '🐦');
        assert.equal(result[0].label, 'Bird');
    });

    test('counts multiple iconic groups', () => {
        const j = Object.create(journal);
        j.app = makeApp([
            { iconic: 'Aves' }, { iconic: 'Aves' },
            { iconic: 'Plantae' },
            { iconic: 'Mammalia' }, { iconic: 'Mammalia' }, { iconic: 'Mammalia' }
        ]);
        const result = j.getTaxaBreakdown();
        assert.equal(result.length, 3);
        // Should be sorted descending
        assert.equal(result[0].iconic, 'Mammalia');
        assert.equal(result[0].count, 3);
        assert.equal(result[1].iconic, 'Aves');
        assert.equal(result[1].count, 2);
        assert.equal(result[2].iconic, 'Plantae');
        assert.equal(result[2].count, 1);
    });

    test('observations with missing iconic fall back to Animalia', () => {
        const j = Object.create(journal);
        j.app = makeApp([{ iconic: null }, { iconic: undefined }, {}]);
        const result = j.getTaxaBreakdown();
        assert.equal(result.length, 1);
        assert.equal(result[0].iconic, 'Animalia');
        assert.equal(result[0].count, 3);
        assert.equal(result[0].emoji, '🐾');
    });

    test('result items include emoji and label from inat helpers', () => {
        const j = Object.create(journal);
        j.app = makeApp([{ iconic: 'Insecta' }]);
        const [item] = j.getTaxaBreakdown();
        assert.equal(item.emoji, inat.iconicEmoji('Insecta'));
        assert.equal(item.label, inat.iconicLabel('Insecta'));
    });

    test('sorted descending by count', () => {
        const j = Object.create(journal);
        j.app = makeApp([
            { iconic: 'Fungi' },
            { iconic: 'Reptilia' }, { iconic: 'Reptilia' }, { iconic: 'Reptilia' },
            { iconic: 'Amphibia' }, { iconic: 'Amphibia' }
        ]);
        const result = j.getTaxaBreakdown();
        const counts = result.map(r => r.count);
        assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
    });
});

describe('journal init / module structure', () => {
    test('journal exports an object', () => {
        assert.equal(typeof journal, 'object');
    });

    test('journal has required methods', () => {
        assert.equal(typeof journal.init, 'function');
        assert.equal(typeof journal.renderJournal, 'function');
        assert.equal(typeof journal.submitObservation, 'function');
        assert.equal(typeof journal.getTaxaBreakdown, 'function');
    });
});
