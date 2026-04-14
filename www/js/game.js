export const game = {
    init(app) {
        this.app = app;
    },
    addEntry() {
        const list = document.getElementById('log-entries');
        if (!list) return;
        
        const div = document.createElement('div');
        div.className = "flex gap-2 items-center bg-gray-50 dark:bg-gray-800/50 p-2 rounded-2xl border border-gray-100 dark:border-gray-700";
        
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = "flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 font-bold p-3 rounded-xl text-sm text-center active:scale-95 transition-transform truncate";
        btn.innerText = "Select Species";
        btn.onclick = () => this.app.ui.openSpeciesSelector(btn);
        
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.value = '1';
        qtyInput.min = '1';
        qtyInput.className = "w-14 text-center font-black text-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2 dark:text-white outline-none focus:ring-2 focus:ring-brand";
        
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = "w-11 h-11 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl flex items-center justify-center active:scale-90 transition-transform";
        delBtn.innerHTML = '<span class="material-symbols-rounded text-xl">delete</span>';
        delBtn.onclick = () => div.remove();
        
        div.appendChild(btn);
        div.appendChild(qtyInput);
        div.appendChild(delBtn);
        list.appendChild(div);
    },
    async captureImage() {
        try {
            if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
                const image = await Capacitor.Plugins.Camera.getPhoto({
                    quality: 90,
                    allowEditing: false,
                    resultType: 'uri',
                    source: 'CAMERA'
                });
                this.updateImagePreview(image.webPath);
            } else {
                // Web fallback - trigger hidden file input
                document.getElementById('file-upload-input').click();
            }
        } catch (e) {
            console.error("Camera error:", e);
        }
    },
    updateImagePreview(uri) {
        this.currentSightingImage = uri;
        const preview = document.getElementById('sighting-image-preview');
        const placeholder = document.getElementById('sighting-image-placeholder');
        if (preview && placeholder) {
            preview.src = uri;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
        }
    },
    async submitLog() {
        const entries = [];
        let xp = 0, seeds = 0;
        let firstSpecies = null;
        let speciesIdToBroadcast = null;
        
        document.querySelectorAll('#log-entries > div').forEach(div => {
            const btn = div.querySelector('button');
            const id = btn ? btn.dataset.id : null;
            const input = div.querySelector('input');
            const qty = input ? (parseInt(input.value) || 1) : 1;
            
            if (id) {
                const s = this.app.data.getSpecies(this.app, id);
                if (s) {
                    if (!firstSpecies) {
                        firstSpecies = s;
                        speciesIdToBroadcast = id;
                    }
                    entries.push(s.name);
                    xp += s.xp * qty;
                    seeds += s.seeds * qty;
                    if (!this.app.state.speciesData[id]) this.app.state.speciesData[id] = { count: 0, level: 1, xp: 0 };
                    this.app.state.speciesData[id].count += qty;
                }
            }
        });
        
        if (!entries.length) {
            this.app.ui.showToast("Please select at least one species!");
            return;
        }

        if (!this.currentSightingImage) {
            this.app.ui.showToast("A photo is required to verify your sighting!");
            return;
        }
        
        this.app.state.xp += xp;
        this.app.state.seeds += seeds;
        this.app.state.quests.daily.progress += entries.length;
        this.app.saveState();
        
        // Broadcast Sighting
        if (this.app.multiplayer && this.app.map.pos.lat && firstSpecies) {
            this.app.multiplayer.broadcastSighting({
                lat: this.app.map.pos.lat,
                lng: this.app.map.pos.lng,
                speciesId: speciesIdToBroadcast,
                speciesName: firstSpecies.name,
                username: this.app.state.username
            });
        }
        
        if (this.app.ui) {
            this.app.ui.renderProfile();
            this.app.ui.closeLogSighting();
            const displayName = entries.length > 1 ? `${entries.length} Species` : entries[0];
            this.app.ui.showLogged(firstSpecies, xp, seeds, displayName, this.currentSightingImage);
            this.currentSightingImage = null; // Clear for next time
        }
    }
};
