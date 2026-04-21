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
            'updateUI', 'updateList',
            'loadFriends', 'saveFriend', 'removeFriend', '_persistFriends',
            'drainSyncQueue', 'switchPartyTab', 'renderPartyPanel',
            'updateSessionDashboard', 'exportSession'];
        for (const m of required) {
            assert.equal(typeof multiplayer[m], 'function', `multiplayer.${m} is not a function`);
        }
    });

    test('socialFeed initializes as empty array', () => {
        assert.deepEqual(multiplayer.socialFeed, []);
    });

    test('friends initializes as empty object', () => {
        assert.deepEqual(multiplayer.friends, {});
    });

    test('sessionData initializes as empty object', () => {
        assert.deepEqual(multiplayer.sessionData, {});
    });
});

describe('multiplayer.loadFriends() / saveFriend() / removeFriend()', () => {
    let mp;
    let store;

    beforeEach(() => {
        mp = Object.create(multiplayer);
        mp.friends = {};
        store = {};
        global.localStorage = {
            getItem: (k) => store[k] ?? null,
            setItem: (k, v) => { store[k] = v; },
            removeItem: (k) => { delete store[k]; }
        };
    });

    test('loadFriends() starts with empty object when no stored data', () => {
        mp.loadFriends();
        assert.deepEqual(mp.friends, {});
    });

    test('loadFriends() parses stored JSON friends', () => {
        store['EDE_Friends'] = JSON.stringify({ AB12: { code: 'AB12', nickname: 'Alice', lastSeen: '2024-01-01' } });
        mp.loadFriends();
        assert.equal(mp.friends['AB12'].nickname, 'Alice');
    });

    test('loadFriends() handles invalid JSON gracefully', () => {
        store['EDE_Friends'] = 'not-json{{{';
        assert.doesNotThrow(() => mp.loadFriends());
        assert.deepEqual(mp.friends, {});
    });

    test('saveFriend() adds friend to this.friends', () => {
        mp.saveFriend('XY99', 'Bob');
        assert.equal(mp.friends['XY99'].nickname, 'Bob');
        assert.equal(mp.friends['XY99'].code, 'XY99');
    });

    test('saveFriend() persists to localStorage', () => {
        mp.saveFriend('XY99', 'Bob');
        const saved = JSON.parse(store['EDE_Friends']);
        assert.equal(saved['XY99'].nickname, 'Bob');
    });

    test('removeFriend() removes from this.friends', () => {
        mp.friends['XY99'] = { code: 'XY99', nickname: 'Bob', lastSeen: '' };
        mp.removeFriend('XY99');
        assert.equal(mp.friends['XY99'], undefined);
    });

    test('removeFriend() persists removal to localStorage', () => {
        mp.friends['XY99'] = { code: 'XY99', nickname: 'Bob', lastSeen: '' };
        mp.removeFriend('XY99');
        const saved = JSON.parse(store['EDE_Friends'] || '{}');
        assert.equal(saved['XY99'], undefined);
    });
});

describe('multiplayer.init() — persistent code', () => {
    let store;

    beforeEach(() => {
        store = {};
        global.localStorage = {
            getItem: (k) => store[k] ?? null,
            setItem: (k, v) => { store[k] = v; },
            removeItem: (k) => { delete store[k]; }
        };
    });

    test('saves generated code to localStorage on first init', () => {
        const mp = Object.create(multiplayer);
        mp.init(makeApp());
        assert.ok(store['EDE_MyCode']);
        assert.match(store['EDE_MyCode'], /^[A-Z0-9]{4}$/);
    });

    test('reuses saved code from localStorage on subsequent init', () => {
        store['EDE_MyCode'] = 'WXYZ';
        const mp = Object.create(multiplayer);
        mp.init(makeApp());
        assert.equal(mp.myId, 'WXYZ');
    });

    test('generates new code if stored value is invalid', () => {
        store['EDE_MyCode'] = 'bad!';
        const mp = Object.create(multiplayer);
        mp.init(makeApp());
        assert.match(mp.myId, /^[A-Z0-9]{4}$/);
    });
});

describe('multiplayer.drainSyncQueue()', () => {
    let mp;

    beforeEach(() => {
        mp = Object.create(multiplayer);
        mp.connections = [];
        mp.hostConnection = null;
        mp.app = makeApp({ syncQueue: [{ speciesName: 'Robin', dp: 50 }] });
        mp._sent = [];
        mp.broadcast = (d) => mp._sent.push(d);
    });

    test('sends SYNC_BATCH message type', () => {
        mp.drainSyncQueue();
        assert.equal(mp._sent.length, 1);
        assert.equal(mp._sent[0].type, 'SYNC_BATCH');
    });

    test('payload contains observations from syncQueue', () => {
        mp.drainSyncQueue();
        assert.equal(mp._sent[0].payload.observations.length, 1);
        assert.equal(mp._sent[0].payload.observations[0].speciesName, 'Robin');
    });

    test('payload includes username and avatar', () => {
        mp.app.state.username = 'NatExp';
        mp.app.state.avatar = '🦊';
        mp.drainSyncQueue();
        assert.equal(mp._sent[0].payload.username, 'NatExp');
        assert.equal(mp._sent[0].payload.avatar, '🦊');
    });

    test('clears syncQueue after sending', () => {
        mp.drainSyncQueue();
        assert.deepEqual(mp.app.state.syncQueue, []);
    });

    test('sets lastSyncAt to ISO string after sending', () => {
        mp.drainSyncQueue();
        assert.ok(typeof mp.app.state.lastSyncAt === 'string');
        assert.ok(mp.app.state.lastSyncAt.includes('T'));
    });

    test('does nothing when syncQueue is empty', () => {
        mp.app.state.syncQueue = [];
        mp.drainSyncQueue();
        assert.equal(mp._sent.length, 0);
    });

    test('sends via hostConnection when connected as guest', () => {
        const sent = [];
        mp.hostConnection = { send(d) { sent.push(d); } };
        mp.drainSyncQueue();
        assert.equal(sent.length, 1);
        assert.equal(mp._sent.length, 0);
    });
});

describe('multiplayer.handleData() — SYNC_BATCH', () => {
    let mp;

    beforeEach(() => {
        mp = Object.create(multiplayer);
        mp.socialFeed = [];
        mp.sessionData = {};
        mp.app = makeApp();
        mp.updateFeedUI = () => {};
        mp.updateSessionDashboard = () => {};
    });

    test('populates sessionData for new explorer', () => {
        mp.handleData({ type: 'SYNC_BATCH', payload: {
            username: 'Alice', avatar: '🦋', shortId: 'AB12',
            observations: [{ speciesName: 'Robin', dp: 50 }]
        }});
        assert.ok(mp.sessionData['AB12']);
        assert.equal(mp.sessionData['AB12'].username, 'Alice');
        assert.equal(mp.sessionData['AB12'].observations.length, 1);
    });

    test('appends observations for existing explorer', () => {
        mp.sessionData['AB12'] = { username: 'Alice', avatar: '🦋', shortId: 'AB12', observations: [{ speciesName: 'Hawk' }], lastSeen: '' };
        mp.handleData({ type: 'SYNC_BATCH', payload: {
            username: 'Alice', avatar: '🦋', shortId: 'AB12',
            observations: [{ speciesName: 'Robin' }]
        }});
        assert.equal(mp.sessionData['AB12'].observations.length, 2);
    });

    test('shows toast with synced count', () => {
        mp.handleData({ type: 'SYNC_BATCH', payload: {
            username: 'Bob', avatar: '🐝', shortId: 'CD34',
            observations: [{ speciesName: 'Fox' }, { speciesName: 'Deer' }]
        }});
        assert.ok(mp.app._toasts.some(t => t.includes('2') && t.includes('Bob')));
    });

    test('calls updateSessionDashboard', () => {
        let called = false;
        mp.updateSessionDashboard = () => { called = true; };
        mp.handleData({ type: 'SYNC_BATCH', payload: {
            username: 'Carol', avatar: '🌿', shortId: 'EF56',
            observations: []
        }});
        assert.ok(called);
    });
});

describe('multiplayer.switchPartyTab()', () => {
    let mp;
    let tabs;
    let panels;

    beforeEach(() => {
        mp = Object.create(multiplayer);
        tabs = [
            { dataset: { tab: 'connect' }, classList: { _active: true, toggle(cls, val) { if (cls === 'active') this._active = val; } } },
            { dataset: { tab: 'friends' }, classList: { _active: false, toggle(cls, val) { if (cls === 'active') this._active = val; } } },
            { dataset: { tab: 'session' }, classList: { _active: false, toggle(cls, val) { if (cls === 'active') this._active = val; } } }
        ];
        panels = {
            'party-tab-connect': { classList: { _hidden: false, toggle(cls, val) { if (cls === 'hidden') this._hidden = val; } } },
            'party-tab-friends': { classList: { _hidden: true, toggle(cls, val) { if (cls === 'hidden') this._hidden = val; } } },
            'party-tab-session': { classList: { _hidden: true, toggle(cls, val) { if (cls === 'hidden') this._hidden = val; } } }
        };
        global.document = {
            querySelectorAll: (sel) => sel === '.party-tab' ? tabs : [],
            getElementById: (id) => panels[id] || null
        };
    });

    test('sets active class on the selected tab', () => {
        mp.switchPartyTab('friends');
        assert.equal(tabs[1].classList._active, true);
    });

    test('removes active class from other tabs', () => {
        mp.switchPartyTab('friends');
        assert.equal(tabs[0].classList._active, false);
        assert.equal(tabs[2].classList._active, false);
    });

    test('shows the selected tab panel', () => {
        mp.switchPartyTab('friends');
        assert.equal(panels['party-tab-friends'].classList._hidden, false);
    });

    test('hides other tab panels', () => {
        mp.switchPartyTab('friends');
        assert.equal(panels['party-tab-connect'].classList._hidden, true);
        assert.equal(panels['party-tab-session'].classList._hidden, true);
    });
});

describe('multiplayer.renderPartyPanel()', () => {
    test('is a function on multiplayer module', () => {
        assert.equal(typeof multiplayer.renderPartyPanel, 'function');
    });

    test('does not throw when DOM elements are absent', () => {
        const mp = Object.create(multiplayer);
        mp.app = makeApp();
        mp._renderSavedFriends = () => {};
        mp.updateSessionDashboard = () => {};
        global.document = { getElementById: () => null };
        global.localStorage = { getItem: () => null, setItem: () => {} };
        assert.doesNotThrow(() => mp.renderPartyPanel());
    });
});

