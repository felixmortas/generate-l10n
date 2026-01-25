import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

/**
 * Interface defining the structure of the extension configuration.
 */
export interface ExtensionConfiguration {
    apiKey: string;
    provider: string;
    model: string;
    backup: boolean;
    packageName: string;
    arbsFolder: string;
}

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
        
        // Handle packageName logic
        let packageName = config.get<string>('packageName') ?? '';
        if (!packageName) {
            packageName = await this.ensurePackageName(config);
        }

        if (!apiKey) {
            vscode.window.showErrorMessage("Missing API key. Please set it in the extension settings.");
            return null;
        }

        if (!packageName) {
            vscode.window.showWarningMessage('No pubspec.yaml found or package name missing. Please set it manually in settings.');
            // We allow proceeding but warn user, or return null based on strictness requirements.
            // For now, let's assume it's critical for generation:
             return null; 
        }

        const arbsFolder = path.join(workspaceFolders[0].uri.fsPath, 'lib/l10n');

        return {
            apiKey,
            provider,
            model,
            backup,
            packageName,
            arbsFolder
        };
    }

    /**
     * Tries to fetch the package name from pubspec.yaml and updates the workspace configuration.
     * * @param config - The current workspace configuration.
     * @returns The detected package name or an empty string.
     */
    public static async ensurePackageName(config: vscode.WorkspaceConfiguration): Promise<string> {
        const flutterProjectName = this.getFlutterProjectName();

        if (flutterProjectName) {
            await config.update('packageName', flutterProjectName, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`Flutter project detected: ${flutterProjectName}`);
            return flutterProjectName;
        }
        
        return '';
    }

    /**
     * Reads the Flutter project name from pubspec.yaml.
     * * @returns The project name or null if not found.
     */
    private static getFlutterProjectName(): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        // Search for pubspec.yaml in the workspace root
        const pubspecPath = path.join(workspaceFolders[0].uri.fsPath, 'pubspec.yaml');

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