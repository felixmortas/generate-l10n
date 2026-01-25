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
 * Merges two JSON strings by:
 * - Parsing both into objects.
 * - Combining them with preference for keys in `existingJson`.
 * - Returns a pretty-printed merged JSON string.
 *
 * If parsing fails, returns `existingJson` unchanged.
 */
export function mergeJsonStrings(existingJson: string, newJson: string): string {
    try {
        console.debug('[DEBUG] Merging JSON files...');
        const existingData = existingJson ? JSON.parse(existingJson) : {};
        const newData = newJson ? JSON.parse(newJson) : {};
        // Preserve original keys by spreading newData first, then existingData
        const merged = { ...newData, ...existingData };
        return JSON.stringify(merged, null, 2);
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
 * Scans the l10n folder to extract available language tags.
 * It looks for files matching the pattern 'app_xx.arb'.
 * @param arbsFolder Path to the folder containing .arb files.
 * @returns A list of language tags like ["en", "fr", "es"].
 */
export async function getAvailableLangs(arbsFolder: string): Promise<string[]> {
    try {
        const files = await fs.readdir(arbsFolder);
        const langPattern = /^app_([a-z]{2,3}(_[A-Z]{2,4})?)\.arb$/;
        
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
 * Uses atomicWrite to ensure file integrity.
 */
export async function updateArbFiles(
    arbPath: string, 
    key: string, 
    value: string, 
    backup: boolean = false
): Promise<void> {
    try {
        let currentContent = "{}";
        try {
            currentContent = await fs.readFile(arbPath, "utf-8");
        } catch (e) {
            // File might not exist yet, we'll create it
        }

        const data = JSON.parse(currentContent);
        data[key] = value;
        
        // Sorting keys alphabetically is a common best practice for ARB files
        const sortedData = Object.keys(data)
            .sort()
            .reduce((acc: any, k) => {
                acc[k] = data[k];
                return acc;
            }, {});

        await atomicWrite(arbPath, JSON.stringify(sortedData, null, 2), backup);
    } catch (error) {
        throw new Error(`Failed to update ARB file at ${arbPath}: ${error}`);
    }
}

/**
 * Executes the 'flutter gen-l10n' command in a VS Code terminal.
 * It searches for an existing terminal or creates a new one.
 */
export async function executeGenL10n(): Promise<void> {
    const terminalName = 'Flutter L10n';
    let terminal = vscode.window.terminals.find(t => t.name === terminalName);
    
    if (!terminal) {
        terminal = vscode.window.createTerminal(terminalName);
    }

    terminal.show();
    terminal.sendText('flutter gen-l10n');
    
    // We return a promise that waits a little while to let the command start.
    return new Promise(resolve => setTimeout(resolve, 2000));
}