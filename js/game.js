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
        const subjectBtn = document.getElementById('primary-species-btn');
        const speciesId = subjectBtn?.dataset.id;
        const countInput = document.getElementById('sighting-count');
        const notesInput = document.getElementById('sighting-notes');
        const habitatInput = document.getElementById('sighting-habitat');
        const weatherInput = document.getElementById('sighting-weather');

        if (!speciesId) {
            this.app.ui.showToast('Choose the animal you documented first.');
            return;
        }

        if (!this.currentSightingImage) {
            this.app.ui.showToast('A photo is required to verify your sighting!');
            return;
        }

        // Build species object from dataset + localSpecies lookup
        const speciesName = subjectBtn.dataset.name || speciesId;
        const iconic = subjectBtn.dataset.iconic || '';
        const localMatch = (this.app.localSpecies || []).find(s => String(s.id) === String(speciesId));
        const species = {
            id: speciesId,
            name: speciesName,
            sciName: localMatch?.sciName || subjectBtn.dataset.sciname || '',
            iconic: localMatch?.iconic || iconic,
            rarity: localMatch?.rarity || 'Common',
            dp: localMatch?.dp || 50
        };

        const qty = Math.max(parseInt(countInput?.value || '1', 10), 1);
        const notes = (notesInput?.value || '').trim();
        const habitat = habitatInput?.value || 'General';
        const weather = weatherInput?.value || 'Unknown';
        const lat = this.app.map.pos.lat || null;
        const lng = this.app.map.pos.lng || null;

        const s = this.app.state;
        this.app.data.updateStreak(s);
        const dp = this.app.data.calcObservationDP(species, s);

        // Update catalogue
        if (!s.catalogue[speciesId]) {
            s.catalogue[speciesId] = {
                name: species.name,
                sciName: species.sciName,
                iconic: species.iconic,
                count: 0,
                firstSeen: new Date().toISOString()
            };
        }
        s.catalogue[speciesId].count += qty;
        s.catalogue[speciesId].name = species.name;
        s.catalogue[speciesId].sciName = species.sciName;
        s.catalogue[speciesId].iconic = species.iconic;

        const entry = {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString(),
            speciesId,
            speciesName: species.name,
            sciName: species.sciName,
            iconic: species.iconic,
            qty,
            notes,
            habitat,
            weather,
            imageUri: this.currentSightingImage,
            lat,
            lng,
            dp,
            rarity: species.rarity
        };

        s.observations.unshift(entry);
        s.observations = s.observations.slice(0, 500);
        s.discoveryPoints += dp;

        if (!Array.isArray(s.syncQueue)) s.syncQueue = [];
        s.syncQueue.push({ ...entry });

        const newBadges = this.app.data.checkBadges(s);
        this.app.saveState();

        if (this.app.map && this.app.map.addPersonalSighting) {
            this.app.map.addPersonalSighting(entry);
        }

        if (this.app.multiplayer && this.app.map.pos.lat) {
            this.app.multiplayer.broadcastSighting({
                lat: this.app.map.pos.lat,
                lng: this.app.map.pos.lng,
                speciesId,
                speciesName: species.name,
                username: s.username
            });
            s._sharedSighting = true;
        }

        if (this.app.ui) {
            this.app.ui.renderProfile();
            this.app.ui.closeLogObservation();
            this.app.ui.showObsSuccess(entry, newBadges);
            for (const badge of newBadges) {
                this.app.ui.showBadgeUnlock(badge);
            }
            this.currentSightingImage = null;
        }

        this.app.hud.renderHUDStats();
    }
};
