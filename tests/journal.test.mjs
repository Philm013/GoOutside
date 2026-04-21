import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { journal } from '../js/journal.js';
import { inat } from '../js/inat.js';
import { data } from '../js/data.js';

// Build a minimal app mock for journal tests
function makeApp(observations = []) {
    return {
        inat,
        data,
        state: {
            ...data.defaultState(),
            observations,
        }
    };
}

describe('journal.getTaxaBreakdown()', () => {
    test('returns empty array with no observations', () => {
        const j = Object.create(journal);
        j.app = makeApp([]);
        assert.deepEqual(j.getTaxaBreakdown(), []);
    });

    test('counts single iconic group correctly', () => {
        const j = Object.create(journal);
        j.app = makeApp([
            { iconic: 'Aves' }, { iconic: 'Aves' }, { iconic: 'Aves' }
        ]);
        const result = j.getTaxaBreakdown();
        assert.equal(result.length, 1);
        assert.equal(result[0].iconic, 'Aves');
        assert.equal(result[0].count, 3);
        assert.equal(result[0].emoji, '🐦');
        assert.equal(result[0].label, 'Bird');
    });

    test('counts multiple iconic groups', () => {
        const j = Object.create(journal);
        j.app = makeApp([
            { iconic: 'Aves' }, { iconic: 'Aves' },
            { iconic: 'Plantae' },
            { iconic: 'Mammalia' }, { iconic: 'Mammalia' }, { iconic: 'Mammalia' }
        ]);
        const result = j.getTaxaBreakdown();
        assert.equal(result.length, 3);
        // Should be sorted descending
        assert.equal(result[0].iconic, 'Mammalia');
        assert.equal(result[0].count, 3);
        assert.equal(result[1].iconic, 'Aves');
        assert.equal(result[1].count, 2);
        assert.equal(result[2].iconic, 'Plantae');
        assert.equal(result[2].count, 1);
    });

    test('observations with missing iconic fall back to Animalia', () => {
        const j = Object.create(journal);
        j.app = makeApp([{ iconic: null }, { iconic: undefined }, {}]);
        const result = j.getTaxaBreakdown();
        assert.equal(result.length, 1);
        assert.equal(result[0].iconic, 'Animalia');
        assert.equal(result[0].count, 3);
        assert.equal(result[0].emoji, '🐾');
    });

    test('result items include emoji and label from inat helpers', () => {
        const j = Object.create(journal);
        j.app = makeApp([{ iconic: 'Insecta' }]);
        const [item] = j.getTaxaBreakdown();
        assert.equal(item.emoji, inat.iconicEmoji('Insecta'));
        assert.equal(item.label, inat.iconicLabel('Insecta'));
    });

    test('sorted descending by count', () => {
        const j = Object.create(journal);
        j.app = makeApp([
            { iconic: 'Fungi' },
            { iconic: 'Reptilia' }, { iconic: 'Reptilia' }, { iconic: 'Reptilia' },
            { iconic: 'Amphibia' }, { iconic: 'Amphibia' }
        ]);
        const result = j.getTaxaBreakdown();
        const counts = result.map(r => r.count);
        assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
    });
});

describe('journal init / module structure', () => {
    test('journal exports an object', () => {
        assert.equal(typeof journal, 'object');
    });

    test('journal has required methods', () => {
        assert.equal(typeof journal.init, 'function');
        assert.equal(typeof journal.renderJournal, 'function');
        assert.equal(typeof journal.submitObservation, 'function');
        assert.equal(typeof journal.getTaxaBreakdown, 'function');
        assert.equal(typeof journal._parseExifGPS, 'function');
        assert.equal(typeof journal.confirmPickedLocation, 'function');
    });

    test('_pendingObsLocation is null at module level', () => {
        assert.equal(journal._pendingObsLocation, null);
    });

    test('_moveObsId is null at module level', () => {
        assert.equal(journal._moveObsId, null);
    });
});

// ── journal._parseExifGPS() ───────────────────────────────────────────────────
describe('journal._parseExifGPS()', () => {
    test('returns null for empty ArrayBuffer', () => {
        assert.equal(journal._parseExifGPS(new ArrayBuffer(0)), null);
    });

    test('returns null for a 2-byte buffer with no JPEG SOI', () => {
        const buf = new ArrayBuffer(2); // 0x0000 — not 0xFFD8
        assert.equal(journal._parseExifGPS(buf), null);
    });

    test('returns null for a 3-byte buffer (too small to have segments)', () => {
        const buf = new ArrayBuffer(3);
        const view = new DataView(buf);
        view.setUint8(0, 0xFF); view.setUint8(1, 0xD8); // JPEG SOI
        assert.equal(journal._parseExifGPS(buf), null);
    });

    test('returns null for JPEG without APP1/EXIF segment', () => {
        // JPEG SOI + APP0 (JFIF marker 0xFFE0, length 16)
        const size = 2 + 2 + 2 + 14; // SOI + marker + length + 14 junk bytes
        const buf = new ArrayBuffer(size);
        const view = new DataView(buf);
        view.setUint16(0, 0xFFD8); // SOI
        view.setUint16(2, 0xFFE0); // APP0
        view.setUint16(4, 16);     // segment length (includes length bytes)
        // remaining bytes are zeros — loop will advance and then exit
        assert.equal(journal._parseExifGPS(buf), null);
    });

    test('returns null for buffer with APP1 but no Exif header', () => {
        // SOI + APP1 marker + length 8 + 4 bytes that are NOT "Exif"
        const size = 2 + 2 + 2 + 4;
        const buf = new ArrayBuffer(size);
        const view = new DataView(buf);
        view.setUint16(0, 0xFFD8); // SOI
        view.setUint16(2, 0xFFE1); // APP1
        view.setUint16(4, 8);      // length
        view.setUint32(6, 0x4A464946); // "JFIF" not "Exif"
        assert.equal(journal._parseExifGPS(buf), null);
    });

    test('returns { lat, lng } object shape when GPS coords are valid', () => {
        // Build a minimal synthetic JPEG+EXIF buffer with known GPS data.
        // JPEG layout (absolute offsets):
        //   0-1  : SOI  0xFFD8
        //   2-3  : APP1 0xFFE1
        //   4-5  : APP1 length
        //   6-9  : "Exif"
        //   10-11: \0\0  (null terminator)
        //   12+  : TIFF data  ← tiffStart = offset(2) + 10 = 12
        //
        // All TIFF offsets below are relative to tiffStart (12).

        const tiffSize = 200;
        const buf = new ArrayBuffer(12 + tiffSize);
        const view = new DataView(buf);
        const T = 12; // absolute position of tiffStart

        // JPEG header
        view.setUint16(0, 0xFFD8); // SOI
        view.setUint16(2, 0xFFE1); // APP1 marker
        view.setUint16(4, 8 + tiffSize); // APP1 length (len field + Exif\0\0 + TIFF)
        // "Exif" at bytes 6-9
        view.setUint8(6, 0x45); view.setUint8(7, 0x78);
        view.setUint8(8, 0x69); view.setUint8(9, 0x66);
        // bytes 10-11 stay 0x00 (\0\0 terminator)

        // TIFF: little-endian ("II")
        view.setUint8(T + 0, 0x49); view.setUint8(T + 1, 0x49);
        view.setUint16(T + 2, 42, true); // TIFF magic
        const ifd0Off = 8;
        view.setUint32(T + 4, ifd0Off, true); // IFD0 offset

        // IFD0: 1 entry pointing to GPS IFD
        //   T+8  : entry count (2)
        //   T+10 : entry (12 bytes)
        //   T+22 : next IFD ptr (4)
        const gpsIfdOff = ifd0Off + 2 + 1 * 12 + 4; // = 26
        view.setUint16(T + ifd0Off, 1, true); // 1 IFD0 entry
        const e0 = T + ifd0Off + 2;
        view.setUint16(e0,     0x8825, true); // GPS IFD tag
        view.setUint16(e0 + 2, 4,      true); // LONG type
        view.setUint32(e0 + 4, 1,      true); // count
        view.setUint32(e0 + 8, gpsIfdOff, true); // value = GPS IFD TIFF-offset
        view.setUint32(T + ifd0Off + 2 + 12, 0, true); // next IFD = none

        // GPS IFD: 4 entries (LatRef, Lat, LngRef, Lng)
        //   T+26: entry count (2)
        //   T+28..T+75: 4 entries × 12 bytes
        //   T+76..T+79: next IFD ptr (4)
        const ratDataStart = gpsIfdOff + 2 + 4 * 12 + 4; // = 80
        const latRatOff  = ratDataStart;      // 80 — 3 rationals × 8 = 24 bytes
        const latRefOff  = ratDataStart + 24; // 104 — 1 ASCII byte
        const lngRatOff  = ratDataStart + 25; // 105 — 3 rationals × 8 = 24 bytes
        const lngRefOff  = ratDataStart + 49; // 129 — 1 ASCII byte

        const gpsBase = T + gpsIfdOff;
        view.setUint16(gpsBase, 4, true); // 4 entries

        const writeEntry = (idx, tag, valOff) => {
            const base = gpsBase + 2 + idx * 12;
            view.setUint16(base,     tag,    true);
            view.setUint16(base + 2, 5,      true); // RATIONAL
            view.setUint32(base + 4, 3,      true); // 3 rationals
            view.setUint32(base + 8, valOff, true);
        };
        const writeRefEntry = (idx, tag, refDataOff) => {
            const base = gpsBase + 2 + idx * 12;
            view.setUint16(base,     tag,        true);
            view.setUint16(base + 2, 2,          true); // ASCII
            view.setUint32(base + 4, 2,          true); // count
            view.setUint32(base + 8, refDataOff, true);
        };
        writeRefEntry(0, 0x1, latRefOff);
        writeEntry   (1, 0x2, latRatOff);
        writeRefEntry(2, 0x3, lngRefOff);
        writeEntry   (3, 0x4, lngRatOff);

        // Ref chars
        view.setUint8(T + latRefOff, 0x4E); // 'N'
        view.setUint8(T + lngRefOff, 0x57); // 'W'

        const writeRat = (tiffOff, num, den) => {
            view.setUint32(T + tiffOff,     num, true);
            view.setUint32(T + tiffOff + 4, den, true);
        };
        // lat: 37° 46' 29.64" N  →  37 + 46/60 + 2964/(100×3600)
        writeRat(latRatOff,      37,   1);
        writeRat(latRatOff + 8,  46,   1);
        writeRat(latRatOff + 16, 2964, 100);
        // lng: 122° 25' 9.90" W  →  -(122 + 25/60 + 990/(100×3600))
        writeRat(lngRatOff,      122,  1);
        writeRat(lngRatOff + 8,  25,   1);
        writeRat(lngRatOff + 16, 990,  100);

        const result = journal._parseExifGPS(buf);
        assert.ok(result !== null, 'should return a GPS object, not null');
        assert.ok(typeof result.lat === 'number', 'lat should be a number');
        assert.ok(typeof result.lng === 'number', 'lng should be a number');
        // 37 + 46/60 + 29.64/3600 ≈ 37.7749
        assert.ok(Math.abs(result.lat - 37.7749) < 0.001, `lat ${result.lat} should be ≈ 37.775`);
        // -(122 + 25/60 + 9.90/3600) ≈ -122.4194
        assert.ok(Math.abs(result.lng - (-122.4194)) < 0.001, `lng ${result.lng} should be ≈ -122.419`);
    });
});

// ── journal.confirmPickedLocation() ──────────────────────────────────────────
describe('journal.confirmPickedLocation()', () => {
    function makeJournal() {
        const j = Object.create(journal);
        j._pendingObsLocation = null;
        j._moveObsId = null;
        // Stub DOM-dependent display helper
        j._updateLocationDisplay = () => {};
        return j;
    }

    function makeApp(extraState = {}) {
        return {
            ui: {
                _pickerTempLocation: { lat: 47.6062, lng: -122.3321 },
                closeLocationPicker() {},
                showToast() {},
            },
            state: { observations: [], ...extraState },
            saveState() {},
            map: { personalMarkers: [] },
        };
    }

    test('sets _pendingObsLocation when no _moveObsId', () => {
        const j = makeJournal();
        j.app = makeApp();
        j.confirmPickedLocation();
        assert.deepEqual(j._pendingObsLocation, { lat: 47.6062, lng: -122.3321 });
    });

    test('does not set _pendingObsLocation when _pickerTempLocation is null', () => {
        const j = makeJournal();
        j.app = makeApp();
        j.app.ui._pickerTempLocation = null;
        j.confirmPickedLocation();
        assert.equal(j._pendingObsLocation, null);
    });

    test('updates existing observation lat/lng when _moveObsId is set', () => {
        const j = makeJournal();
        const obs = { id: 'obs-abc', lat: 0, lng: 0 };
        j._moveObsId = 'obs-abc';
        j.app = makeApp({ observations: [obs] });
        j.confirmPickedLocation();
        assert.equal(obs.lat, 47.6062);
        assert.equal(obs.lng, -122.3321);
    });

    test('clears _moveObsId after moving an observation', () => {
        const j = makeJournal();
        j._moveObsId = 'obs-xyz';
        const obs = { id: 'obs-xyz', lat: 0, lng: 0 };
        j.app = makeApp({ observations: [obs] });
        j.confirmPickedLocation();
        assert.equal(j._moveObsId, null);
    });

    test('does not set _pendingObsLocation in move mode', () => {
        const j = makeJournal();
        j._moveObsId = 'obs-xyz';
        j._pendingObsLocation = null;
        const obs = { id: 'obs-xyz', lat: 0, lng: 0 };
        j.app = makeApp({ observations: [obs] });
        j.confirmPickedLocation();
        assert.equal(j._pendingObsLocation, null);
    });

    test('handles _moveObsId pointing to non-existent obs gracefully', () => {
        const j = makeJournal();
        j._moveObsId = 'missing-id';
        j.app = makeApp({ observations: [] });
        // Should not throw
        assert.doesNotThrow(() => j.confirmPickedLocation());
        assert.equal(j._moveObsId, null);
    });

    test('updates map marker lat/lng on move', () => {
        const j = makeJournal();
        j._moveObsId = 'obs-123';
        const obs = { id: 'obs-123', lat: 0, lng: 0 };
        let markerUpdated = false;
        const fakeMarker = {
            obsId: 'obs-123',
            setLatLng([lat, lng]) { markerUpdated = true; assert.equal(lat, 47.6062); }
        };
        j.app = makeApp({ observations: [obs] });
        j.app.map.personalMarkers = [fakeMarker];
        j.confirmPickedLocation();
        assert.ok(markerUpdated, 'marker setLatLng should have been called');
    });
});
