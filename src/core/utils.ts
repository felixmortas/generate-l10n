import fs from 'fs/promises';
import path from 'path';
import * as vscode from 'vscode';

/**
 * Creates a backup copy of a file.
 * If the file exists, it copies it to the same location with a `.bak` extension.
*/
async function backupFiles(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    const backupPath = filePath + '.bak';

    // If the file exists, create a backup
    try {
        await fs.access(filePath);
        await fs.copyFile(filePath, backupPath);
        console.debug(`[DEBUG] .bak backup created : ${backupPath}`);
    } catch {
        // File may not exist — safe to ignore
    }
}

/**
 * Writes content atomically to a file:
 * - Creates a temporary file.
 * - Renames it to the target path (atomic move).
 * - Optionally creates a `.bak` backup if the file already exists.
 *
 * Ensures consistency even if the process crashes midway.
 */
export async function atomicWrite(filePath: string, content: string, backup: boolean): Promise<void> {
    const dir = path.dirname(filePath);
    if (backup) await backupFiles(filePath, content);

    // Write to a temp file, then rename to target (atomic update)
    const tmpName = path.join(dir, `.tmp-${Date.now()}-${path.basename(filePath)}`);
    await fs.writeFile(tmpName, content, { encoding: 'utf8' });
    await fs.rename(tmpName, filePath);
    console.debug(`[DEBUG] File atomically updated : ${filePath}`);
}

/**
 * Formatting of an existing ARB document, so that rewriting it produces a
 * minimal diff instead of reformatting the whole file.
 */
export interface ArbFormat {
    /** Literal indentation used by the document (2 spaces when undetectable). */
    indent: string;
    /** Whether the document ended with a newline. */
    trailingNewline: boolean;
    /** Line ending used by the document. */
    eol: '\n' | '\r\n';
}

/**
 * Detects the indentation, line ending, and trailing newline of an existing
 * ARB document. New/empty documents default to 2 spaces, LF, and a trailing
 * newline.
 */
export function detectArbFormat(content: string): ArbFormat {
    if (!content) return { indent: '  ', trailingNewline: true, eol: '\n' };

    // Indentation of the first top-level entry, e.g. '{\n    "key": ...'
    const firstEntry = content.match(/^\s*\{[^\n]*\n([ \t]*)\S/);
    const rawIndent = firstEntry?.[1] ?? '';
    const indent = rawIndent || '  ';
    const eol = content.includes('\r\n') ? '\r\n' : '\n';

    return { indent, trailingNewline: content.endsWith('\n'), eol };
}

/**
 * Serializes ARB data while keeping the formatting of the original document.
 * Key order is the insertion order of `data`, so callers control placement.
 */
export function stringifyArb(data: Record<string, unknown>, format: ArbFormat): string {
    const json = JSON.stringify(data, null, format.indent);
    const serialized = format.eol === '\r\n' ? json.replace(/\n/g, '\r\n') : json;
    return format.trailingNewline ? `${serialized}${format.eol}` : serialized;
}

/**
 * Merges two JSON strings by:
 * - Parsing both into objects.
 * - Keeping every existing entry with its original value AND its original
 *   position; entries only present in `newJson` are appended at the end.
 * - Returns the merged document with the indentation and trailing newline of
 *   `existingJson`.
 *
 * If parsing fails, returns `existingJson` unchanged.
 */
export function mergeJsonStrings(existingJson: string, newJson: string): string {
    try {
        console.debug('[DEBUG] Merging JSON files...');
        const existingData: Record<string, unknown> = existingJson ? JSON.parse(existingJson) : {};
        const newData: Record<string, unknown> = newJson ? JSON.parse(newJson) : {};

        // Existing entries win and keep their position; new keys are appended.
        const merged: Record<string, unknown> = { ...existingData };
        for (const [key, value] of Object.entries(newData)) {
            if (!(key in merged)) merged[key] = value;
        }

        return stringifyArb(merged, detectArbFormat(existingJson));
    } catch (e) {
        console.error('[ERROR] JSON merge failed :', e);
        return existingJson;
    }
}

/**
 * Checks if the selected text is a valid Flutter/Dart string.
 * It must be wrapped in single or double quotes.
 */
export function isValidFlutterString(text: string): boolean {
    if (!text) return false;
    const trimmed = text.trim();
    const isSingleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'");
    const isDoubleQuoted = trimmed.startsWith('"') && trimmed.endsWith('"');
    return isSingleQuoted || isDoubleQuoted;
}

/**
 * A Flutter/BCP-47 locale stem as used in ARB filenames: language (2-3
 * letters) + optional 4-letter script + optional region (2 letters or 3
 * digits). Matches the locales `flutter gen-l10n` accepts, e.g. 'en',
 * 'fr_CA', 'sr_Cyrl', 'zh_Hant_TW', 'es_419'.
 */
const LOCALE_TAG = String.raw`[a-z]{2,3}(?:_[A-Za-z]{4})?(?:_(?:[A-Za-z]{2}|\d{3}))?`;

/** Default ARB filename prefix, matching Flutter's default template 'app_en.arb'. */
export const DEFAULT_ARB_PREFIX = 'app_';

/**
 * Derives the ARB filename prefix from the `template-arb-file` of `l10n.yaml`.
 * 'app_en.arb' -> 'app_', 'intl_zh_Hant_TW.arb' -> 'intl_', 'strings.arb' -> 'strings_'.
 */
export function arbFilePrefix(templateArbFile: string): string {
    const stem = path.basename(templateArbFile, '.arb');
    const withoutLocale = stem.match(new RegExp(`^(.+)_${LOCALE_TAG}$`));
    return `${withoutLocale?.[1] ?? stem}_`;
}

/**
 * Scans the l10n folder to extract available language tags.
 * It looks for files matching '<prefix><locale>.arb'.
 * @param arbsFolder Path to the folder containing .arb files.
 * @param prefix ARB filename prefix, as derived from `template-arb-file`.
 * @returns A list of language tags like ["en", "fr_CA", "zh_Hant_TW", "es_419"].
 */
export async function getAvailableLangs(arbsFolder: string, prefix: string = DEFAULT_ARB_PREFIX): Promise<string[]> {
    try {
        const files = await fs.readdir(arbsFolder);
        const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const langPattern = new RegExp(`^${escapedPrefix}(${LOCALE_TAG})\\.arb$`);

        const langs = files
            .map(file => file.match(langPattern))
            .filter((match): match is RegExpMatchArray => match !== null)
            .map(match => match[1]);

        if (langs.length === 0) {
            console.warn(`[WARN] No valid ARB files found in ${arbsFolder}`);
        }
        return langs;
    } catch (error) {
        console.error(`[ERROR] Failed to read ARB folder: ${error}`);
        return [];
    }
}

/**
 * Updates an ARB file by adding or updating a key-value pair.
 * Existing entries keep their original position, so adding one key produces a
 * one-line diff instead of reordering the whole document.
 * Uses atomicWrite to ensure file integrity.
 */
export async function updateArbFiles(
    arbPath: string, 
    key: string, 
    value: string, 
    backup: boolean = false
): Promise<void> {
    try {
        let currentContent = "";
        try {
            currentContent = await fs.readFile(arbPath, "utf-8");
        } catch (e) {
            // File might not exist yet, we'll create it
        }

        // An existing key is updated in place; a new key is appended at the end.
        const data: Record<string, unknown> = currentContent ? JSON.parse(currentContent) : {};
        data[key] = value;

        await atomicWrite(arbPath, stringifyArb(data, detectArbFormat(currentContent)), backup);
    } catch (error) {
        throw new Error(`Failed to update ARB file at ${arbPath}: ${error}`);
    }
}

/**
 * Reads the contents of a file securely.
 */
export async function readFileContent(filePath: string): Promise<string> {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
        console.error(`[ERROR] Impossible to read the file ${filePath}:`, error);
        return "";
    }
}

/**
 * Updates multiple ARB files at once from a translations object.
 * (e.g., { "en": "Hello", "fr": "Bonjour" })
 */
export async function updateAllArbFiles(
    arbsFolder: string,
    key: string,
    translations: Record<string, string>,
    backup: boolean,
    prefix: string = DEFAULT_ARB_PREFIX
): Promise<void> {
    for (const [lang, value] of Object.entries(translations)) {
        const arbPath = path.join(arbsFolder, `${prefix}${lang}.arb`);
        await updateArbFiles(arbPath, key, value, backup);
    }
}

/**
 * Utility to wrap long-running tasks with a VS Code progress notification.
 */
export async function runWithProgress<T>(
    title: string,
    task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
): Promise<T> {
    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: title,
            cancellable: false
        },
        async (progress) => {
            return await task(progress);
        }
    );
}

/**
 * Executes 'flutter gen-l10n' in `cwd` (the Flutter project root) and waits
 * for the process to exit.
 * Unified version used across the extension.
 *
 * @param cwd Directory to run the command in. Defaults to the shell's own
 *            working directory when omitted.
 * @throws If the command exits with a non-zero status or never starts.
 */
export async function executeGenL10n(cwd?: string): Promise<void> {
    const task = new vscode.Task(
        // 'shell' is a built-in task type, so no `contributes.taskDefinitions` is needed.
        { type: 'shell' },
        vscode.TaskScope.Workspace,
        'gen-l10n',
        'Flutter L10n',
        new vscode.ShellExecution('flutter gen-l10n', cwd ? { cwd } : undefined)
    );
    task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        panel: vscode.TaskPanelKind.Dedicated,
        clear: true
    };

    // Register listeners before starting the task so a fast process cannot
    // finish before the completion events are observed.
    const subscriptions: vscode.Disposable[] = [];
    const exitCode = new Promise<number | undefined>(resolve => {
        subscriptions.push(
            vscode.tasks.onDidEndTaskProcess(event => {
                if (event.execution.task === task) {
                    resolve(event.exitCode);
                }
            }),
            vscode.tasks.onDidEndTask(event => {
                if (event.execution.task === task) {
                    resolve(undefined);
                }
            })
        );
    });

    try {
        await vscode.tasks.executeTask(task);
        const code = await exitCode;
        if (code !== 0) {
            throw new Error(
                `flutter gen-l10n failed${code === undefined ? '' : ` with exit code ${code}`}. ` +
                'Check the "Flutter L10n" task output.'
            );
        }
    } finally {
        subscriptions.forEach(subscription => subscription.dispose());
    }
}