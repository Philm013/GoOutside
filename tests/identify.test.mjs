import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { identify } from '../js/identify.js';

describe('identify.TRAIT_TREES structure', () => {
    const EXPECTED_CATEGORIES = ['Aves', 'Plantae', 'Mammalia', 'Insecta', 'Reptilia', 'Amphibia', 'Actinopterygii', 'Mollusca'];

    test('has exactly 8 categories', () => {
        assert.equal(Object.keys(identify.TRAIT_TREES).length, 8);
    });

    test('contains all required categories', () => {
        for (const cat of EXPECTED_CATEGORIES) {
            assert.ok(identify.TRAIT_TREES[cat], `Missing category: ${cat}`);
        }
    });

    for (const cat of EXPECTED_CATEGORIES) {
        describe(`${cat} category`, () => {
            test('has label and icon', () => {
                const tree = identify.TRAIT_TREES[cat];
                assert.ok(typeof tree.label === 'string' && tree.label.length > 0);
                assert.ok(typeof tree.icon === 'string' && tree.icon.length > 0);
            });

            test('has steps array with at least 3 steps', () => {
                const { steps } = identify.TRAIT_TREES[cat];
                assert.ok(Array.isArray(steps));
                assert.ok(steps.length >= 3, `${cat} has only ${steps.length} steps`);
            });

            test('each step has id, question, and options array', () => {
                const { steps } = identify.TRAIT_TREES[cat];
                for (const step of steps) {
                    assert.ok(typeof step.id === 'string', `Step missing id in ${cat}`);
                    assert.ok(typeof step.question === 'string', `Step missing question in ${cat}`);
                    assert.ok(Array.isArray(step.options), `Step ${step.id} missing options in ${cat}`);
                    assert.ok(step.options.length >= 3, `Step ${step.id} has too few options in ${cat}`);
                }
            });

            test('each option has id and label', () => {
                const { steps } = identify.TRAIT_TREES[cat];
                for (const step of steps) {
                    for (const opt of step.options) {
                        assert.ok(typeof opt.id === 'string', `Option missing id in step ${step.id}/${cat}`);
                        assert.ok(typeof opt.label === 'string', `Option missing label in step ${step.id}/${cat}`);
                    }
                }
            });
        });
    }
});

describe('identify.TRAIT_TREES Aves detail', () => {
    const aves = identify.TRAIT_TREES['Aves'];

    test('first step is size question', () => {
        assert.equal(aves.steps[0].id, 'size');
        assert.ok(aves.steps[0].question.toLowerCase().includes('big'));
    });

    test('has a color step marked as multi-select', () => {
        const colorStep = aves.steps.find(s => s.id === 'color');
        assert.ok(colorStep, 'No color step found');
        assert.equal(colorStep.multi, true);
    });

    test('has a habitat step', () => {
        assert.ok(aves.steps.some(s => s.id === 'habitat'));
    });

    test('beak step options include hooked (raptor)', () => {
        const beakStep = aves.steps.find(s => s.id === 'beak');
        assert.ok(beakStep, 'No beak step');
        assert.ok(beakStep.options.some(o => o.id === 'hooked'));
    });
});

describe('identify.TRAIT_TREES Plantae detail', () => {
    const plantae = identify.TRAIT_TREES['Plantae'];

    test('first step is form question', () => {
        assert.equal(plantae.steps[0].id, 'form');
    });

    test('form options include tree, shrub, wildflower', () => {
        const opts = plantae.steps[0].options.map(o => o.id);
        assert.ok(opts.includes('tree'));
        assert.ok(opts.includes('shrub'));
        assert.ok(opts.includes('wildflower'));
    });

    test('has a leaf step', () => {
        assert.ok(plantae.steps.some(s => s.id === 'leaf'));
    });
});

describe('identify module structure', () => {
    test('exports an object', () => {
        assert.equal(typeof identify, 'object');
    });

    test('has required methods', () => {
        assert.equal(typeof identify.init, 'function');
        assert.equal(typeof identify.startKnowledgeGraph, 'function');
        assert.equal(typeof identify.startAudioId, 'function');
        assert.equal(typeof identify.stopAudio, 'function');
    });

    test('kgCategory starts as null', () => {
        assert.equal(identify.kgCategory, null);
    });

    test('kgStep starts at 0', () => {
        assert.equal(identify.kgStep, 0);
    });

    test('selectedTraits property exists (initialized)', () => {
        assert.ok('selectedTraits' in identify);
    });
});
