import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { arbFilePrefix, DEFAULT_ARB_PREFIX } from './utils.js';

/**
 * Interface defining the structure of the extension configuration.
 */
export interface ExtensionConfiguration {
    apiKey: string;
    provider: string;
    model: string;
    backup: boolean;
    packageName: string;
    /** Flutter project root: the directory containing pubspec.yaml. */
    projectRoot: string;
    arbsFolder: string;
    /** ARB filename prefix derived from `template-arb-file` (e.g. 'app_'). */
    arbFilePrefix: string;
}

/** Flutter defaults, applied when l10n.yaml is absent or incomplete. */
const DEFAULT_ARB_DIR = path.join('lib', 'l10n');
const DEFAULT_TEMPLATE_ARB_FILE = 'app_en.arb';

/** Directories that never contain the Flutter project we are looking for. */
const SKIPPED_DIRS: Record<string, true> = {
    node_modules: true,
    build: true,
    '.dart_tool': true,
    ios: true,
    android: true,
    macos: true,
    windows: true,
    linux: true,
    Pods: true
};

/** How deep below a workspace folder we look for a pubspec.yaml. */
const MAX_SEARCH_DEPTH = 3;

/**
 * Singleton class to handle configuration retrieval and validation.
 */
export class ConfigurationManager {

    /**
     * Retrieves the current configuration.
     * Validates critical fields and attempts to auto-detect the package name if missing.
     * * @returns A promise resolving to the configuration object or null if validation fails.
     */
    public static async getConfig(): Promise<ExtensionConfiguration | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage("No workspace folder is open.");
            return null;
        }

        const config = vscode.workspace.getConfiguration('generateL10n');
        const apiKey = config.get<string>('apiKey') ?? '';
        const provider = config.get<string>('provider') ?? 'mistral';
        const model = config.get<string>('model') ?? 'mistral-large-latest';
        const backup = config.get<boolean>('backup') ?? false;

        if (!apiKey) {
            vscode.window.showErrorMessage("Missing API key. Please set it in the extension settings.");
            return null;
        }

        // resolveProjectRoot reports why discovery failed.
        const projectRoot = this.resolveProjectRoot(config);
        if (!projectRoot) return null;

        // Handle packageName logic
        let packageName = config.get<string>('packageName') ?? '';
        if (!packageName) {
            packageName = await this.ensurePackageName(config, projectRoot);
        }

        if (!packageName) {
            vscode.window.showWarningMessage('No pubspec.yaml found or package name missing. Please set it manually in settings.');
            // We allow proceeding but warn user, or return null based on strictness requirements.
            // For now, let's assume it's critical for generation:
             return null; 
        }

        const l10nOptions = this.readL10nOptions(projectRoot);
        const arbsFolder = path.resolve(projectRoot, l10nOptions.arbDir);

        return {
            apiKey,
            provider,
            model,
            backup,
            packageName,
            projectRoot,
            arbsFolder,
            arbFilePrefix: arbFilePrefix(l10nOptions.templateArbFile)
        };
    }

    /**
     * Resolves the Flutter project root: the `generateL10n.projectRoot` setting
     * when set, otherwise the pubspec.yaml discovered in the workspace.
     * * @param config - The current workspace configuration.
     * @returns The absolute project root, or null when no pubspec.yaml was found.
     */
    public static resolveProjectRoot(config: vscode.WorkspaceConfiguration): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        const configured = (config.get<string>('projectRoot') ?? '').trim();
        if (configured) {
            const root = path.isAbsolute(configured)
                ? configured
                : path.join(workspaceFolders[0].uri.fsPath, configured);

            if (!fs.existsSync(path.join(root, 'pubspec.yaml'))) {
                vscode.window.showErrorMessage(
                    `"generateL10n.projectRoot" points to ${root}, which contains no pubspec.yaml.`
                );
                return null;
            }
            return root;
        }

        const candidates = workspaceFolders.flatMap(folder => this.findFlutterProjects(folder.uri.fsPath));
        if (candidates.length === 0) {
            vscode.window.showErrorMessage(
                'No Flutter project (pubspec.yaml) found in the workspace. ' +
                'Set "generateL10n.projectRoot" to the Flutter project directory.'
            );
            return null;
        }

        // Prefer a project that actually configures localization, then the shallowest one.
        const localized = candidates.filter(root => fs.existsSync(path.join(root, 'l10n.yaml')));
        const preferred = localized.length > 0 ? localized : candidates;

        if (preferred.length > 1) {
            vscode.window.showWarningMessage(
                `Multiple Flutter projects found; using ${preferred[0]}. ` +
                'Set "generateL10n.projectRoot" to choose another one.'
            );
        }
        return preferred[0];
    }

    /**
     * Finds directories containing a pubspec.yaml, breadth-first so that the
     * shallowest projects come first.
     */
    private static findFlutterProjects(root: string): string[] {
        const found: string[] = [];
        let level = [root];

        for (let depth = 0; depth <= MAX_SEARCH_DEPTH && level.length > 0; depth++) {
            const nextLevel: string[] = [];

            for (const dir of level) {
                if (fs.existsSync(path.join(dir, 'pubspec.yaml'))) {
                    // A Flutter package never nests another one we care about.
                    found.push(dir);
                    continue;
                }

                let entries: fs.Dirent[];
                try {
                    entries = fs.readdirSync(dir, { withFileTypes: true });
                } catch {
                    continue;
                }

                for (const entry of entries) {
                    if (!entry.isDirectory() || entry.name.startsWith('.') || SKIPPED_DIRS[entry.name]) continue;
                    nextLevel.push(path.join(dir, entry.name));
                }
            }

            level = nextLevel;
        }

        return found;
    }

    /**
     * Reads the localization options Flutter itself uses, from l10n.yaml.
     * * @param projectRoot - The Flutter project root.
     * @returns The configured `arb-dir` and `template-arb-file`, or Flutter's defaults.
     */
    public static readL10nOptions(projectRoot: string): { arbDir: string; templateArbFile: string } {
        const l10nPath = path.join(projectRoot, 'l10n.yaml');

        if (!fs.existsSync(l10nPath)) {
            return { arbDir: DEFAULT_ARB_DIR, templateArbFile: DEFAULT_TEMPLATE_ARB_FILE };
        }

        try {
            const parsed: unknown = yaml.parse(fs.readFileSync(l10nPath, 'utf8'));
            const options = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
            const arbDir = options['arb-dir'];
            const templateArbFile = options['template-arb-file'];

            return {
                arbDir: typeof arbDir === 'string' && arbDir ? arbDir : DEFAULT_ARB_DIR,
                templateArbFile: typeof templateArbFile === 'string' && templateArbFile
                    ? templateArbFile
                    : DEFAULT_TEMPLATE_ARB_FILE
            };
        } catch (error) {
            console.error('Error reading l10n.yaml:', error);
            return { arbDir: DEFAULT_ARB_DIR, templateArbFile: DEFAULT_TEMPLATE_ARB_FILE };
        }
    }

    /**
     * Tries to fetch the package name from pubspec.yaml and updates the workspace configuration.
     * * @param config - The current workspace configuration.
     * @param projectRoot - The Flutter project root containing pubspec.yaml.
     * @returns The detected package name or an empty string.
     */
    public static async ensurePackageName(config: vscode.WorkspaceConfiguration, projectRoot?: string): Promise<string> {
        const root = projectRoot ?? this.resolveProjectRoot(config);
        const flutterProjectName = root ? this.getFlutterProjectName(root) : null;

        if (flutterProjectName) {
            await config.update('packageName', flutterProjectName, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`Flutter project detected: ${flutterProjectName}`);
            return flutterProjectName;
        }
        
        return '';
    }

    /**
     * Reads the Flutter project name from pubspec.yaml.
     * * @param projectRoot - The Flutter project root containing pubspec.yaml.
     * @returns The project name or null if not found.
     */
    private static getFlutterProjectName(projectRoot: string): string | null {
        const pubspecPath = path.join(projectRoot, 'pubspec.yaml');

        if (!fs.existsSync(pubspecPath)) {
            return null;
        }

        try {
            const content = fs.readFileSync(pubspecPath, 'utf8');
            const parsed = yaml.parse(content);
            return parsed.name || null;
        } catch (error) {
            console.error('Error reading pubspec.yaml:', error);
            return null;
        }
    }
}
