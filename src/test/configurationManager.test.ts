import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { ConfigurationManager } from '../core/configurationManager'; // Ajuste le chemin

// Mock de fs et yaml
vi.mock('fs');
vi.mock('yaml');

/**
 * Describes a virtual file system: `files` are the paths that exist,
 * `dirs` the sub-directories returned by readdirSync for a given path.
 */
const mockFileSystem = (files: string[], dirs: Record<string, string[]> = {}) => {
  vi.mocked(fs.existsSync).mockImplementation(target => files.includes(String(target)));
  vi.mocked(fs.readdirSync).mockImplementation(target => {
    const names = dirs[String(target)] ?? [];
    return names.map(name => ({ name, isDirectory: () => true })) as unknown as fs.Dirent[];
  });
};

const settings = (values: Record<string, unknown>) => {
  const mockConfig = {
    get: vi.fn((key: string) => values[key]),
    update: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
    mockConfig as unknown as vscode.WorkspaceConfiguration
  );
  return mockConfig;
};

const openWorkspace = (...roots: string[]) => {
  vi.mocked(vscode.workspace).workspaceFolders = roots.map((root, index) => ({
    uri: vscode.Uri.file(root),
    name: path.basename(root),
    index,
  }));
};

describe('ConfigurationManager', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getConfig', () => {
    
    it('should return null and show error if no workspace folder is open', async () => {
      // On simule l'absence de dossier de travail
      vi.mocked(vscode.workspace).workspaceFolders = undefined;

      const config = await ConfigurationManager.getConfig();

      expect(config).toBeNull();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("No workspace folder is open.");
    });

    it('should return null if API key is missing', async () => {
      // Configuration sans clé API
      settings({ apiKey: '', packageName: 'my_app' });
      openWorkspace('/test');

      const result = await ConfigurationManager.getConfig();

      expect(result).toBeNull();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("Missing API key"));
    });

    it('should return null if no pubspec.yaml can be found', async () => {
      settings({ apiKey: 'sk-123', packageName: 'my_app' });
      openWorkspace('/test');
      mockFileSystem([]);

      const result = await ConfigurationManager.getConfig();

      expect(result).toBeNull();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('No Flutter project (pubspec.yaml) found')
      );
    });

    it('should return valid configuration if all fields are present', async () => {
      settings({
        apiKey: 'sk-123',
        provider: 'openai',
        model: 'gpt-4o',
        backup: true,
        packageName: 'my_flutter_app',
      });
      openWorkspace('/test');
      mockFileSystem(['/test/pubspec.yaml']);

      const result = await ConfigurationManager.getConfig();

      expect(result).toEqual({
        apiKey: 'sk-123',
        provider: 'openai',
        model: 'gpt-4o',
        backup: true,
        packageName: 'my_flutter_app',
        projectRoot: '/test',
        arbsFolder: path.join('/test', 'lib', 'l10n'),
        arbFilePrefix: 'app_'
      });
    });

    it('should attempt to auto-detect packageName if missing in settings', async () => {
      // Configuration sans packageName
      const mockConfig = settings({ apiKey: 'sk-123' });
      openWorkspace('/test');

      // Mock de l'existence du pubspec.yaml et de son contenu
      mockFileSystem(['/test/pubspec.yaml']);
      vi.mocked(fs.readFileSync).mockReturnValue('name: auto_detected_package');
      vi.mocked(yaml.parse).mockReturnValue({ name: 'auto_detected_package' });

      const result = await ConfigurationManager.getConfig();

      expect(result?.packageName).toBe('auto_detected_package');
      expect(mockConfig.update).toHaveBeenCalledWith('packageName', 'auto_detected_package', vscode.ConfigurationTarget.Workspace);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('auto_detected_package'));
    });

    it('should honor arb-dir and template-arb-file from l10n.yaml', async () => {
      settings({ apiKey: 'sk-123', packageName: 'my_app' });
      openWorkspace('/test');
      mockFileSystem(['/test/pubspec.yaml', '/test/l10n.yaml']);
      vi.mocked(yaml.parse).mockReturnValue({
        'arb-dir': 'lib/src/localization',
        'template-arb-file': 'intl_en.arb',
      });

      const result = await ConfigurationManager.getConfig();

      expect(result?.arbsFolder).toBe(path.join('/test', 'lib', 'src', 'localization'));
      expect(result?.arbFilePrefix).toBe('intl_');
    });

    it('should find a Flutter project nested below the workspace root', async () => {
      settings({ apiKey: 'sk-123', packageName: 'my_app' });
      openWorkspace('/repo');
      mockFileSystem(
        ['/repo/client/pubspec.yaml', '/repo/client/l10n.yaml'],
        { '/repo': ['client', 'firebase', 'docs'] }
      );
      vi.mocked(yaml.parse).mockReturnValue({ 'arb-dir': 'lib/l10n', 'template-arb-file': 'app_en.arb' });

      const result = await ConfigurationManager.getConfig();

      expect(result?.projectRoot).toBe(path.join('/repo', 'client'));
      expect(result?.arbsFolder).toBe(path.join('/repo', 'client', 'lib', 'l10n'));
    });

    it('should prefer the project configuring l10n.yaml when several exist', async () => {
      settings({ apiKey: 'sk-123', packageName: 'my_app' });
      openWorkspace('/repo');
      mockFileSystem(
        ['/repo/tool/pubspec.yaml', '/repo/client/pubspec.yaml', '/repo/client/l10n.yaml'],
        { '/repo': ['tool', 'client'] }
      );

      const result = await ConfigurationManager.getConfig();

      expect(result?.projectRoot).toBe(path.join('/repo', 'client'));
      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('should use the second workspace folder when it holds the Flutter project', async () => {
      settings({ apiKey: 'sk-123', packageName: 'my_app' });
      openWorkspace('/docs', '/app');
      mockFileSystem(['/app/pubspec.yaml']);

      const result = await ConfigurationManager.getConfig();

      expect(result?.projectRoot).toBe('/app');
    });
    it('should rank a root-level project in the second workspace above a nested first-folder project', async () => {
      settings({ apiKey: 'sk-123', packageName: 'my_app' });
      openWorkspace('/first', '/second');
      mockFileSystem(
        ['/first/client/pubspec.yaml', '/second/pubspec.yaml'],
        { '/first': ['client'] }
      );

      const result = await ConfigurationManager.getConfig();

      expect(result?.projectRoot).toBe('/second');
    });
  });

  describe('resolveProjectRoot', () => {
    it('should resolve a relative projectRoot setting against the workspace', () => {
      const mockConfig = settings({ projectRoot: 'client' });
      openWorkspace('/repo');
      mockFileSystem([path.join('/repo', 'client', 'pubspec.yaml')]);

      const root = ConfigurationManager.resolveProjectRoot(
        mockConfig as unknown as vscode.WorkspaceConfiguration
      );

      expect(root).toBe(path.join('/repo', 'client'));
      // The workspace root itself must not be scanned when the setting is explicit.
      expect(fs.readdirSync).not.toHaveBeenCalled();
    });
    it('should resolve a relative projectRoot setting against the first matching workspace folder', () => {
      const mockConfig = settings({ projectRoot: 'client' });
      openWorkspace('/docs', '/app');
      mockFileSystem(['/app/client/pubspec.yaml']);

      const root = ConfigurationManager.resolveProjectRoot(
        mockConfig as unknown as vscode.WorkspaceConfiguration
      );

      expect(root).toBe(path.join('/app', 'client'));
      expect(fs.readdirSync).not.toHaveBeenCalled();
    });

    it('should list every attempted workspace folder when a relative projectRoot is missing', () => {
      const mockConfig = settings({ projectRoot: 'client' });
      openWorkspace('/docs', '/app');
      mockFileSystem([]);

      const root = ConfigurationManager.resolveProjectRoot(
        mockConfig as unknown as vscode.WorkspaceConfiguration
      );

      expect(root).toBeNull();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Tried: /docs/client, /app/client.')
      );
    });

    it('should sort discovery candidates regardless of filesystem entry order', () => {
      const mockConfig = settings({});
      openWorkspace('/repo');
      mockFileSystem(
        ['/repo/alpha/pubspec.yaml', '/repo/zeta/pubspec.yaml'],
        { '/repo': ['zeta', 'alpha'] }
      );

      const root = ConfigurationManager.resolveProjectRoot(
        mockConfig as unknown as vscode.WorkspaceConfiguration
      );

      expect(root).toBe(path.join('/repo', 'alpha'));
    });

    it('should not skip a project in a directory named after an Object prototype property', () => {
      const mockConfig = settings({});
      openWorkspace('/repo');
      mockFileSystem(
        ['/repo/constructor/pubspec.yaml'],
        { '/repo': ['constructor'] }
      );

      const root = ConfigurationManager.resolveProjectRoot(
        mockConfig as unknown as vscode.WorkspaceConfiguration
      );

      expect(root).toBe(path.join('/repo', 'constructor'));
    });

    it('should reject a projectRoot setting without pubspec.yaml', () => {
      const mockConfig = settings({ projectRoot: '/elsewhere' });
      openWorkspace('/repo');
      mockFileSystem([]);

      const root = ConfigurationManager.resolveProjectRoot(
        mockConfig as unknown as vscode.WorkspaceConfiguration
      );

      expect(root).toBeNull();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('contains no pubspec.yaml')
      );
    });

    it('should warn and pick the first project when the choice is ambiguous', () => {
      const mockConfig = settings({});
      openWorkspace('/repo');
      mockFileSystem(
        ['/repo/a/pubspec.yaml', '/repo/b/pubspec.yaml'],
        { '/repo': ['a', 'b'] }
      );

      const root = ConfigurationManager.resolveProjectRoot(
        mockConfig as unknown as vscode.WorkspaceConfiguration
      );

      expect(root).toBe(path.join('/repo', 'a'));
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('Multiple Flutter projects found')
      );
    });
  });

  describe('readL10nOptions', () => {
    it('should fall back to Flutter defaults when l10n.yaml is absent', () => {
      mockFileSystem([]);

      expect(ConfigurationManager.readL10nOptions('/test')).toEqual({
        arbDir: path.join('lib', 'l10n'),
        templateArbFile: 'app_en.arb',
      });
    });

    it('should fall back to Flutter defaults when l10n.yaml is malformed', () => {
      mockFileSystem(['/test/l10n.yaml']);
      vi.mocked(yaml.parse).mockImplementation(() => { throw new Error('bad yaml'); });

      expect(ConfigurationManager.readL10nOptions('/test')).toEqual({
        arbDir: path.join('lib', 'l10n'),
        templateArbFile: 'app_en.arb',
      });
    });
  });

  describe('ensurePackageName', () => {
    it('should return empty string if pubspec.yaml does not exist', async () => {
      const mockConfig = settings({});
      openWorkspace('/test');
      mockFileSystem([]);

      const result = await ConfigurationManager.ensurePackageName(
        mockConfig as unknown as vscode.WorkspaceConfiguration
      );

      expect(result).toBe('');
      expect(mockConfig.update).not.toHaveBeenCalled();
    });

    it('should parse pubspec.yaml correctly and return the name', async () => {
      const mockConfig = settings({});
      openWorkspace('/test');
      mockFileSystem(['/test/pubspec.yaml']);
      vi.mocked(fs.readFileSync).mockReturnValue('name: test_project');
      vi.mocked(yaml.parse).mockReturnValue({ name: 'test_project' });

      const result = await ConfigurationManager.ensurePackageName(
        mockConfig as unknown as vscode.WorkspaceConfiguration
      );

      expect(result).toBe('test_project');
      expect(mockConfig.update).toHaveBeenCalledWith('packageName', 'test_project', 2); // 2 = Workspace
    });
  });
});
