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

describe('multiplayer._generateCode()', () => {
    test('returns 8-char uppercase alphanumeric', () => {
        const mp = Object.create(multiplayer);
        assert.match(mp._generateCode(), /^[A-Z0-9]{8}$/);
    });
    test('produces unique codes', () => {
        const mp = Object.create(multiplayer);
        const codes = new Set();
        for (let i = 0; i < 30; i++) codes.add(mp._generateCode());
        assert.ok(codes.size > 1);
    });
});

describe('multiplayer._displayCode()', () => {
    test('inserts dash at position 4', () => {
        const mp = Object.create(multiplayer);
        assert.equal(mp._displayCode('ABCD1234'), 'ABCD-1234');
    });
    test('returns fallback for null', () => {
        const mp = Object.create(multiplayer);
        assert.equal(mp._displayCode(null), '????-????');
    });
    test('short code returned as-is', () => {
        const mp = Object.create(multiplayer);
        assert.equal(mp._displayCode('AB12'), 'AB12');
    });
});

describe('multiplayer._normalizeCode()', () => {
    test('strips dashes and uppercases', () => {
        const mp = Object.create(multiplayer);
        assert.equal(mp._normalizeCode('abcd-1234'), 'ABCD1234');
    });
    test('strips spaces', () => {
        const mp = Object.create(multiplayer);
        assert.equal(mp._normalizeCode('ABCD 1234'), 'ABCD1234');
    });
    test('truncates to 8', () => {
        const mp = Object.create(multiplayer);
        assert.equal(mp._normalizeCode('ABCDEFGHIJKL'), 'ABCDEFGH');
    });
    test('handles null', () => {
        const mp = Object.create(multiplayer);
        assert.equal(mp._normalizeCode(null), '');
    });
});

describe('multiplayer.init()', () => {
    test('assigns an 8-char uppercase myId', () => {
        const mp = Object.create(multiplayer);
        mp.init(makeApp());
        assert.equal(typeof mp.myId, 'string');
        assert.equal(mp.myId.length, 8);
        assert.match(mp.myId, /^[A-Z0-9]{8}$/);
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
        mp.hostConnection = { open: true, send(d) { sent.push(d); } };
        mp.broadcastJournalShare({ speciesName: 'Sparrow' });
        assert.equal(sent.length, 1);
        assert.equal(mp._sent.length, 0); // broadcast() not called
    });
});

describe('multiplayer.disconnect()', () => {
    function makeMp() {
        const mp = Object.create(multiplayer);
        mp._posInterval = null; mp._heartbeatInterval = null;
        mp._healthCheckInterval = null; mp._presenceRefreshInterval = null;
        mp._reconnectTimers = {}; mp._reconnectAttempts = {};
        mp._presenceConns = {}; mp.connectionHealth = {};
        mp.app = makeApp();
        mp.updateUI = () => {};
        return mp;
    }
    test('clears hostConnection', () => {
        const mp = makeMp();
        mp.hostConnection = { close() {} }; mp.connections = [];
        mp.disconnect();
        assert.equal(mp.hostConnection, null);
    });

    test('clears connections array', () => {
        const mp = makeMp();
        mp.hostConnection = null;
        mp.connections = [{ close() {} }, { close() {} }];
        mp.disconnect();
        assert.equal(mp.connections.length, 0);
    });

    test('cancels all reconnect timers', () => {
        const mp = makeMp();
        mp.hostConnection = null; mp.connections = [];
        mp._reconnectTimers = { pA: setTimeout(() => {}, 99999) };
        mp.disconnect();
        assert.deepEqual(mp._reconnectTimers, {});
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
            'updateUI', 'updateList', 'updatePresenceUI',
            'loadFriends', 'saveFriend', 'removeFriend', '_persistFriends',
            'drainSyncQueue', 'syncWithFriend', 'switchPartyTab', 'renderPartyPanel',
            'updateSessionDashboard', 'exportSession',
            '_generateCode', '_displayCode', '_normalizeCode',
            'startHeartbeat', 'stopHeartbeat', '_pingAll',
            'startHealthCheck', 'stopHealthCheck', '_checkHealth', '_markHealth',
            '_scheduleReconnect', '_cancelReconnect',
            'probeAllFriends', 'startPresenceRefresh', '_probeOne', '_renderSavedFriends'];
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

    test('connectionHealth initializes as empty object', () => {
        assert.deepEqual(multiplayer.connectionHealth, {});
    });
});

describe('multiplayer.loadFriends() / saveFriend() / removeFriend()', () => {
    let mp;
    let store;

    beforeEach(() => {
        mp = Object.create(multiplayer);
        mp.friends = {};
        mp._friendOnlineStatus = {};
        mp._presenceConns = {};
        mp._probeOne = () => {};
        mp._renderSavedFriends = () => {};
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
        store['EDE_Friends'] = JSON.stringify({ AB12CD34: { code: 'AB12CD34', nickname: 'Alice', lastSeen: '2024-01-01' } });
        mp.loadFriends();
        assert.equal(mp.friends['AB12CD34'].nickname, 'Alice');
    });

    test('loadFriends() handles invalid JSON gracefully', () => {
        store['EDE_Friends'] = 'not-json{{{';
        assert.doesNotThrow(() => mp.loadFriends());
        assert.deepEqual(mp.friends, {});
    });

    test('saveFriend() normalizes 8-char code and adds friend', () => {
        mp.saveFriend('XYZA-1234', 'Bob');
        assert.equal(mp.friends['XYZA1234'].nickname, 'Bob');
        assert.equal(mp.friends['XYZA1234'].code, 'XYZA1234');
    });

    test('saveFriend() persists to localStorage', () => {
        mp.saveFriend('XYZA1234', 'Bob');
        const saved = JSON.parse(store['EDE_Friends']);
        assert.equal(saved['XYZA1234'].nickname, 'Bob');
    });

    test('removeFriend() removes from this.friends', () => {
        mp.friends['XYZA1234'] = { code: 'XYZA1234', nickname: 'Bob', lastSeen: '' };
        mp.removeFriend('XYZA1234');
        assert.equal(mp.friends['XYZA1234'], undefined);
    });

    test('removeFriend() persists removal to localStorage', () => {
        mp.friends['XYZA1234'] = { code: 'XYZA1234', nickname: 'Bob', lastSeen: '' };
        mp.removeFriend('XYZA1234');
        const saved = JSON.parse(store['EDE_Friends'] || '{}');
        assert.equal(saved['XYZA1234'], undefined);
    });
});

describe('multiplayer.init() — persistent 8-char code', () => {
    let store;

    beforeEach(() => {
        store = {};
        global.localStorage = {
            getItem: (k) => store[k] ?? null,
            setItem: (k, v) => { store[k] = v; },
            removeItem: (k) => { delete store[k]; }
        };
    });

    test('saves generated 8-char code to localStorage on first init', () => {
        const mp = Object.create(multiplayer);
        mp.init(makeApp());
        assert.ok(store['EDE_MyCode']);
        assert.match(store['EDE_MyCode'], /^[A-Z0-9]{8}$/);
    });

    test('reuses saved 8-char code from localStorage on subsequent init', () => {
        store['EDE_MyCode'] = 'WXYZ1234';
        const mp = Object.create(multiplayer);
        mp.init(makeApp());
        assert.equal(mp.myId, 'WXYZ1234');
    });

    test('rejects old 4-char codes and generates new 8-char one', () => {
        store['EDE_MyCode'] = 'WXYZ';
        const mp = Object.create(multiplayer);
        mp.init(makeApp());
        assert.equal(mp.myId.length, 8);
        assert.notEqual(mp.myId, 'WXYZ');
    });

    test('generates new code if stored value is invalid', () => {
        store['EDE_MyCode'] = 'bad!';
        const mp = Object.create(multiplayer);
        mp.init(makeApp());
        assert.match(mp.myId, /^[A-Z0-9]{8}$/);
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
        mp.hostConnection = { open: true, send(d) { sent.push(d); } };
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
            username: 'Alice', avatar: '🦋', shortId: 'AB12CD34',
            observations: [{ speciesName: 'Robin', dp: 50 }]
        }});
        assert.ok(mp.sessionData['AB12CD34']);
        assert.equal(mp.sessionData['AB12CD34'].username, 'Alice');
        assert.equal(mp.sessionData['AB12CD34'].observations.length, 1);
    });

    test('appends observations for existing explorer', () => {
        mp.sessionData['AB12CD34'] = { username: 'Alice', avatar: '🦋', shortId: 'AB12CD34', observations: [{ speciesName: 'Hawk' }], lastSeen: '' };
        mp.handleData({ type: 'SYNC_BATCH', payload: {
            username: 'Alice', avatar: '🦋', shortId: 'AB12CD34',
            observations: [{ speciesName: 'Robin' }]
        }});
        assert.equal(mp.sessionData['AB12CD34'].observations.length, 2);
    });

    test('shows toast with synced count', () => {
        mp.handleData({ type: 'SYNC_BATCH', payload: {
            username: 'Bob', avatar: '🐝', shortId: 'CD34EF56',
            observations: [{ speciesName: 'Fox' }, { speciesName: 'Deer' }]
        }});
        assert.ok(mp.app._toasts.some(t => t.includes('2') && t.includes('Bob')));
    });

    test('calls updateSessionDashboard', () => {
        let called = false;
        mp.updateSessionDashboard = () => { called = true; };
        mp.handleData({ type: 'SYNC_BATCH', payload: {
            username: 'Carol', avatar: '🌿', shortId: 'EF56GH78',
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
        mp.updateList = () => {};
        global.document = { getElementById: () => null };
        global.localStorage = { getItem: () => null, setItem: () => {} };
        assert.doesNotThrow(() => mp.renderPartyPanel());
    });
});

// ─────────────────────────────────────────────
// Heartbeat
// ─────────────────────────────────────────────
describe('multiplayer heartbeat', () => {
    test('stopHeartbeat clears interval', () => {
        const mp = Object.create(multiplayer);
        mp._heartbeatInterval = setInterval(() => {}, 99999);
        mp.stopHeartbeat();
        assert.equal(mp._heartbeatInterval, null);
    });
    test('startHeartbeat sets interval', () => {
        const mp = Object.create(multiplayer);
        mp._heartbeatInterval = null;
        mp.connections = []; mp.hostConnection = null; mp.peer = null;
        mp.startHeartbeat();
        assert.notEqual(mp._heartbeatInterval, null);
        mp.stopHeartbeat();
    });
});

// ─────────────────────────────────────────────
// Health monitoring
// ─────────────────────────────────────────────
describe('multiplayer._checkHealth()', () => {
    let mp;
    beforeEach(() => {
        mp = Object.create(multiplayer);
        mp.connectionHealth = {};
        mp.hostConnection = null;
        mp.app = makeApp();
        mp.updateList = () => {};
        mp.updatePresenceUI = () => {};
    });
    test('recent pong stays connected', () => {
        mp.connectionHealth['p1'] = { lastPong: Date.now() - 5000, status: 'connected', reconnects: 0 };
        mp._checkHealth();
        assert.equal(mp.connectionHealth['p1'].status, 'connected');
    });
    test('30-60s pong becomes degraded', () => {
        mp.connectionHealth['p2'] = { lastPong: Date.now() - 35000, status: 'connected', reconnects: 0 };
        mp._checkHealth();
        assert.equal(mp.connectionHealth['p2'].status, 'degraded');
    });
    test('>60s pong becomes disconnected', () => {
        mp.connectionHealth['p3'] = { lastPong: Date.now() - 65000, status: 'connected', reconnects: 0 };
        mp._scheduleReconnect = () => {};
        mp._checkHealth();
        assert.equal(mp.connectionHealth['p3'].status, 'disconnected');
    });
    test('no lastPong skipped', () => {
        mp.connectionHealth['p4'] = { status: 'connected', reconnects: 0 };
        assert.doesNotThrow(() => mp._checkHealth());
        assert.equal(mp.connectionHealth['p4'].status, 'connected');
    });
});

describe('multiplayer._markHealth()', () => {
    test('creates entry if absent', () => {
        const mp = Object.create(multiplayer);
        mp.connectionHealth = {};
        mp._markHealth('px', { status: 'connected', lastPong: 12345 });
        assert.equal(mp.connectionHealth['px'].status, 'connected');
        assert.equal(mp.connectionHealth['px'].lastPong, 12345);
    });
    test('merges into existing entry', () => {
        const mp = Object.create(multiplayer);
        mp.connectionHealth = { py: { status: 'degraded', reconnects: 2 } };
        mp._markHealth('py', { status: 'connected', latency: 45 });
        assert.equal(mp.connectionHealth['py'].reconnects, 2);
        assert.equal(mp.connectionHealth['py'].latency, 45);
    });
});

// ─────────────────────────────────────────────
// Auto-reconnect
// ─────────────────────────────────────────────
describe('multiplayer._scheduleReconnect()', () => {
    test('schedules a reconnect timer', () => {
        const mp = Object.create(multiplayer);
        mp._reconnectTimers = {}; mp._reconnectAttempts = {};
        mp.app = makeApp();
        mp._getLastPartyCode = () => 'ABCD1234';
        mp._reconnectTo = () => {};
        mp._scheduleReconnect('px', 0);
        assert.ok(mp._reconnectTimers['px']);
        clearTimeout(mp._reconnectTimers['px']);
    });
    test('shows manual toast at max attempts', () => {
        const mp = Object.create(multiplayer);
        mp._reconnectTimers = {}; mp._reconnectAttempts = {};
        mp.app = makeApp();
        mp._scheduleReconnect('px', 5);
        assert.ok(mp.app._toasts.some(t => t.toLowerCase().includes('manually')));
    });
});

describe('multiplayer._cancelReconnect()', () => {
    test('clears and removes timer', () => {
        const mp = Object.create(multiplayer);
        mp._reconnectTimers = { pA: setTimeout(() => {}, 99999) };
        mp._cancelReconnect('pA');
        assert.equal(mp._reconnectTimers['pA'], undefined);
    });
    test('no-op when absent', () => {
        const mp = Object.create(multiplayer);
        mp._reconnectTimers = {};
        assert.doesNotThrow(() => mp._cancelReconnect('nope'));
    });
});

// ─────────────────────────────────────────────
// PING / PONG
// ─────────────────────────────────────────────
describe('multiplayer.handleData() PING/PONG', () => {
    let mp, sent;
    beforeEach(() => {
        mp = Object.create(multiplayer);
        mp.socialFeed = []; mp.friendsData = {}; mp.connectionHealth = {};
        sent = [];
        mp.hostConnection = { open: true, send: (d) => sent.push(d) };
        mp.connections = [];
        mp.app = makeApp();
        mp.updateFeedUI = () => {}; mp.updateList = () => {}; mp.updateAdminTable = () => {};
    });
    test('PING triggers PONG reply', () => {
        mp.handleData({ type: 'PING', payload: { id: 'EDE8-ABCD1234', ts: 1000000 } });
        assert.ok(sent.some(d => d.type === 'PONG'));
    });
    test('PONG echoes ts from PING', () => {
        mp.handleData({ type: 'PING', payload: { id: 'EDE8-ABCD1234', ts: 9999 } });
        const pong = sent.find(d => d.type === 'PONG');
        assert.equal(pong.payload.ts, 9999);
    });
    test('PONG updates health with latency', () => {
        const now = Date.now();
        mp.handleData({ type: 'PONG', payload: { id: 'EDE8-ABCD1234', ts: now - 50 } });
        const health = mp.connectionHealth['EDE8-ABCD1234'];
        assert.ok(health);
        assert.ok(health.latency >= 0);
    });
});

// ─────────────────────────────────────────────
// Presence
// ─────────────────────────────────────────────
describe('multiplayer.handleConn() presence label', () => {
    test('presence conn NOT added to connections array', () => {
        const mp = Object.create(multiplayer);
        mp.connections = []; mp.connectionHealth = {};
        mp._markHealth = () => {}; mp.updateUI = () => {};
        const conn = { label: 'presence', peer: 'EDE8-XYZW5678', on(e, fn) {}, send() {} };
        mp.handleConn(conn);
        assert.equal(mp.connections.length, 0);
    });
    test('party conn (no label) added to connections', () => {
        const mp = Object.create(multiplayer);
        mp.connections = []; mp.connectionHealth = {};
        mp._markHealth = () => {}; mp.updateUI = () => {}; mp.updateList = () => {};
        const conn = { label: undefined, peer: 'EDE8-XYZW5678', on(e, fn) {}, send() {} };
        mp.handleConn(conn);
        assert.equal(mp.connections.length, 1);
    });
});

describe('multiplayer.probeAllFriends()', () => {
    test('calls _probeOne for each 8-char friend', () => {
        const mp = Object.create(multiplayer);
        mp.peer = { id: 'EDE8-ABCD1234', destroyed: false };
        mp.friends = { 'ABCD1234': { code: 'ABCD1234' }, 'EFGH5678': { code: 'EFGH5678' } };
        const probed = [];
        mp._probeOne = (c) => probed.push(c);
        mp.probeAllFriends();
        assert.ok(probed.includes('ABCD1234'));
        assert.ok(probed.includes('EFGH5678'));
    });
    test('skips when peer null', () => {
        const mp = Object.create(multiplayer);
        mp.peer = null;
        mp.friends = { 'ABCD1234': { code: 'ABCD1234' } };
        const probed = [];
        mp._probeOne = (c) => probed.push(c);
        mp.probeAllFriends();
        assert.equal(probed.length, 0);
    });
});

describe('multiplayer.syncWithFriend()', () => {
    test('no-op when friend not connected', () => {
        const mp = Object.create(multiplayer);
        mp.connections = []; mp._presenceConns = {};
        mp.app = makeApp({ syncQueue: [{ speciesName: 'Robin' }] });
        assert.doesNotThrow(() => mp.syncWithFriend('ABCD1234'));
    });
    test('sends SYNC_BATCH when friend conn open', () => {
        const mp = Object.create(multiplayer);
        mp.connections = [];
        const sent = [];
        mp._presenceConns = { 'ABCD1234': { open: true, peer: 'EDE8-ABCD1234', send: (d) => sent.push(d) } };
        mp.app = makeApp({ syncQueue: [{ speciesName: 'Robin' }] });
        mp.syncWithFriend('ABCD1234');
        assert.equal(sent.length, 1);
        assert.equal(sent[0].type, 'SYNC_BATCH');
    });
    test('clears syncQueue after sending', () => {
        const mp = Object.create(multiplayer);
        mp.connections = [];
        mp._presenceConns = { 'ABCD1234': { open: true, peer: 'EDE8-ABCD1234', send: () => {} } };
        mp.app = makeApp({ syncQueue: [{ speciesName: 'Robin' }] });
        mp.syncWithFriend('ABCD1234');
        assert.deepEqual(mp.app.state.syncQueue, []);
    });
});

