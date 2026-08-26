import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import type { Dirent } from 'fs';
import path from 'path';
import * as vscode from 'vscode'; // Sera mocké par ton setup.ts
import { 
    isValidFlutterString, 
    getAvailableLangs, 
    mergeJsonStrings, 
    updateArbFiles,
    atomicWrite,
    readFileContent,
    arbFilePrefix,
    executeGenL10n
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

        it('should extract script and region language tags (e.g. zh_Hant_TW, es_419)', async () => {
            const mockFiles = [
                'app_en.arb',
                'app_fr_CA.arb',
                'app_zh_Hant_TW.arb',
                'app_zh_Hans_CN.arb',
                'app_sr_Cyrl.arb',
                'app_es_419.arb',
                'other.txt',
            ];
            vi.mocked(fs.readdir).mockResolvedValue(mockFiles as unknown as Dirent[]);

            const langs = await getAvailableLangs('/mock');
            expect(langs).toEqual([
                'en',
                'fr_CA',
                'zh_Hant_TW',
                'zh_Hans_CN',
                'sr_Cyrl',
                'es_419',
            ]);
        });

        it('should ignore files that are not ARB locale files', async () => {
            const mockFiles = ['app_config.arb', 'app.arb', 'messages_en.arb', 'app_en.arb'];
            vi.mocked(fs.readdir).mockResolvedValue(mockFiles as unknown as Dirent[]);

            const langs = await getAvailableLangs('/mock');
            expect(langs).toEqual(['en']);
        });

        it('should honor a non-default ARB filename prefix', async () => {
            const mockFiles = ['intl_en.arb', 'intl_zh_Hant_TW.arb', 'app_fr.arb'];
            vi.mocked(fs.readdir).mockResolvedValue(mockFiles as unknown as Dirent[]);

            const langs = await getAvailableLangs('/mock', 'intl_');
            expect(langs).toEqual(['en', 'zh_Hant_TW']);
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

        it('should keep existing keys in place and append new ones', () => {
            const existing = '{\n  "zebra": "z",\n  "@zebra": {},\n  "apple": "a"\n}\n';
            const merged = mergeJsonStrings(existing, '{"banana": "b"}');

            expect(Object.keys(JSON.parse(merged))).toEqual(['zebra', '@zebra', 'apple', 'banana']);
        });

        it('should preserve indentation and the trailing newline', () => {
            const existing = '{\n    "a": "1"\n}\n';
            const merged = mergeJsonStrings(existing, '{"b": "2"}');

            expect(merged).toBe('{\n    "a": "1",\n    "b": "2"\n}\n');
        });

        it('should not add a trailing newline when the original had none', () => {
            const merged = mergeJsonStrings('{\n  "a": "1"\n}', '{"b": "2"}');

            expect(merged).toBe('{\n  "a": "1",\n  "b": "2"\n}');
        });
    });

    describe('arbFilePrefix', () => {
        it('should derive the prefix from the template ARB file', () => {
            expect(arbFilePrefix('app_en.arb')).toBe('app_');
            expect(arbFilePrefix('intl_zh_Hant_TW.arb')).toBe('intl_');
            expect(arbFilePrefix('my_app_es_419.arb')).toBe('my_app_');
            expect(arbFilePrefix('strings.arb')).toBe('strings_');
        });
    });

    /**
     * @group Integration_Logic
     */
    describe('updateArbFiles', () => {
        it('should add a key without reordering existing entries', async () => {
            vi.mocked(fs.readFile).mockResolvedValue('{\n  "z": "1",\n  "a": "2"\n}\n');
            
            await updateArbFiles('app_en.arb', 'm', '3');

            const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;

            // A new key is appended; existing keys keep their original position.
            expect(writtenContent).toBe('{\n  "z": "1",\n  "a": "2",\n  "m": "3"\n}\n');
            expect(vi.mocked(fs.rename)).toHaveBeenCalled();
        });

        it('should update an existing key in place', async () => {
            vi.mocked(fs.readFile).mockResolvedValue('{\n  "z": "1",\n  "a": "2"\n}\n');

            await updateArbFiles('app_en.arb', 'z', 'updated');

            const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
            expect(writtenContent).toBe('{\n  "z": "updated",\n  "a": "2"\n}\n');
        });

        it('should create a missing file with 2-space indentation', async () => {
            vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

            await updateArbFiles('app_fr.arb', 'hello', 'Bonjour');

            const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
            expect(writtenContent).toBe('{\n  "hello": "Bonjour"\n}\n');
        });
    });

    /**
     * @group Process
     */
    describe('executeGenL10n', () => {
        const endWith = (exitCode: number | undefined) => {
            const execution = { task: {} };
            vi.mocked(vscode.tasks.executeTask).mockResolvedValue(execution as never);
            vi.mocked(vscode.tasks.onDidEndTaskProcess).mockImplementation(((listener: (event: unknown) => void) => {
                listener({ execution, exitCode });
                return { dispose: vi.fn() };
            }) as never);
            vi.mocked(vscode.tasks.onDidEndTask).mockReturnValue({ dispose: vi.fn() } as never);
        };

        it('should run the task in the project root and resolve on exit code 0', async () => {
            endWith(0);

            await expect(executeGenL10n('/repo/client')).resolves.toBeUndefined();

            expect(vscode.ShellExecution).toHaveBeenCalledWith('flutter gen-l10n', { cwd: '/repo/client' });
        });

        it('should reject when gen-l10n exits with a non-zero code', async () => {
            endWith(1);

            await expect(executeGenL10n('/repo/client')).rejects.toThrow('exit code 1');
        });

        it('should reject when the task ends without an exit code', async () => {
            endWith(undefined);

            await expect(executeGenL10n()).rejects.toThrow('flutter gen-l10n failed');
        });
    });
});