import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as yaml from 'yaml';
import { ConfigurationManager } from '../core/configurationManager'; // Ajuste le chemin

// Mock de fs et yaml
vi.mock('fs');
vi.mock('yaml');

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
      const mockConfig = {
        get: vi.fn((key: string) => {
          if (key === 'apiKey') return '';
          if (key === 'packageName') return 'my_app';
          return undefined;
        }),
      };
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: vscode.Uri.file('/test'), name: 'test', index: 0 }];

      const result = await ConfigurationManager.getConfig();

      expect(result).toBeNull();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("Missing API key"));
    });

    it('should return valid configuration if all fields are present', async () => {
      const mockConfig = {
        get: vi.fn((key: string) => {
          const values: any = {
            apiKey: 'sk-123',
            provider: 'openai',
            model: 'gpt-4o',
            backup: true,
            packageName: 'my_flutter_app'
          };
          return values[key];
        }),
      };
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: vscode.Uri.file('/test'), name: 'test', index: 0 }];

      const result = await ConfigurationManager.getConfig();

      expect(result).toEqual({
        apiKey: 'sk-123',
        provider: 'openai',
        model: 'gpt-4o',
        backup: true,
        packageName: 'my_flutter_app',
        arbsFolder: expect.stringContaining('lib/l10n')
      });
    });

    it('should attempt to auto-detect packageName if missing in settings', async () => {
      // Configuration sans packageName
      const mockConfig = {
        get: vi.fn((key: string) => (key === 'apiKey' ? 'sk-123' : undefined)),
        update: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: vscode.Uri.file('/test'), name: 'test', index: 0 }];

      // Mock de l'existence du pubspec.yaml et de son contenu
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('name: auto_detected_package');
      vi.mocked(yaml.parse).mockReturnValue({ name: 'auto_detected_package' });

      const result = await ConfigurationManager.getConfig();

      expect(result?.packageName).toBe('auto_detected_package');
      expect(mockConfig.update).toHaveBeenCalledWith('packageName', 'auto_detected_package', vscode.ConfigurationTarget.Workspace);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('auto_detected_package'));
    });
  });

  describe('ensurePackageName', () => {
    it('should return empty string if pubspec.yaml does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const mockConfig = { update: vi.fn() };

      const result = await ConfigurationManager.ensurePackageName(mockConfig as any);

      expect(result).toBe('');
      expect(mockConfig.update).not.toHaveBeenCalled();
    });

    it('should parse pubspec.yaml correctly and return the name', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('name: test_project');
      vi.mocked(yaml.parse).mockReturnValue({ name: 'test_project' });
      
      const mockConfig = { update: vi.fn() };
      const result = await ConfigurationManager.ensurePackageName(mockConfig as any);

      expect(result).toBe('test_project');
      expect(mockConfig.update).toHaveBeenCalledWith('packageName', 'test_project', 2); // 2 = Workspace
    });
  });
});