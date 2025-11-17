import { describe, it, expect } from 'vitest';
import { mergeJsonStrings } from '../core/utils.js';


describe('mergeJsonStrings', () => {
    it('conserve l en tete du premier', () => {
        const existing = JSON.stringify({ header: 'keep', a: 1 });
        const incoming = JSON.stringify({ a: 2, b: 3 });
        const merged = mergeJsonStrings(existing, incoming);
        const parsed = JSON.parse(merged);
        expect(parsed.header).toBe('keep');
        expect(parsed.a).toBe(1); // existing overrides incoming
        expect(parsed.b).toBe(3);
    });
});