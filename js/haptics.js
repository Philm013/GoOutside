export const haptics = {
    vibrate() {
        if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
            Capacitor.Plugins.Haptics.impact({ style: 'MEDIUM' });
        }
    }
};
