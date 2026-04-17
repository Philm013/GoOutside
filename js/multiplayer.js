export const multiplayer = {
    peer: null, myId: null, connections: [], hostConnection: null, friendsData: {},
    init(app) {
        this.app = app;
        this.myId = Math.random().toString(36).substring(2, 6).toUpperCase();
        if (typeof Peer !== 'undefined') {
            this.peer = new Peer(`NQ24-${this.myId}`);
            this.peer.on('open', () => {
                const el = document.getElementById('my-peer-id');
                if (el) el.innerText = this.myId;
            });
            this.peer.on('connection', conn => this.handleConn(conn));
        }
    },
    copyId() {
        navigator.clipboard.writeText(this.myId).then(() => {
            if (this.app.ui) this.app.ui.showToast("Code Copied!");
        });
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
            if (this.app.ui) {
                this.app.ui.showToast("Connected!");
                this.updateUI();
            }
            this.broadcastPos();
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
                if (d.payload.giftType === 'seeds') {
                    this.app.state.seeds += d.payload.amount;
                    this.app.ui.renderProfile();
                }
                this.app.saveState();
            }
        } else if (d.type === 'MSG') {
            if (this.app.ui) this.app.ui.showToast(`HOST: ${d.payload}`);
        } else if (d.type === 'LURE') {
            if (this.app.map) this.app.map.spawnLure(d.payload.lat, d.payload.lng);
            if (this.app.ui) this.app.ui.showToast(`A Party Lure was dropped nearby!`);
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
        if (this.app.state.seeds < 10) {
            this.app.ui.showToast("Need 🌰 10 to send a gift!");
            return;
        }
        this.app.state.seeds -= 10;
        this.app.ui.renderProfile();
        this.app.saveState();
        
        const payload = { 
            from: this.app.state.username, 
            giftType: type, 
            giftName: type === 'seeds' ? '10 Seeds' : 'Mystery Lure',
            amount: 10
        };
        
        const d = { type: 'GIFT', payload };
        const conn = this.connections.find(c => c.peer === toId) || this.hostConnection;
        if (conn) conn.send(d);
        
        this.app.ui.showToast(`Gift sent! 🎁`);
        this.addToFeed({ type: 'gift', user: 'You', item: payload.giftName, icon: 'card_giftcard' });
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
    },
    spawnPartyLure() {
        if (!this.app.map.pos.lat) return;
        const payload = { lat: this.app.map.pos.lat, lng: this.app.map.pos.lng };
        this.broadcast({ type: 'LURE', payload });
        if (this.app.map) this.app.map.spawnLure(payload.lat, payload.lng);
        if (this.app.ui) this.app.ui.showToast("Party Lure Dropped!");
    },
    broadcastMessagePrompt() {
        const msg = prompt("Enter announcement message:");
        if (msg) {
            this.broadcast({ type: 'MSG', payload: msg });
            if (this.app.ui) this.app.ui.showToast(`Sent: ${msg}`);
        }
    }
};
