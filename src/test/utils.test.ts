import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import * as vscode from 'vscode'; // Sera mocké par ton setup.ts
import { 
    isValidFlutterString, 
    getAvailableLangs, 
    mergeJsonStrings, 
    updateArbFiles,
    atomicWrite,
    readFileContent
} from '../core/utils';

// Mocking fs/promises
vi.mock('fs/promises');

describe('utils.ts unit tests', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * @group Validation
     */
    describe('isValidFlutterString', () => {
        it('should return true for double and single quoted strings', () => {
            expect(isValidFlutterString('"Hello"')).toBe(true);
            expect(isValidFlutterString("'Hello'")).toBe(true);
        });

        it('should return false for invalid strings', () => {
            expect(isValidFlutterString('Hello')).toBe(false);
            expect(isValidFlutterString("'Hello\"")).toBe(false);
            expect(isValidFlutterString('')).toBe(false);
        });
    });

    /**
     * @group File_IO
     */
    describe('readFileContent', () => {
        it('should return content on success', async () => {
            vi.mocked(fs.readFile).mockResolvedValue('content');
            const res = await readFileContent('test.txt');
            expect(res).toBe('content');
        });

        it('should return empty string on failure', async () => {
            vi.mocked(fs.readFile).mockRejectedValue(new Error());
            const res = await readFileContent('test.txt');
            expect(res).toBe('');
        });
    });

    describe('atomicWrite', () => {
        it('should create a backup if requested', async () => {
            vi.mocked(fs.access).mockResolvedValue(undefined); // File exists
            
            await atomicWrite('test.arb', '{}', true);

            expect(fs.copyFile).toHaveBeenCalledWith('test.arb', 'test.arb.bak');
            expect(fs.writeFile).toHaveBeenCalled();
            expect(fs.rename).toHaveBeenCalled();
        });

        it('should write to a temporary file first', async () => {
            await atomicWrite('test.arb', '{"a":1}', false);

            const tempFilePath = vi.mocked(fs.writeFile).mock.calls[0][0] as string;
            expect(tempFilePath).toContain('.tmp-');
            expect(vi.mocked(fs.rename)).toHaveBeenCalledWith(tempFilePath, 'test.arb');
        });
    });

    /**
     * @group Discovery
     */
    describe('getAvailableLangs', () => {
        it('should extract complex language tags (e.g. fr_CA, en)', async () => {
            const mockFiles = ['app_en.arb', 'app_fr_CA.arb', 'other.txt'];
            vi.mocked(fs.readdir).mockResolvedValue(mockFiles as any);

            const langs = await getAvailableLangs('/mock');
            expect(langs).toEqual(['en', 'fr_CA']);
        });
    });

    /**
     * @group Transformation
     */
    describe('mergeJsonStrings', () => {
        it('should merge and prioritize existing values', () => {
            const existing = '{"key1": "old"}';
            const newData = '{"key1": "new", "key2": "fresh"}';
            const result = JSON.parse(mergeJsonStrings(existing, newData));
            
            expect(result.key1).toBe("old"); // Priorité à l'existant
            expect(result.key2).toBe("fresh");
        });
    });

    /**
     * @group Integration_Logic
     */
    describe('updateArbFiles', () => {
        it('should add a key, sort alphabetically, and write atomically', async () => {
            vi.mocked(fs.readFile).mockResolvedValue('{"z": 1, "a": 2}');
            
            await updateArbFiles('app_en.arb', 'm', '3');

            const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
            const parsed = JSON.parse(writtenContent);
            
            // Vérification de l'ordre alphabétique des clés
            expect(Object.keys(parsed)).toEqual(['a', 'm', 'z']);
            expect(vi.mocked(fs.rename)).toHaveBeenCalled();
        });
    });
});