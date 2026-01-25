/**
 * @file utils.test.ts
 * @description Unit tests for the core utility functions used in ARB (Application Resource Bundle) management.
 * This suite covers string validation, file system discovery, JSON merging logic, and file persistence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import { 
    isValidFlutterString, 
    getAvailableLangs, 
    mergeJsonStrings, 
    updateArbFiles 
} from '../core/utils';

// Mocking the File System module to prevent actual disk I/O during testing
vi.mock('fs/promises');

describe('utils.ts unit tests', () => {

    /**
     * @group Validation
     * Tests the regex/logic used to identify valid Flutter-compatible quoted strings.
     */
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

    /**
     * @group Discovery
     * Tests the extraction of ISO language codes from ARB filenames (e.g., app_en.arb -> en).
     */
    describe('getAvailableLangs', () => {
        it('should extract language tags from filenames', async () => {
            const mockFiles = ['app_en.arb', 'app_fr.arb', 'app_es_ES.arb', 'ignore_me.txt'];
            vi.mocked(fs.readdir).mockResolvedValue(mockFiles as any);

            const langs = await getAvailableLangs('/mock/path');
            // Expected to ignore non-ARB files and strip the prefix/extension
            expect(langs).toEqual(['en', 'fr', 'es_ES']);
        });

        it('should return an empty array if folder reading fails', async () => {
            vi.mocked(fs.readdir).mockRejectedValue(new Error('Folder not found'));
            const langs = await getAvailableLangs('/wrong/path');
            expect(langs).toEqual([]);
        });
    });

    /**
     * @group Transformation
     * Tests the logic of merging new localization keys into existing datasets.
     */
    describe('mergeJsonStrings', () => {
        it('should merge two JSON strings, prioritizing existing keys', () => {
            const existing = '{"hello": "Bonjour"}';
            const newData = '{"hello": "Hi", "world": "Monde"}';
            const result = JSON.parse(mergeJsonStrings(existing, newData));
            
            // Logic check: "hello" should remain "Bonjour" (existing value)
            expect(result.hello).toBe("Bonjour"); 
            expect(result.world).toBe("Monde");
        });

        it('should handle empty or invalid JSON gracefully', () => {
            // Should initialize a new JSON object if the first string is empty
            expect(mergeJsonStrings('', '{"a":1}')).toBe('{\n  "a": 1\n}');
            // Should return the original string if it is not valid JSON
            expect(mergeJsonStrings('invalid', '{"a":1}')).toBe('invalid');
        });
    });

    /**
     * @group File I/O
     * Tests the process of reading, updating, sorting, and writing ARB files to disk.
     */
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

            // Verify alphabetical sorting: 'alpha' must come before 'beta'
            const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
            const parsed = JSON.parse(writtenContent);
            
            const keys = Object.keys(parsed);
            expect(keys).toEqual(['alpha', 'beta']);
            expect(parsed.alpha).toBe('a');
        });

        it('should create a new object if file does not exist (ENOENT)', async () => {
            // Mocking a "File Not Found" error
            vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
            vi.mocked(fs.writeFile).mockResolvedValue(undefined);

            await updateArbFiles('/path/app_en.arb', 'newKey', 'newValue');

            const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
            expect(JSON.parse(writtenContent)).toEqual({ newKey: 'newValue' });
        });
    });
});