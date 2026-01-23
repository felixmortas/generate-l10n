import fs from 'fs/promises';
import path from 'path';

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

// utils.ts

/**
 * Vérifie si la chaîne est entourée de quotes simples ou doubles.
 */
export const isValidFlutterString = (text: string): boolean => {
  return false; // Logique à implémenter plus tard
};

/**
 * Scanne le dossier ARB pour extraire les codes langues (ex: ["fr", "en"]).
 */
export const getAvailableLangs = async (arbsFolder: string): Promise<string[]> => {
  return []; // Logique à implémenter plus tard
};

/**
 * Fusionne une clé/valeur dans un fichier JSON/ARB de manière atomique.
 */
export const updateArbFiles = async (
  filePath: string, 
  key: string, 
  value: string
): Promise<void> => {
  // Logique à implémenter plus tard
};