import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import { 
    isValidFlutterString, 
    getAvailableLangs, 
    mergeJsonStrings, 
    updateArbFiles 
} from '../core/utils';

vi.mock('fs/promises');

describe('utils.ts unit tests', () => {

    describe('isValidFlutterString', () => {
        it('should return true for double quoted strings', () => {
            expect(isValidFlutterString('"Hello"')).toBe(true);
        });

        it('should return true for single quoted strings', () => {
            expect(isValidFlutterString("'Hello'")).toBe(true);
        });

        it('should return false for unquoted strings', () => {
            expect(isValidFlutterString('Hello')).toBe(false);
        });

        it('should return false for mismatched quotes', () => {
            expect(isValidFlutterString("'Hello\"")).toBe(false);
        });
    });

    describe('getAvailableLangs', () => {
        it('should extract language tags from filenames', async () => {
            const mockFiles = ['app_en.arb', 'app_fr.arb', 'app_es_ES.arb', 'ignore_me.txt'];
            vi.mocked(fs.readdir).mockResolvedValue(mockFiles as any);

            const langs = await getAvailableLangs('/mock/path');
            expect(langs).toEqual(['en', 'fr', 'es_ES']);
        });

        it('should return an empty array if folder reading fails', async () => {
            vi.mocked(fs.readdir).mockRejectedValue(new Error('Folder not found'));
            const langs = await getAvailableLangs('/wrong/path');
            expect(langs).toEqual([]);
        });
    });

    describe('mergeJsonStrings', () => {
        it('should merge two JSON strings, prioritizing existing keys', () => {
            const existing = '{"hello": "Bonjour"}';
            const newData = '{"hello": "Hi", "world": "Monde"}';
            const result = JSON.parse(mergeJsonStrings(existing, newData));
            
            expect(result.hello).toBe("Bonjour"); // Existing takes priority
            expect(result.world).toBe("Monde");
        });

        it('should handle empty or invalid JSON', () => {
            expect(mergeJsonStrings('', '{"a":1}')).toBe('{\n  "a": 1\n}');
            expect(mergeJsonStrings('invalid', '{"a":1}')).toBe('invalid');
        });
    });

    describe('updateArbFiles', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should add a new key and sort them alphabetically', async () => {
            const existingArb = '{"beta": "b"}';
            vi.mocked(fs.readFile).mockResolvedValue(existingArb);
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);
            vi.mocked(fs.rename).mockResolvedValue(undefined);

            await updateArbFiles('/path/app_en.arb', 'alpha', 'a');

            // Check if writeFile was called with sorted keys (alpha before beta)
            const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
            const parsed = JSON.parse(writtenContent);
            
            const keys = Object.keys(parsed);
            expect(keys).toEqual(['alpha', 'beta']);
            expect(parsed.alpha).toBe('a');
        });

        it('should create a new object if file does not exist', async () => {
            vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);

            await updateArbFiles('/path/app_en.arb', 'newKey', 'newValue');

            const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
            expect(JSON.parse(writtenContent)).toEqual({ newKey: 'newValue' });
        });
    });
});