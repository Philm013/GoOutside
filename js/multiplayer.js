export const multiplayer = {
    peer: null, myId: null,
    connections: [], hostConnection: null,
    friendsData: {}, friends: {}, sessionData: {},
    connectionHealth: {},
    _friendOnlineStatus: {},
    _presenceConns: {},
    socialFeed: [],
    _posInterval: null, _heartbeatInterval: null, _healthCheckInterval: null,
    _presenceRefreshInterval: null,
    _reconnectTimers: {}, _reconnectAttempts: {},

    init(app) {
        this.app = app;
        const ls = (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') ? localStorage : null;
        const saved = ls ? ls.getItem('EDE_MyCode') : null;
        if (saved && /^[A-Z0-9]{8}$/.test(saved)) {
            this.myId = saved;
        } else {
            this.myId = this._generateCode();
            if (ls) ls.setItem('EDE_MyCode', this.myId);
        }
        this.loadFriends();
        if (typeof Peer !== 'undefined') {
            this.peer = new Peer('EDE8-' + this.myId);
            this.peer.on('open', () => {
                const el = document.getElementById('my-peer-id');
                if (el) el.innerText = this._displayCode(this.myId);
                this._posInterval = setInterval(() => this.broadcastPos(), 5000);
                this.startHeartbeat();
                this.startHealthCheck();
                this.startPresenceRefresh();
                setTimeout(() => this.probeAllFriends(), 2000);
            });
            this.peer.on('connection', conn => this.handleConn(conn));
            this.peer.on('error', err => {
                if (err.type === 'disconnected' || err.type === 'network') {
                    setTimeout(() => { if (this.peer && !this.peer.destroyed) this.peer.reconnect(); }, 3000);
                }
            });
            this.peer.on('disconnected', () => {
                setTimeout(() => { if (this.peer && !this.peer.destroyed) this.peer.reconnect(); }, 3000);
            });
        }
    },

    // Code utilities
    _generateCode() {
        const seg = () => Math.random().toString(36).substring(2, 6).toUpperCase();
        return seg() + seg();
    },
    _displayCode(code) {
        if (!code || code.length < 8) return code || '????-????';
        return code.slice(0, 4) + '-' + code.slice(4, 8);
    },
    _normalizeCode(input) {
        return String(input || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().substring(0, 8);
    },
    copyId() {
        const display = this._displayCode(this.myId);
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(display).then(() => {
                if (this.app.ui) this.app.ui.showToast('Code copied!');
            });
        }
    },

    // Heartbeat
    startHeartbeat() {
        this.stopHeartbeat();
        this._heartbeatInterval = setInterval(() => this._pingAll(), 15000);
    },
    stopHeartbeat() {
        clearInterval(this._heartbeatInterval);
        this._heartbeatInterval = null;
    },
    _pingAll() {
        const now = Date.now();
        const msg = { type: 'PING', payload: { id: this.peer ? this.peer.id : null, ts: now } };
        const allConns = this.connections.slice();
        if (this.hostConnection) allConns.push(this.hostConnection);
        allConns.forEach(c => {
            if (c.open) {
                c.send(msg);
                if (!this.connectionHealth[c.peer]) this.connectionHealth[c.peer] = { status: 'connected', reconnects: 0 };
                this.connectionHealth[c.peer].lastPing = now;
            }
        });
    },

    // Health monitoring
    startHealthCheck() {
        this.stopHealthCheck();
        this._healthCheckInterval = setInterval(() => this._checkHealth(), 10000);
    },
    stopHealthCheck() {
        clearInterval(this._healthCheckInterval);
        this._healthCheckInterval = null;
    },
    _checkHealth() {
        const now = Date.now();
        const DEGRADED = 30000;
        const DEAD = 60000;
        Object.entries(this.connectionHealth).forEach(([peerId, h]) => {
            if (!h.lastPong) return;
            const age = now - h.lastPong;
            const prev = h.status;
            if (age > DEAD) {
                h.status = 'disconnected';
                if (this.hostConnection && this.hostConnection.peer === peerId) this._scheduleReconnect(peerId);
            } else if (age > DEGRADED) {
                h.status = 'degraded';
            } else {
                h.status = 'connected';
            }
            if (prev !== h.status) this.updateList();
        });
        this.updatePresenceUI();
    },
    _markHealth(peerId, update) {
        if (!this.connectionHealth[peerId]) this.connectionHealth[peerId] = { status: 'connected', reconnects: 0 };
        Object.assign(this.connectionHealth[peerId], update);
    },

    // Auto-reconnect with exponential backoff
    _scheduleReconnect(peerId, attempt) {
        if (attempt === undefined) attempt = 0;
        const DELAYS = [3000, 8000, 20000, 45000, 120000];
        if (attempt >= DELAYS.length) {
            if (this.app.ui) this.app.ui.showToast('Could not reconnect. Try manually rejoining.');
            return;
        }
        this._cancelReconnect(peerId);
        const delay = DELAYS[attempt];
        this._reconnectAttempts[peerId] = attempt;
        if (this.app.ui) this.app.ui.showToast('Reconnecting in ' + Math.round(delay / 1000) + 's\u2026');
        this._reconnectTimers[peerId] = setTimeout(() => {
            const lastCode = this._getLastPartyCode();
            if (lastCode && lastCode.length === 8) {
                if (this.app.ui) this.app.ui.showToast('Reconnecting\u2026');
                this._reconnectTo(lastCode, peerId, attempt);
            }
        }, delay);
    },
    _cancelReconnect(peerId) {
        if (this._reconnectTimers[peerId]) {
            clearTimeout(this._reconnectTimers[peerId]);
            delete this._reconnectTimers[peerId];
        }
    },
    _reconnectTo(code, expectedPeerId, attempt) {
        if (!this.peer || this.peer.destroyed) return;
        const conn = this.peer.connect('EDE8-' + code);
        conn.on('open', () => {
            this.hostConnection = conn;
            this._cancelReconnect(expectedPeerId);
            this._markHealth(conn.peer, { status: 'connected', lastPong: Date.now(), reconnects: attempt });
            if (this.app.ui) { this.app.ui.showToast('Reconnected! \u2713'); this.updateUI(); }
            this.broadcastPos();
            this.drainSyncQueue();
            conn.on('data', d => { this._markHealth(conn.peer, { lastActivity: Date.now() }); this.handleData(d); });
            conn.on('close', () => {
                this.hostConnection = null;
                this.updateUI();
                this._scheduleReconnect(conn.peer, (this._reconnectAttempts[conn.peer] || 0) + 1);
            });
        });
        conn.on('error', () => this._scheduleReconnect(expectedPeerId, attempt + 1));
    },
    _getLastPartyCode() {
        try { return localStorage.getItem('EDE_LastParty'); } catch (e) { return null; }
    },

    _sendIntro(conn) {
        if (!conn || !conn.open) return;
        conn.send({
            type: 'INTRO',
            payload: {
                id: this.peer ? this.peer.id : null,
                shortId: this.myId,
                username: this.app && this.app.state ? this.app.state.username : '',
                avatar: this.app && this.app.state ? this.app.state.avatar : ''
            }
        });
    },

    // Presence probing (lightweight online detection for saved friends)
    probeAllFriends() {
        if (!this.peer || !this.peer.id) return;
        Object.values(this.friends).forEach(f => {
            if (f.code && f.code.length === 8) this._probeOne(f.code);
        });
    },
    startPresenceRefresh() {
        this._presenceRefreshInterval = setInterval(() => this.probeAllFriends(), 120000);
    },
    _probeOne(friendCode) {
        if (!this.peer || this.peer.destroyed) return;
        const norm = this._normalizeCode(friendCode);
        if (norm.length < 8) return;
        if (this._presenceConns[norm] && this._presenceConns[norm].open) return;
        this._friendOnlineStatus[norm] = 'checking';
        this.updatePresenceUI();
        const conn = this.peer.connect('EDE8-' + norm, { label: 'presence' });
        const timeout = setTimeout(() => {
            if (!conn.open) {
                this._friendOnlineStatus[norm] = 'offline';
                this.updatePresenceUI();
                try { conn.close(); } catch (e) {}
            }
        }, 7000);
        conn.on('open', () => {
            clearTimeout(timeout);
            this._friendOnlineStatus[norm] = 'online';
            this._presenceConns[norm] = conn;
            this.updatePresenceUI();
            conn.send({ type: 'PRESENCE', payload: { id: this.peer.id, shortId: this.myId, username: this.app.state ? this.app.state.username : '', avatar: this.app.state ? this.app.state.avatar : '', ts: Date.now() } });
        });
        conn.on('data', d => {
            if (d.type === 'PRESENCE_ACK') {
                this._friendOnlineStatus[norm] = 'online';
                this.updatePresenceUI();
            } else {
                this.handleData(d);
            }
        });
        conn.on('close', () => {
            this._friendOnlineStatus[norm] = 'offline';
            delete this._presenceConns[norm];
            this.updatePresenceUI();
        });
        conn.on('error', () => {
            this._friendOnlineStatus[norm] = 'offline';
            this.updatePresenceUI();
        });
    },

    // Party join/leave
    joinParty() {
        const codeInput = document.getElementById('target-peer-id');
        const code = this._normalizeCode(codeInput ? codeInput.value : '');
        if (code.length !== 8) {
            if (this.app.ui) this.app.ui.showToast('Enter an 8-character code (XXXX-XXXX)');
            return;
        }
        if (!this.peer) return;
        // Close any existing presence probe to this peer first
        if (this._presenceConns[code] && this._presenceConns[code].open) {
            try { this._presenceConns[code].close(); } catch (e) {}
            delete this._presenceConns[code];
        }
        const conn = this.peer.connect('EDE8-' + code);
        conn.on('open', () => this._finishJoin(conn, code));
        conn.on('error', () => { if (this.app.ui) this.app.ui.showToast('Could not connect'); });
    },
    _finishJoin(conn, code) {
        this.hostConnection = conn;
        try { localStorage.setItem('EDE_LastParty', code); } catch (e) {}
        this.app.state._joinedParty = true;
        this.app.data.checkBadges(this.app.state);
        this.app.saveState();
        this._markHealth(conn.peer, { status: 'connected', lastPong: Date.now() });
        if (this.app.ui) { this.app.ui.showToast('Connected! \uD83C\uDF3F'); this.updateUI(); }
        if (!this._posInterval) this._posInterval = setInterval(() => this.broadcastPos(), 5000);
        this._sendIntro(conn);
        this.broadcastPos();
        this.drainSyncQueue();
        conn.on('data', d => { this._markHealth(conn.peer, { lastActivity: Date.now() }); this.handleData(d); });
        conn.on('close', () => {
            this.hostConnection = null;
            if (this.app.map) this.app.map.clearPlayers();
            if (this.app.ui) this.app.ui.showToast('Disconnected');
            this.updateUI();
            this._scheduleReconnect(conn.peer, this._reconnectAttempts[conn.peer] || 0);
        });
    },
    disconnect() {
        clearInterval(this._posInterval); this._posInterval = null;
        this.stopHeartbeat();
        this.stopHealthCheck();
        clearInterval(this._presenceRefreshInterval); this._presenceRefreshInterval = null;
        Object.values(this._reconnectTimers).forEach(t => clearTimeout(t));
        this._reconnectTimers = {};
        this._reconnectAttempts = {};
        Object.values(this._presenceConns).forEach(c => { try { c.close(); } catch (e) {} });
        this._presenceConns = {};
        if (this.hostConnection) { try { this.hostConnection.close(); } catch (e) {} }
        this.connections.forEach(c => { try { c.close(); } catch (e) {} });
        this.hostConnection = null;
        this.connections = [];
        this.connectionHealth = {};
        if (this.app.map) this.app.map.clearPlayers();
        this.updateUI();
    },
    handleConn(conn) {
        if (conn.label === 'presence') {
            conn.on('data', d => {
                if (d.type === 'PRESENCE') {
                    conn.send({ type: 'PRESENCE_ACK', payload: { id: this.peer ? this.peer.id : null, shortId: this.myId } });
                    if (d.payload && d.payload.shortId) {
                        this._friendOnlineStatus[d.payload.shortId] = 'online';
                        this.updatePresenceUI();
                    }
                }
            });
            return;
        }
        this.connections.push(conn);
        this._markHealth(conn.peer, { status: 'connected', lastPong: Date.now() });
        if (conn.open) this._sendIntro(conn);
        else conn.on('open', () => this._sendIntro(conn));
        conn.on('data', d => {
            this._markHealth(conn.peer, { lastActivity: Date.now() });
            if (!this.hostConnection) this.broadcast(d, conn.peer);
            this.handleData(d);
        });
        conn.on('close', () => {
            this.connections = this.connections.filter(c => c.peer !== conn.peer);
            delete this.connectionHealth[conn.peer];
            if (this.app.map) this.app.map.removePlayer(conn.peer);
            this.updateList();
            this.updateUI();
        });
        this.updateUI();
    },

    // Message handling
    handleData(d) {
        if (d.type === 'PING') {
            const src = this.hostConnection || this.connections.find(c => c.open);
            if (src && src.open) src.send({ type: 'PONG', payload: { id: this.peer ? this.peer.id : null, ts: d.payload.ts } });
        } else if (d.type === 'PONG') {
            const latency = Math.max(0, Date.now() - (d.payload.ts || 0));
            this._markHealth(d.payload.id, { lastPong: Date.now(), latency: latency, status: 'connected' });
            this.updateList();
        } else if (d.type === 'POS') {
            if (this.app.map && this.app.map.updatePlayer) this.app.map.updatePlayer(d.payload);
            this.friendsData[d.payload.id] = d.payload;
            this.updateList();
            this.updateAdminTable();
        } else if (d.type === 'INTRO') {
            if (d.payload && d.payload.id) {
                const id = d.payload.id;
                const prev = this.friendsData[id] || {};
                this.friendsData[id] = {
                    ...prev,
                    id,
                    shortId: d.payload.shortId ?? prev.shortId,
                    username: d.payload.username ?? prev.username,
                    avatar: d.payload.avatar ?? prev.avatar
                };
                this.updateList();
                this.updateAdminTable();
            }
        } else if (d.type === 'SIGHTING') {
            if (this.app.map && this.app.map.addGlobalSighting) this.app.map.addGlobalSighting(d.payload);
            if (this.app.ui) {
                this.app.ui.showToast(d.payload.username + ' found a ' + d.payload.speciesName + '!');
                this.addToFeed({ type: 'sighting', user: d.payload.username, item: d.payload.speciesName, icon: 'visibility' });
            }
        } else if (d.type === 'GIFT') {
            if (this.app.ui) {
                this.app.ui.showToast(d.payload.from + ' sent you a gift! \uD83C\uDF81');
                this.addToFeed({ type: 'gift', user: d.payload.from, item: d.payload.giftName, icon: 'card_giftcard' });
                this.app.saveState();
            }
        } else if (d.type === 'JOURNAL_SHARE') {
            if (this.app.ui) {
                this.app.ui.showToast(d.payload.username + ' shared a journal entry!');
                this.addToFeed({ type: 'journal', user: d.payload.username, item: (d.payload.obs && d.payload.obs.speciesName) || 'observation', icon: 'menu_book' });
            }
        } else if (d.type === 'MSG') {
            if (this.app.ui) this.app.ui.showToast(String(d.payload));
        } else if (d.type === 'SYNC_BATCH') {
            const username = d.payload.username, avatar = d.payload.avatar, shortId = d.payload.shortId, observations = d.payload.observations;
            if (!this.sessionData[shortId]) {
                this.sessionData[shortId] = { username: username, avatar: avatar, shortId: shortId, observations: [], lastSeen: new Date().toISOString() };
            }
            this.sessionData[shortId].observations = (this.sessionData[shortId].observations || []).concat(observations);
            this.sessionData[shortId].lastSeen = new Date().toISOString();
            if (this.app.ui) {
                this.app.ui.showToast('Synced ' + observations.length + ' obs from ' + username + '!');
                this.addToFeed({ type: 'sync', user: username, item: observations.length + ' observations', icon: 'sync' });
            }
            this.updateSessionDashboard();
        }
    },
    broadcast(d, exclude) {
        this.connections.forEach(c => { if (c.peer !== exclude && c.open) c.send(d); });
    },
    broadcastPos() {
        if (!this.peer || !this.peer.id || !this.app.map || !this.app.map.pos || !this.app.map.pos.lat) return;
        const p = { id: this.peer.id, shortId: this.myId, lat: this.app.map.pos.lat, lng: this.app.map.pos.lng, avatar: this.app.state.avatar, username: this.app.state.username };
        const d = { type: 'POS', payload: p };
        if (this.hostConnection && this.hostConnection.open) this.hostConnection.send(d);
        else this.broadcast(d);
        if (this.app.map) this.app.map.updatePlayer(p);
    },
    broadcastSighting(payload) {
        const d = { type: 'SIGHTING', payload: payload };
        if (this.hostConnection && this.hostConnection.open) this.hostConnection.send(d);
        else this.broadcast(d);
    },

    // Sync queue
    drainSyncQueue() {
        const q = this.app.state.syncQueue || [];
        if (q.length === 0) return;
        const payload = { username: this.app.state.username, avatar: this.app.state.avatar, shortId: this.myId, observations: q };
        const msg = { type: 'SYNC_BATCH', payload: payload };
        if (this.hostConnection && this.hostConnection.open) this.hostConnection.send(msg);
        else this.broadcast(msg);
        this.app.state.syncQueue = [];
        this.app.state.lastSyncAt = new Date().toISOString();
        this.app.saveState();
    },
    syncWithFriend(friendCode) {
        const norm = this._normalizeCode(friendCode);
        const conn = this._presenceConns[norm] || this.connections.find(c => c.peer === 'EDE8-' + norm);
        if (!conn || !conn.open) { if (this.app.ui) this.app.ui.showToast('Friend not connected'); return; }
        const q = this.app.state.syncQueue || [];
        if (q.length === 0) { if (this.app.ui) this.app.ui.showToast('Nothing to sync'); return; }
        conn.send({ type: 'SYNC_BATCH', payload: { username: this.app.state.username, avatar: this.app.state.avatar, shortId: this.myId, observations: q } });
        this.app.state.syncQueue = [];
        this.app.state.lastSyncAt = new Date().toISOString();
        this.app.saveState();
        if (this.app.ui) this.app.ui.showToast('Synced with friend!');
    },

    // Friends management
    loadFriends() {
        try {
            const ls = (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') ? localStorage : null;
            const raw = ls ? ls.getItem('EDE_Friends') : null;
            this.friends = raw ? JSON.parse(raw) : {};
        } catch (e) { this.friends = {}; }
    },
    saveFriend(code, nickname) {
        const norm = this._normalizeCode(code);
        if (norm.length < 4) return;
        this.friends[norm] = { code: norm, nickname: nickname || this._displayCode(norm), lastSeen: new Date().toISOString() };
        this._persistFriends();
        if (norm.length === 8) this._probeOne(norm);
        this._renderSavedFriends();
    },
    removeFriend(code) {
        const norm = this._normalizeCode(code);
        delete this.friends[norm];
        delete this._friendOnlineStatus[norm];
        if (this._presenceConns[norm]) { try { this._presenceConns[norm].close(); } catch (e) {} delete this._presenceConns[norm]; }
        this._persistFriends();
        this._renderSavedFriends();
    },
    _persistFriends() {
        try {
            if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
                localStorage.setItem('EDE_Friends', JSON.stringify(this.friends));
            }
        } catch (e) {}
    },

    // Party UI
    switchPartyTab(tab) {
        document.querySelectorAll('.party-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        ['connect', 'friends', 'session'].forEach(t => {
            const el = document.getElementById('party-tab-' + t);
            if (el) el.classList.toggle('hidden', t !== tab);
        });
    },
    renderPartyPanel() {
        const badge = document.getElementById('sync-pending-badge');
        const qLen = (this.app && this.app.state && this.app.state.syncQueue) ? this.app.state.syncQueue.length : 0;
        if (badge) { badge.textContent = qLen + ' pending'; badge.classList.toggle('hidden', qLen === 0); }
        const lastCode = this._getLastPartyCode();
        const rejoinBtn = document.getElementById('rejoin-party-btn');
        if (rejoinBtn) {
            if (lastCode && lastCode.length === 8) {
                rejoinBtn.classList.remove('hidden');
                rejoinBtn.textContent = '\u21A9 Rejoin: ' + this._displayCode(lastCode);
                rejoinBtn.onclick = () => {
                    const inp = document.getElementById('target-peer-id');
                    if (inp) inp.value = this._displayCode(lastCode);
                    this.joinParty();
                };
            } else {
                rejoinBtn.classList.add('hidden');
            }
        }
        this._renderSavedFriends();
        this.updateSessionDashboard();
        this.updateList();
    },
    updateUI() {
        const active = !!(this.hostConnection || this.connections.length > 0);
        const hostCtr = document.getElementById('host-controls');
        const connCtr = document.getElementById('connected-controls');
        if (hostCtr) hostCtr.classList.toggle('hidden', active);
        if (connCtr) connCtr.classList.toggle('hidden', !active);
        const hudBadge = document.getElementById('hud-party-badge');
        if (hudBadge) hudBadge.classList.toggle('hidden', !active);
        const total = Object.keys(this.friendsData).length + 1;
        const playerCount = document.getElementById('player-count');
        if (playerCount) playerCount.innerText = total;
        const badgeCount = document.getElementById('player-count-badge');
        if (badgeCount) badgeCount.innerText = total + ' Online';
    },
    updateList() {
        const el = document.getElementById('friends-list');
        if (!el) return;
        if (Object.keys(this.friendsData).length === 0) {
            el.innerHTML = '<div class="text-center text-gray-400 py-8 italic bg-gray-50 dark:bg-gray-800/50 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">Connect to see nearby explorers</div>';
            return;
        }
        el.innerHTML = Object.values(this.friendsData).map(f => {
            const h = this.connectionHealth[f.id] || {};
            const dotColor = h.status === 'degraded' ? 'bg-amber-400' : h.status === 'disconnected' ? 'bg-red-400' : 'bg-green-400';
            const latencyStr = (h.latency != null) ? (h.latency + 'ms \xB7 ') : '';
            return '<div class="bg-white dark:bg-gray-800 p-4 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between">'
                + '<div class="flex items-center gap-3">'
                + '<div class="relative">'
                + '<div class="w-12 h-12 bg-brand-light dark:bg-brand-dark/30 rounded-full flex items-center justify-center text-2xl">' + (f.avatar || '\uD83C\uDF3F') + '</div>'
                + '<div class="absolute bottom-0 right-0 w-3.5 h-3.5 ' + dotColor + ' rounded-full border-2 border-white dark:border-gray-800"></div>'
                + '</div>'
                + '<div>'
                + '<div class="font-black text-gray-900 dark:text-white">' + f.username + '</div>'
                + '<div class="text-[10px] font-bold text-green-500 uppercase tracking-widest">' + latencyStr + 'Active</div>'
                + '</div></div>'
                + '<button onclick="app.multiplayer.sendGift(\'' + f.id + '\', \'nature\')" class="w-10 h-10 rounded-xl bg-brand-light text-brand flex items-center justify-center active:scale-90 transition-transform">'
                + '<span class="material-symbols-rounded">card_giftcard</span></button></div>';
        }).join('');
    },
    updatePresenceUI() {
        const el = document.getElementById('saved-friends-list');
        if (el) this._renderSavedFriends();
    },
    _renderSavedFriends() {
        const el = document.getElementById('saved-friends-list');
        if (!el) return;
        const entries = Object.values(this.friends);
        if (entries.length === 0) {
            el.innerHTML = '<p class="text-xs text-gray-400 italic text-center py-4">No saved friends yet. Add a friend\'s code below!</p>';
            return;
        }
        const self = this;
        el.innerHTML = entries.map(f => {
            const status = self._friendOnlineStatus[f.code] || 'offline';
            const dotColor = status === 'online' ? 'bg-green-400' : status === 'checking' ? 'bg-amber-400 animate-pulse' : 'bg-gray-300 dark:bg-gray-600';
            const statusLabel = status === 'online' ? '<span class="text-green-500 font-bold text-[10px]">\u25CF Online</span>'
                : status === 'checking' ? '<span class="text-amber-500 font-bold text-[10px]">\u25CF Checking\u2026</span>'
                : '<span class="text-gray-400 font-bold text-[10px]">\u25CF Offline</span>';
            const displayCode = self._displayCode(f.code);
            const connectBtn = status === 'online'
                ? '<button onclick="(function(){var i=document.getElementById(\'target-peer-id\');if(i)i.value=\'' + displayCode + '\';app.multiplayer.switchPartyTab(\'connect\');app.multiplayer.joinParty();})()" class="px-2 py-1.5 bg-brand text-white text-xs font-bold rounded-xl active:scale-95">Connect</button>'
                : '<button onclick="(function(){var i=document.getElementById(\'target-peer-id\');if(i)i.value=\'' + displayCode + '\';app.multiplayer.switchPartyTab(\'connect\');})()" class="px-2 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-xl active:scale-95">Code \u2197</button>';
            return '<div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">'
                + '<div class="flex items-center gap-2">'
                + '<div class="w-2.5 h-2.5 rounded-full ' + dotColor + ' shrink-0"></div>'
                + '<div>'
                + '<div class="font-black text-sm text-gray-900 dark:text-white">' + (f.nickname || displayCode) + '</div>'
                + '<div class="flex items-center gap-1.5">' + statusLabel + '<span class="text-[10px] text-gray-400 font-mono">' + displayCode + '</span></div>'
                + '</div></div>'
                + '<div class="flex gap-1.5 shrink-0">'
                + connectBtn
                + '<button onclick="app.multiplayer.removeFriend(\'' + f.code + '\')" class="px-2 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-500 text-xs font-bold rounded-xl active:scale-95">\u2715</button>'
                + '</div></div>';
        }).join('');
    },

    // Session dashboard
    updateSessionDashboard() {
        const el = document.getElementById('session-dashboard');
        if (!el) return;
        const explorers = Object.values(this.sessionData);
        if (explorers.length === 0) {
            el.innerHTML = '<p class="text-xs text-gray-400 italic text-center py-8">No session data yet. Connect with others and sync observations to see results here.</p>';
            return;
        }
        const totalObs = explorers.reduce(function(sum, e) { return sum + ((e.observations && e.observations.length) || 0); }, 0);
        const allSpp = Array.from(new Set(explorers.reduce(function(acc, e) {
            return acc.concat((e.observations || []).map(function(o) { return o.speciesName; }).filter(Boolean));
        }, [])));
        let html = '<div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 space-y-1 mb-4">'
            + '<div class="flex justify-between text-sm"><span class="text-gray-500 font-bold">Explorers</span><span class="font-black text-gray-900 dark:text-white">' + explorers.length + '</span></div>'
            + '<div class="flex justify-between text-sm"><span class="text-gray-500 font-bold">Total Obs</span><span class="font-black text-gray-900 dark:text-white">' + totalObs + '</span></div>'
            + '<div class="flex justify-between text-sm"><span class="text-gray-500 font-bold">Unique Species</span><span class="font-black text-brand">' + allSpp.length + '</span></div>'
            + '</div>';
        const self = this;
        html += '<div class="space-y-2 mb-4">' + explorers.map(function(ex) {
            const spp = Array.from(new Set((ex.observations || []).map(function(o) { return o.speciesName; }).filter(Boolean)));
            const h = self.connectionHealth['EDE8-' + ex.shortId] || {};
            const dot = h.status === 'connected' ? 'bg-green-400' : h.status === 'degraded' ? 'bg-amber-400' : 'bg-gray-300';
            return '<div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">'
                + '<div class="flex items-center gap-2"><div class="relative shrink-0"><span class="text-xl">' + (ex.avatar || '\uD83C\uDF3F') + '</span>'
                + '<div class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ' + dot + ' border border-white dark:border-gray-800"></div></div>'
                + '<div><div class="font-black text-sm dark:text-white">' + ex.username + '</div>'
                + '<div class="text-[10px] text-gray-400">' + (ex.observations ? ex.observations.length : 0) + ' obs \xB7 ' + spp.length + ' spp</div></div></div>'
                + '<div class="text-[10px] font-mono text-gray-400 shrink-0">' + self._displayCode(ex.shortId) + '</div></div>';
        }).join('') + '</div>';
        if (allSpp.length > 0) {
            html += '<div class="bg-brand/10 rounded-2xl p-3 mb-4"><div class="text-xs font-black uppercase tracking-widest text-brand mb-2">Species Found</div>'
                + '<div class="flex flex-wrap gap-1.5">' + allSpp.map(function(s) { return '<span class="bg-white dark:bg-gray-800 text-xs font-bold px-2 py-1 rounded-lg border border-gray-100 dark:border-gray-700">' + s + '</span>'; }).join('') + '</div></div>';
        }
        html += '<button onclick="app.multiplayer.exportSession()" class="w-full bg-brand text-white py-3 rounded-2xl font-bold active:scale-95 shadow-md">\uD83D\uDCCB Export Session</button>';
        el.innerHTML = html;
    },
    exportSession() {
        const lines = ['=== Earth Day Everyday \u2014 Session Export ===', 'Date: ' + new Date().toLocaleDateString(), ''];
        const self = this;
        Object.values(this.sessionData).forEach(function(e) {
            lines.push('Explorer: ' + (e.avatar || '\uD83C\uDF3F') + ' ' + e.username + ' (' + self._displayCode(e.shortId) + ')');
            lines.push('  Observations: ' + e.observations.length);
            const spp = Array.from(new Set(e.observations.map(function(o) { return o.speciesName; }).filter(Boolean)));
            lines.push('  Species: ' + spp.join(', '));
            lines.push('');
        });
        const allSpp = Array.from(new Set(Object.values(this.sessionData).reduce(function(acc, e) {
            return acc.concat(e.observations.map(function(o) { return o.speciesName; }).filter(Boolean));
        }, [])));
        lines.push('TOTAL SPECIES FOUND: ' + allSpp.length);
        lines.push(allSpp.join(', '));
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(lines.join('\n')).then(() => { if (this.app.ui) this.app.ui.showToast('Session exported!'); });
        }
    },

    // Feed
    addToFeed(entry) {
        this.socialFeed.unshift(Object.assign({}, entry, { time: new Date() }));
        if (this.socialFeed.length > 10) this.socialFeed.pop();
        this.updateFeedUI();
    },
    updateFeedUI() {
        const el = document.getElementById('social-feed');
        if (!el) return;
        if (this.socialFeed.length === 0) {
            el.innerHTML = '<div class="bg-white dark:bg-surface-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center gap-3">'
                + '<div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><span class="material-symbols-rounded text-sm text-gray-400">rss_feed</span></div>'
                + '<p class="text-xs text-gray-500 font-medium italic">No activity yet. Go find some nature!</p></div>';
            return;
        }
        el.innerHTML = this.socialFeed.map(function(f) {
            const verb = f.type === 'gift' ? ' sent a gift:' : f.type === 'sync' ? ' synced' : ' spotted a';
            return '<div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-50 dark:border-gray-700/50 flex items-center gap-3">'
                + '<div class="w-8 h-8 rounded-full bg-brand-light dark:bg-brand-dark/20 text-brand flex items-center justify-center">'
                + '<span class="material-symbols-rounded text-sm">' + f.icon + '</span></div>'
                + '<div class="flex-1"><p class="text-[11px] leading-tight dark:text-gray-300">'
                + '<span class="font-black text-gray-900 dark:text-white">' + f.user + '</span>'
                + verb + ' <span class="font-bold text-brand">' + f.item + '</span></p>'
                + '<p class="text-[9px] text-gray-400 font-bold uppercase mt-0.5">' + f.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</p>'
                + '</div></div>';
        }).join('');
    },

    // Messaging
    sendGift(toId, type) {
        const payload = { from: this.app.state.username, giftType: type, giftName: 'Nature Gift', amount: 0 };
        const conn = this.connections.find(c => c.peer === toId) || this.hostConnection;
        if (conn && conn.open) conn.send({ type: 'GIFT', payload: payload });
        this.app.state._sentGift = true;
        this.app.data.checkBadges(this.app.state);
        this.app.saveState();
        if (this.app.ui) {
            this.app.ui.showToast('Gift sent! \uD83C\uDF81');
            this.addToFeed({ type: 'gift', user: 'You', item: payload.giftName, icon: 'card_giftcard' });
        }
    },
    broadcastJournalShare(obs) {
        const d = { type: 'JOURNAL_SHARE', payload: { username: this.app.state.username, obs: obs } };
        if (this.hostConnection && this.hostConnection.open) this.hostConnection.send(d);
        else this.broadcast(d);
    },
    updateAdminTable() {
        const tbody = document.getElementById('admin-players-table');
        if (!tbody) return;
        const friends = Object.values(this.friendsData);
        if (friends.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-4 text-center text-gray-400 italic">No players connected</td></tr>';
            return;
        }
        tbody.innerHTML = friends.map(function(f) {
            return '<tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">'
                + '<td class="px-4 py-3 font-semibold dark:text-white flex items-center gap-2"><span class="text-lg">' + f.avatar + '</span> ' + f.username + '</td>'
                + '<td class="px-4 py-3 text-gray-500 font-mono text-xs">' + (f.lat ? f.lat.toFixed(4) : '?') + ', ' + (f.lng ? f.lng.toFixed(4) : '?') + '</td>'
                + '<td class="px-4 py-3"><span class="bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">Active</span></td>'
                + '</tr>';
        }).join('');
    }
};
