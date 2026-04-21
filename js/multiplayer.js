export const multiplayer = {
    peer: null, myId: null, connections: [], hostConnection: null, friendsData: {},
    friends: {}, sessionData: {},
    init(app) {
        this.app = app;
        // Persistent explorer code
        const ls = (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') ? localStorage : null;
        const saved = ls ? ls.getItem('EDE_MyCode') : null;
        if (saved && /^[A-Z0-9]{4}$/.test(saved)) {
            this.myId = saved;
        } else {
            this.myId = Math.random().toString(36).substring(2, 6).toUpperCase();
            if (ls) ls.setItem('EDE_MyCode', this.myId);
        }
        this.loadFriends();
        if (typeof Peer !== 'undefined') {
            this.peer = new Peer(`NQ24-${this.myId}`);
            this.peer.on('open', () => {
                const el = document.getElementById('my-peer-id');
                if (el) el.innerText = this.myId;
                this._posInterval = setInterval(() => this.broadcastPos(), 5000);
            });
            this.peer.on('connection', conn => this.handleConn(conn));
        }
    },
    copyId() {
        navigator.clipboard.writeText(this.myId).then(() => {
            if (this.app.ui) this.app.ui.showToast("Code Copied!");
        });
    },
    loadFriends() {
        try {
            const ls = (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') ? localStorage : null;
            const raw = ls ? ls.getItem('EDE_Friends') : null;
            this.friends = raw ? JSON.parse(raw) : {};
        } catch (e) {
            this.friends = {};
        }
    },
    saveFriend(code, nickname) {
        this.friends[code] = { code, nickname, lastSeen: new Date().toISOString() };
        this._persistFriends();
    },
    removeFriend(code) {
        delete this.friends[code];
        this._persistFriends();
    },
    _persistFriends() {
        if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
            localStorage.setItem('EDE_Friends', JSON.stringify(this.friends));
        }
    },
    joinParty() {
        const codeInput = document.getElementById('target-peer-id');
        const code = codeInput ? codeInput.value.trim().toUpperCase() : "";
        if (code.length !== 4) {
            if (this.app.ui) this.app.ui.showToast("Invalid Code");
            return;
        }
        const conn = this.peer.connect(`NQ24-${code}`);
        conn.on('open', () => {
            this.hostConnection = conn;
            if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') localStorage.setItem('EDE_LastParty', code);
            this.app.state._joinedParty = true;
            this.app.data.checkBadges(this.app.state);
            this.app.saveState();
            if (this.app.ui) {
                this.app.ui.showToast("Connected!");
                this.updateUI();
            }
            this._posInterval = setInterval(() => this.broadcastPos(), 5000);
            this.broadcastPos();
            this.drainSyncQueue();
        });
        conn.on('data', d => this.handleData(d));
        conn.on('close', () => {
            this.hostConnection = null;
            this.updateUI();
            if (this.app.map) this.app.map.clearPlayers();
            if (this.app.ui) this.app.ui.showToast("Disconnected");
        });
    },
    disconnect() {
        clearInterval(this._posInterval);
        this._posInterval = null;
        if (this.hostConnection) this.hostConnection.close();
        this.connections.forEach(c => c.close());
        this.hostConnection = null;
        this.connections = [];
        if (this.app.map) this.app.map.clearPlayers();
        this.updateUI();
    },
    handleConn(conn) {
        this.connections.push(conn);
        conn.on('data', d => {
            if (!this.hostConnection) this.broadcast(d, conn.peer);
            this.handleData(d);
        });
        conn.on('close', () => {
            this.connections = this.connections.filter(c => c.peer !== conn.peer);
            if (this.app.map) this.app.map.removePlayer(conn.peer);
            this.updateList();
            this.updateUI();
        });
        this.updateUI();
    },
    handleData(d) {
        if (d.type === 'POS') {
            if (this.app.map) this.app.map.updatePlayer(d.payload);
            this.friendsData[d.payload.id] = d.payload;
            this.updateList();
            this.updateAdminTable();
        } else if (d.type === 'SIGHTING') {
            // Drop global marker
            if (this.app.map) this.app.map.addGlobalSighting(d.payload);
            if (this.app.ui) {
                this.app.ui.showToast(`${d.payload.username} found a ${d.payload.speciesName}!`);
                this.addToFeed({ type: 'sighting', user: d.payload.username, item: d.payload.speciesName, icon: 'visibility' });
            }
        } else if (d.type === 'GIFT') {
            if (this.app.ui) {
                this.app.ui.showToast(`${d.payload.from} sent you a gift! 🎁`);
                this.addToFeed({ type: 'gift', user: d.payload.from, item: d.payload.giftName, icon: 'card_giftcard' });
                this.app.saveState();
            }
        } else if (d.type === 'JOURNAL_SHARE') {
            if (this.app.ui) {
                this.app.ui.showToast(`${d.payload.username} shared a journal entry!`);
                this.addToFeed({ type: 'journal', user: d.payload.username, item: d.payload.obs?.speciesName || 'observation', icon: 'menu_book' });
            }
        } else if (d.type === 'MSG') {
            if (this.app.ui) this.app.ui.showToast(`HOST: ${d.payload}`);
        } else if (d.type === 'SYNC_BATCH') {
            const { username, avatar, shortId, observations } = d.payload;
            if (!this.sessionData[shortId]) this.sessionData[shortId] = { username, avatar, shortId, observations: [], lastSeen: new Date().toISOString() };
            this.sessionData[shortId].observations = [...(this.sessionData[shortId].observations || []), ...observations];
            this.sessionData[shortId].lastSeen = new Date().toISOString();
            if (this.app.ui) {
                this.app.ui.showToast(`Synced ${observations.length} obs from ${username}!`);
                this.addToFeed({ type: 'sync', user: username, item: `${observations.length} observations`, icon: 'sync' });
            }
            this.updateSessionDashboard();
        }
    },
    broadcast(d, exclude) {
        this.connections.forEach(c => {
            if (c.peer !== exclude && c.open) c.send(d);
        });
    },
    broadcastPos() {
        if (!this.peer?.id || !this.app.map.pos.lat) return;
        const p = {
            id: this.peer.id,
            shortId: this.myId,
            lat: this.app.map.pos.lat,
            lng: this.app.map.pos.lng,
            avatar: this.app.state.avatar,
            username: this.app.state.username
        };
        const d = { type: 'POS', payload: p };
        if (this.hostConnection) {
            this.hostConnection.send(d);
        } else {
            this.broadcast(d);
        }
        if (this.app.map) this.app.map.updatePlayer(p);
    },
    broadcastSighting(payload) {
        const d = { type: 'SIGHTING', payload };
        if (this.hostConnection) this.hostConnection.send(d);
        else this.broadcast(d);
    },
    updateUI() {
        const active = this.hostConnection || this.connections.length > 0;
        const hostCtr = document.getElementById('host-controls');
        const connCtr = document.getElementById('connected-controls');
        if (hostCtr) hostCtr.classList.toggle('hidden', active);
        if (connCtr) connCtr.classList.toggle('hidden', !active);

        // Top-bar party presence badge
        const hudBadge = document.getElementById('hud-party-badge');
        if (hudBadge) hudBadge.classList.toggle('hidden', !active);
        
        const playerCount = document.getElementById('player-count');
        const badgeCount = document.getElementById('player-count-badge');
        const total = Object.keys(this.friendsData).length + 1;
        if (playerCount) playerCount.innerText = total;
        if (badgeCount) badgeCount.innerText = `${total} Online`;

        // Admin Hub button visibility - show if we have an ID (we are a potential host)
        const adminBtn = document.getElementById('btn-admin-hub');
        if (adminBtn) {
            if (this.myId) adminBtn.classList.remove('hidden');
            else adminBtn.classList.add('hidden');
        }

        const adminTotal = document.getElementById('admin-total-players');
        if (adminTotal) adminTotal.innerText = total;
    },
    updateList() {
        const el = document.getElementById('friends-list');
        if (!el) return;
        if (Object.keys(this.friendsData).length === 0) {
            el.innerHTML = '<div class="text-center text-gray-400 py-8 italic bg-gray-50 dark:bg-gray-800/50 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">Searching for friends...</div>';
            return;
        }
        el.innerHTML = Object.values(this.friendsData).map(f => `
            <div class="bg-white dark:bg-gray-800 p-4 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 bg-brand-light dark:bg-brand-dark/30 rounded-full flex items-center justify-center text-2xl shadow-inner">${f.avatar}</div>
                    <div>
                        <div class="font-black text-gray-900 dark:text-white">${f.username}</div>
                        <div class="text-[10px] font-bold text-green-500 uppercase tracking-widest">Nearby</div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="app.multiplayer.sendGift('${f.id}', 'seeds')" class="w-10 h-10 rounded-xl bg-brand-light text-brand flex items-center justify-center active:scale-90 transition-transform">
                        <span class="material-symbols-rounded">card_giftcard</span>
                    </button>
                </div>
            </div>`).join('');
    },
    drainSyncQueue() {
        const q = this.app.state.syncQueue || [];
        if (q.length === 0) return;
        const payload = { username: this.app.state.username, avatar: this.app.state.avatar, shortId: this.myId, observations: q };
        const msg = { type: 'SYNC_BATCH', payload };
        if (this.hostConnection) this.hostConnection.send(msg);
        else this.broadcast(msg);
        this.app.state.syncQueue = [];
        this.app.state.lastSyncAt = new Date().toISOString();
        this.app.saveState();
    },
    switchPartyTab(tab) {
        document.querySelectorAll('.party-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        ['connect', 'friends', 'session'].forEach(t => {
            const el = document.getElementById(`party-tab-${t}`);
            if (el) el.classList.toggle('hidden', t !== tab);
        });
    },
    renderPartyPanel() {
        // Sync pending badge
        const badge = document.getElementById('sync-pending-badge');
        const qLen = this.app?.state?.syncQueue?.length || 0;
        if (badge) {
            badge.textContent = `${qLen} pending`;
            badge.classList.toggle('hidden', qLen === 0);
        }
        // Rejoin button
        const lastParty = (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') ? localStorage.getItem('EDE_LastParty') : null;
        const rejoinBtn = document.getElementById('rejoin-party-btn');
        if (rejoinBtn) {
            if (lastParty) {
                rejoinBtn.classList.remove('hidden');
                rejoinBtn.textContent = `↩ Rejoin: ${lastParty}`;
                rejoinBtn.onclick = () => {
                    const inp = document.getElementById('target-peer-id');
                    if (inp) inp.value = lastParty;
                    this.joinParty();
                };
            } else {
                rejoinBtn.classList.add('hidden');
            }
        }
        // Render saved friends tab
        this._renderSavedFriends();
        // Render session dashboard
        this.updateSessionDashboard();
    },
    _renderSavedFriends() {
        const el = document.getElementById('saved-friends-list');
        if (!el) return;
        const entries = Object.values(this.friends);
        if (entries.length === 0) {
            el.innerHTML = '<p class="text-xs text-gray-400 italic text-center py-4">No saved friends yet. Connect with someone to save them!</p>';
            return;
        }
        el.innerHTML = entries.map(f => `
            <div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                <div>
                    <div class="font-black text-sm text-gray-900 dark:text-white">${f.nickname || f.code}</div>
                    <div class="text-[10px] text-gray-400 font-mono">${f.code}</div>
                </div>
                <div class="flex gap-2 shrink-0">
                    <button onclick="(()=>{const i=document.getElementById('target-peer-id');if(i)i.value='${f.code}';app.multiplayer.switchPartyTab('connect');})()" class="px-3 py-1.5 bg-brand text-white text-xs font-bold rounded-xl active:scale-95">Connect</button>
                    <button onclick="app.multiplayer.removeFriend('${f.code}');app.multiplayer._renderSavedFriends();" class="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-500 text-xs font-bold rounded-xl active:scale-95">Remove</button>
                </div>
            </div>`).join('');
    },
    updateSessionDashboard() {
        const el = document.getElementById('session-dashboard');
        if (!el) return;
        const explorers = Object.values(this.sessionData);
        if (explorers.length === 0) {
            el.innerHTML = '<p class="text-xs text-gray-400 italic text-center py-8">No session data yet. Host a party and have explorers join to see their observations here.</p>';
            return;
        }
        const totalObs = explorers.reduce((sum, e) => sum + (e.observations?.length || 0), 0);
        const allSpp = [...new Set(explorers.flatMap(e => (e.observations || []).map(o => o.speciesName).filter(Boolean)))];
        let html = `<div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 space-y-1 mb-4">
            <div class="flex justify-between text-sm"><span class="text-gray-500 font-bold">Explorers</span><span class="font-black text-gray-900 dark:text-white">${explorers.length}</span></div>
            <div class="flex justify-between text-sm"><span class="text-gray-500 font-bold">Total Observations</span><span class="font-black text-gray-900 dark:text-white">${totalObs}</span></div>
            <div class="flex justify-between text-sm"><span class="text-gray-500 font-bold">Unique Species</span><span class="font-black text-brand">${allSpp.length}</span></div>
        </div>`;
        html += '<div class="space-y-2 mb-4">' + explorers.map(ex => {
            const spp = [...new Set((ex.observations || []).map(o => o.speciesName).filter(Boolean))];
            return `<div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                <div class="flex items-center gap-2"><span class="text-xl">${ex.avatar || '🌿'}</span>
                    <div><div class="font-black text-sm dark:text-white">${ex.username}</div>
                    <div class="text-[10px] text-gray-400">${ex.observations?.length || 0} obs · ${spp.length} spp</div></div>
                </div></div>`;
        }).join('') + '</div>';
        if (allSpp.length > 0) {
            html += `<div class="bg-brand/10 rounded-2xl p-3"><div class="text-xs font-black uppercase tracking-widest text-brand mb-2">Species Found</div>
                <div class="flex flex-wrap gap-1.5">${allSpp.map(s => `<span class="bg-white dark:bg-gray-800 text-xs font-bold px-2 py-1 rounded-lg border border-gray-100 dark:border-gray-700">${s}</span>`).join('')}</div></div>`;
        }
        html += `<button onclick="app.multiplayer.exportSession()" class="w-full mt-4 bg-brand text-white py-3 rounded-2xl font-bold active:scale-95 shadow-md">Export Session</button>`;
        el.innerHTML = html;
    },
    exportSession() {
        const lines = ['=== Earth Day Everyday — Session Export ===', `Date: ${new Date().toLocaleDateString()}`, ''];
        Object.values(this.sessionData).forEach(explorer => {
            lines.push(`Explorer: ${explorer.avatar || '🌿'} ${explorer.username} (${explorer.shortId})`);
            lines.push(`  Observations: ${explorer.observations.length}`);
            const spp = [...new Set(explorer.observations.map(o => o.speciesName).filter(Boolean))];
            lines.push(`  Species: ${spp.join(', ')}`);
            lines.push('');
        });
        const allSpp = [...new Set(Object.values(this.sessionData).flatMap(e => e.observations.map(o => o.speciesName).filter(Boolean)))];
        lines.push(`TOTAL SPECIES FOUND: ${allSpp.length}`);
        lines.push(allSpp.join(', '));
        const text = lines.join('\n');
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => { if (this.app.ui) this.app.ui.showToast('Session exported!'); });
        }
    },
    socialFeed: [],
    addToFeed(entry) {
        this.socialFeed.unshift({ ...entry, time: new Date() });
        if (this.socialFeed.length > 10) this.socialFeed.pop();
        this.updateFeedUI();
    },
    updateFeedUI() {
        const el = document.getElementById('social-feed');
        if (!el) return;
        if (this.socialFeed.length === 0) {
            el.innerHTML = `<div class="bg-white dark:bg-surface-dark p-4 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><span class="material-symbols-rounded text-sm text-gray-400">rss_feed</span></div>
                <p class="text-xs text-gray-500 font-medium italic">No activity yet. Go find some nature!</p>
            </div>`;
            return;
        }
        el.innerHTML = this.socialFeed.map(f => `
            <div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-50 dark:border-gray-700/50 flex items-center gap-3 animate-in slide-in-from-right duration-300">
                <div class="w-8 h-8 rounded-full bg-brand-light dark:bg-brand-dark/20 text-brand flex items-center justify-center">
                    <span class="material-symbols-rounded text-sm">${f.icon}</span>
                </div>
                <div class="flex-1">
                    <p class="text-[11px] leading-tight dark:text-gray-300">
                        <span class="font-black text-gray-900 dark:text-white">${f.user}</span> 
                        ${f.type === 'gift' ? 'sent a gift:' : 'spotted a'} 
                        <span class="font-bold text-brand">${f.item}</span>
                    </p>
                    <p class="text-[9px] text-gray-400 font-bold uppercase mt-0.5">${f.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
            </div>
        `).join('');
    },
    sendGift(toId, type) {
        const payload = { 
            from: this.app.state.username, 
            giftType: type, 
            giftName: type === 'seeds' ? 'Nature Gift' : 'Mystery Gift',
            amount: 10
        };
        
        const d = { type: 'GIFT', payload };
        const conn = this.connections.find(c => c.peer === toId) || this.hostConnection;
        if (conn) conn.send(d);

        this.app.state._sentGift = true;
        this.app.data.checkBadges(this.app.state);
        this.app.saveState();
        
        if (this.app.ui) {
            this.app.ui.showToast(`Gift sent! 🎁`);
            this.addToFeed({ type: 'gift', user: 'You', item: payload.giftName, icon: 'card_giftcard' });
        }
    },
    broadcastJournalShare(obs) {
        const d = { type: 'JOURNAL_SHARE', payload: { username: this.app.state.username, obs } };
        if (this.hostConnection) this.hostConnection.send(d);
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
        tbody.innerHTML = friends.map(f => `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <td class="px-4 py-3 font-semibold dark:text-white flex items-center gap-2"><span class="text-lg">${f.avatar}</span> ${f.username}</td>
                <td class="px-4 py-3 text-gray-500 font-mono text-xs">${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}</td>
                <td class="px-4 py-3"><span class="bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">Active</span></td>
            </tr>
        `).join('');
    }
};
