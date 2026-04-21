import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { multiplayer } from '../js/multiplayer.js';
import { data } from '../js/data.js';

// Minimal mock app wiring
function makeApp(stateOverride = {}) {
    const state = { ...data.defaultState(), ...stateOverride };
    const toasts = [];
    return {
        state,
        data,
        map: { pos: { lat: 40.71, lng: -74.00 }, updatePlayer() {}, clearPlayers() {}, removePlayer() {}, addGlobalSighting() {} },
        ui: { showToast(m) { toasts.push(m); }, renderProfile() {} },
        saveState() {},
        _toasts: toasts
    };
}

describe('multiplayer.init()', () => {
    test('assigns a 4-char uppercase myId', () => {
        const mp = Object.create(multiplayer);
        mp.init(makeApp());
        assert.equal(typeof mp.myId, 'string');
        assert.equal(mp.myId.length, 4);
        assert.match(mp.myId, /^[A-Z0-9]{4}$/);
    });

    test('two calls produce different IDs with high probability', () => {
        const ids = new Set();
        for (let i = 0; i < 20; i++) {
            const mp = Object.create(multiplayer);
            mp.init(makeApp());
            ids.add(mp.myId);
        }
        assert.ok(ids.size > 1);
    });

    test('stores app reference', () => {
        const mp = Object.create(multiplayer);
        const app = makeApp();
        mp.init(app);
        assert.equal(mp.app, app);
    });

    test('does not throw when Peer is not defined', () => {
        const mp = Object.create(multiplayer);
        assert.doesNotThrow(() => mp.init(makeApp()));
    });
});

describe('multiplayer.addToFeed()', () => {
    let mp;
    beforeEach(() => {
        mp = Object.create(multiplayer);
        mp.socialFeed = [];
        mp.app = makeApp();
        // stub updateFeedUI (requires DOM)
        mp.updateFeedUI = () => {};
    });

    test('adds entry to front of socialFeed', () => {
        mp.addToFeed({ type: 'sighting', user: 'Alice', item: 'Robin', icon: 'visibility' });
        assert.equal(mp.socialFeed.length, 1);
        assert.equal(mp.socialFeed[0].user, 'Alice');
    });

    test('prepends (newest first)', () => {
        mp.addToFeed({ type: 'sighting', user: 'Alice', item: 'Robin', icon: 'visibility' });
        mp.addToFeed({ type: 'sighting', user: 'Bob', item: 'Fox', icon: 'visibility' });
        assert.equal(mp.socialFeed[0].user, 'Bob');
        assert.equal(mp.socialFeed[1].user, 'Alice');
    });

    test('caps feed at 10 entries', () => {
        for (let i = 0; i < 15; i++) {
            mp.addToFeed({ type: 'sighting', user: `User${i}`, item: 'X', icon: 'v' });
        }
        assert.equal(mp.socialFeed.length, 10);
    });

    test('each entry gets a Date timestamp', () => {
        mp.addToFeed({ type: 'gift', user: 'A', item: 'Gift', icon: 'card_giftcard' });
        assert.ok(mp.socialFeed[0].time instanceof Date);
    });
});

describe('multiplayer.handleData() — SIGHTING', () => {
    let mp;
    beforeEach(() => {
        mp = Object.create(multiplayer);
        mp.socialFeed = [];
        mp.friendsData = {};
        mp.app = makeApp();
        mp.updateFeedUI = () => {};
        mp.updateList = () => {};
        mp.updateAdminTable = () => {};
    });

    test('shows toast for SIGHTING message', () => {
        mp.handleData({ type: 'SIGHTING', payload: { username: 'Alice', speciesName: 'Blue Jay' } });
        assert.ok(mp.app._toasts.some(t => t.includes('Alice') && t.includes('Blue Jay')));
    });

    test('adds to feed for SIGHTING', () => {
        mp.handleData({ type: 'SIGHTING', payload: { username: 'Bob', speciesName: 'Deer' } });
        assert.equal(mp.socialFeed[0].type, 'sighting');
        assert.equal(mp.socialFeed[0].item, 'Deer');
    });
});

describe('multiplayer.handleData() — GIFT', () => {
    let mp;
    beforeEach(() => {
        mp = Object.create(multiplayer);
        mp.socialFeed = [];
        mp.friendsData = {};
        mp.app = makeApp();
        mp.updateFeedUI = () => {};
        mp.updateList = () => {};
        mp.updateAdminTable = () => {};
    });

    test('shows gift toast', () => {
        mp.handleData({ type: 'GIFT', payload: { from: 'Carol', giftName: 'Nature Gift', giftType: 'seeds', amount: 10 } });
        assert.ok(mp.app._toasts.some(t => t.includes('Carol')));
    });

    test('adds to feed for GIFT', () => {
        mp.handleData({ type: 'GIFT', payload: { from: 'Carol', giftName: 'Nature Gift', giftType: 'seeds', amount: 10 } });
        assert.equal(mp.socialFeed[0].type, 'gift');
        assert.equal(mp.socialFeed[0].user, 'Carol');
    });
});

describe('multiplayer.handleData() — JOURNAL_SHARE', () => {
    let mp;
    beforeEach(() => {
        mp = Object.create(multiplayer);
        mp.socialFeed = [];
        mp.friendsData = {};
        mp.app = makeApp();
        mp.updateFeedUI = () => {};
        mp.updateList = () => {};
        mp.updateAdminTable = () => {};
    });

    test('shows toast for JOURNAL_SHARE', () => {
        mp.handleData({ type: 'JOURNAL_SHARE', payload: { username: 'Dave', obs: { speciesName: 'Rabbit' } } });
        assert.ok(mp.app._toasts.some(t => t.includes('Dave')));
    });

    test('adds journal entry to feed', () => {
        mp.handleData({ type: 'JOURNAL_SHARE', payload: { username: 'Eve', obs: { speciesName: 'Hawk' } } });
        assert.equal(mp.socialFeed[0].type, 'journal');
        assert.equal(mp.socialFeed[0].item, 'Hawk');
    });

    test('handles obs without speciesName gracefully', () => {
        assert.doesNotThrow(() => {
            mp.handleData({ type: 'JOURNAL_SHARE', payload: { username: 'Eve', obs: null } });
        });
        assert.equal(mp.socialFeed[0].item, 'observation');
    });
});

describe('multiplayer.sendGift()', () => {
    let mp;
    beforeEach(() => {
        mp = Object.create(multiplayer);
        mp.socialFeed = [];
        mp.connections = [];
        mp.hostConnection = null;
        mp.app = makeApp({ username: 'Tester' });
        mp.updateFeedUI = () => {};
        mp.updateList = () => {};
        mp.updateAdminTable = () => {};
    });

    test('sets _sentGift flag on state', () => {
        mp.sendGift('peer-xyz', 'seeds');
        assert.equal(mp.app.state._sentGift, true);
    });

    test('shows gift toast', () => {
        mp.sendGift('peer-xyz', 'seeds');
        assert.ok(mp.app._toasts.some(t => t.includes('🎁')));
    });

    test('adds to socialFeed', () => {
        mp.sendGift('peer-xyz', 'seeds');
        assert.equal(mp.socialFeed[0].type, 'gift');
        assert.equal(mp.socialFeed[0].user, 'You');
    });
});

describe('multiplayer.broadcastJournalShare()', () => {
    let mp;
    beforeEach(() => {
        mp = Object.create(multiplayer);
        mp.connections = [];
        mp.hostConnection = null;
        mp.app = makeApp({ username: 'Nat' });
        mp._sent = [];
        mp.broadcast = (d) => mp._sent.push(d);
    });

    test('sends JOURNAL_SHARE type message', () => {
        const obs = { speciesName: 'Kingfisher', dp: 150 };
        mp.broadcastJournalShare(obs);
        assert.equal(mp._sent.length, 1);
        assert.equal(mp._sent[0].type, 'JOURNAL_SHARE');
    });

    test('payload includes username and obs', () => {
        const obs = { speciesName: 'Kingfisher' };
        mp.broadcastJournalShare(obs);
        assert.equal(mp._sent[0].payload.username, 'Nat');
        assert.deepEqual(mp._sent[0].payload.obs, obs);
    });

    test('sends via hostConnection when connected as peer', () => {
        const sent = [];
        mp.hostConnection = { send(d) { sent.push(d); } };
        mp.broadcastJournalShare({ speciesName: 'Sparrow' });
        assert.equal(sent.length, 1);
        assert.equal(mp._sent.length, 0); // broadcast() not called
    });
});

describe('multiplayer.disconnect()', () => {
    test('clears hostConnection', () => {
        const mp = Object.create(multiplayer);
        mp.hostConnection = { close() {} };
        mp.connections = [];
        mp._posInterval = null;
        mp.app = makeApp();
        mp.app.map.clearPlayers = () => {};
        mp.updateUI = () => {};
        mp.disconnect();
        assert.equal(mp.hostConnection, null);
    });

    test('clears connections array', () => {
        const mp = Object.create(multiplayer);
        mp.hostConnection = null;
        mp.connections = [{ close() {} }, { close() {} }];
        mp._posInterval = null;
        mp.app = makeApp();
        mp.app.map.clearPlayers = () => {};
        mp.updateUI = () => {};
        mp.disconnect();
        assert.equal(mp.connections.length, 0);
    });
});

describe('multiplayer module structure', () => {
    test('exports an object', () => {
        assert.equal(typeof multiplayer, 'object');
    });

    test('has required methods', () => {
        const required = ['init', 'copyId', 'joinParty', 'disconnect', 'handleConn',
            'handleData', 'broadcast', 'broadcastPos', 'broadcastSighting',
            'broadcastJournalShare', 'sendGift', 'addToFeed', 'updateFeedUI',
            'updateUI', 'updateList'];
        for (const m of required) {
            assert.equal(typeof multiplayer[m], 'function', `multiplayer.${m} is not a function`);
        }
    });

    test('socialFeed initializes as empty array', () => {
        assert.deepEqual(multiplayer.socialFeed, []);
    });
});
