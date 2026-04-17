export const hud = {
    init(app) {
        this.app = app;
        this.initCompass();
    },
    async initCompass() {
        if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                if (await DeviceOrientationEvent.requestPermission() === 'granted') {
                    window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
                }
            } catch (e) {
                console.error("Compass permission error:", e);
            }
        } else if ('ondeviceorientation' in window) {
            window.addEventListener('deviceorientation', this.handleOrientation.bind(this));
        }
    },
    handleOrientation(e) {
        const alpha = e.webkitCompassHeading || e.alpha;
        if (alpha) {
            const needle = document.getElementById('compass-needle');
            if (needle) needle.style.transform = `rotate(${alpha}deg)`;
        }
    },
    toggleFullscreen() {
        if (this.app && this.app.haptics) this.app.haptics.vibrate();
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
};
