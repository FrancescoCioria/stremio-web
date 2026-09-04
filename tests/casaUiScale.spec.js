// Zoom UI Casa: logica pura (clamp/step/label/parsing). Il meccanismo di
// applicazione (font-size vs zoom, perche' non l'altro) e' documentato nel
// modulo — qui si testa solo cio' che e' testabile senza DOM/CSS reali.

const {
    DEFAULT_SCALE,
    MIN_SCALE,
    MAX_SCALE,
    STEP,
    clamp,
    nextScaleForKey,
    scaleLabel,
    parseStored,
} = require('../src/common/casaUiScale');

describe('clamp', () => {
    test('resta dentro [MIN_SCALE, MAX_SCALE]', () => {
        expect(clamp(0)).toBe(MIN_SCALE);
        expect(clamp(10)).toBe(MAX_SCALE);
        expect(clamp(1.1)).toBe(1.1);
    });
});

describe('nextScaleForKey', () => {
    test('ArrowRight/ArrowLeft muovono di uno STEP, clampati', () => {
        expect(nextScaleForKey('ArrowRight', 1.1)).toBeCloseTo(1.1 + STEP);
        expect(nextScaleForKey('ArrowLeft', 1.1)).toBeCloseTo(1.1 - STEP);
        expect(nextScaleForKey('ArrowRight', MAX_SCALE)).toBe(MAX_SCALE);
        expect(nextScaleForKey('ArrowLeft', MIN_SCALE)).toBe(MIN_SCALE);
    });

    test('ogni altro tasto -> null, cosi\' la spatial-nav cambia riga', () => {
        expect(nextScaleForKey('ArrowUp', 1.1)).toBe(null);
        expect(nextScaleForKey('ArrowDown', 1.1)).toBe(null);
        expect(nextScaleForKey('Enter', 1.1)).toBe(null);
    });
});

describe('scaleLabel', () => {
    test('percentuale arrotondata', () => {
        expect(scaleLabel(1.1)).toBe('110%');
        expect(scaleLabel(1)).toBe('100%');
        expect(scaleLabel(0.95)).toBe('95%');
    });
});

describe('parseStored', () => {
    test('numero valido dentro range -> quello (clampato)', () => {
        expect(parseStored('1.2')).toBe(1.2);
        expect(parseStored('5')).toBe(MAX_SCALE);
    });

    test('null/non numerico/vuoto -> DEFAULT_SCALE, mai un crash', () => {
        expect(parseStored(null)).toBe(DEFAULT_SCALE);
        expect(parseStored(undefined)).toBe(DEFAULT_SCALE);
        expect(parseStored('')).toBe(DEFAULT_SCALE);
        expect(parseStored('abc')).toBe(DEFAULT_SCALE);
    });
});
