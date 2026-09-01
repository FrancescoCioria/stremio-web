const { targetFileLength, downloadedPercent } = require('../src/routes/Player/casaDownloadedPct');

describe('targetFileLength', () => {
    test('un solo file -> la sua lunghezza', () => {
        expect(targetFileLength([{ length: 865156540 }])).toBe(865156540);
    });
    test('season pack -> il piu' + "'" + ' grande', () => {
        expect(targetFileLength([{ length: 100 }, { length: 900 }, { length: 300 }])).toBe(900);
    });
    test('niente file / lunghezze assurde -> null', () => {
        expect(targetFileLength([])).toBeNull();
        expect(targetFileLength(null)).toBeNull();
        expect(targetFileLength([{ length: 0 }])).toBeNull();
    });
});

describe('downloadedPercent', () => {
    test('meta file -> 50%', () => {
        expect(downloadedPercent(500, 1000)).toBe(50);
    });
    test('un decimale', () => {
        expect(downloadedPercent(123, 1000)).toBe(12.3);
    });
    test('oltre il 100% viene cappato (ri-letture)', () => {
        expect(downloadedPercent(1370, 1000)).toBe(100);
    });
    test('input non validi -> null (si mostra solo i MB)', () => {
        expect(downloadedPercent(null, 1000)).toBeNull();
        expect(downloadedPercent(500, 0)).toBeNull();
        expect(downloadedPercent(500, null)).toBeNull();
    });
});
