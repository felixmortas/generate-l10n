import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { FilesLocalizationCommand } from '../commands/filesLocalization';
import { MyTreeDataProvider } from '../views/l10nTreeView';
import { ConfigurationManager } from '../core/configurationManager';
import { L10nProcessor } from '../core/l10nProcessor';
import * as utils from '../core/utils';

// Mocks des classes et utilitaires
vi.mock('../core/configurationManager');
vi.mock('../core/l10nProcessor');
vi.mock('../core/llmClient'); // Mocké pour éviter les appels réseau
vi.mock('../core/llmService');
vi.mock('../core/utils', () => ({
  executeGenL10n: vi.fn().mockResolvedValue(undefined),
  runWithProgress: vi.fn().mockImplementation(async (title, task) => {
    // On simule le passage du callback progress
    return await task({ report: vi.fn() });
  }),
}));

describe('FilesLocalizationCommand', () => {
  let mockTreeDataProvider: any;
  let command: FilesLocalizationCommand;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup du mock TreeDataProvider
    mockTreeDataProvider = {
      getCheckedFiles: vi.fn(),
      refresh: vi.fn(),
      toggleCheck: vi.fn(),
    };

    command = new FilesLocalizationCommand(mockTreeDataProvider as unknown as MyTreeDataProvider);
  });

  it('should show a warning if no files are checked', async () => {
    mockTreeDataProvider.getCheckedFiles.mockReturnValue([]);

    await command.execute();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No files are checked.');
  });

  it('should abort if configuration is missing', async () => {
    mockTreeDataProvider.getCheckedFiles.mockReturnValue(['/file1.dart']);
    vi.mocked(ConfigurationManager.getConfig).mockResolvedValue(null);

    await command.execute();

    // On vérifie qu'on n'est pas allé plus loin (L10nProcessor non instancié)
    expect(L10nProcessor).not.toHaveBeenCalled();
  });

  it('should run the full workflow successfully', async () => {
    // 1. Setup des mocks
    const checkedFiles = ['/path/to/file.dart'];
    mockTreeDataProvider.getCheckedFiles.mockReturnValue(checkedFiles);
    
    vi.mocked(ConfigurationManager.getConfig).mockResolvedValue({
      provider: 'mistral',
      model: 'large',
      apiKey: 'fake-key',
      // ... autres propriétés nécessaires
    } as any);

    // Mock de la méthode localizeFiles du processeur
    const mockLocalizeFiles = vi.fn().mockResolvedValue(undefined);
    vi.mocked(L10nProcessor).mockImplementation(() => ({
      localizeFiles: mockLocalizeFiles,
    } as any));

    // 2. Execution
    await command.execute();

    // 3. Vérifications (Assertions)
    
    // Vérifie que le processeur a été appelé
    expect(mockLocalizeFiles).toHaveBeenCalled();
    
    // Vérifie que la commande Flutter gen-l10n a été lancée
    expect(utils.executeGenL10n).toHaveBeenCalled();
    
    // Vérifie que l'UI a été rafraîchie
    expect(mockTreeDataProvider.refresh).toHaveBeenCalled();
    
    // Vérifie que les checkmarks ont été réinitialisés
    expect(mockTreeDataProvider.toggleCheck).toHaveBeenCalledTimes(checkedFiles.length);

    // Vérifie le message de succès
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("completed successfully")
    );
  });

  it('should show an error message if the workflow fails', async () => {
    mockTreeDataProvider.getCheckedFiles.mockReturnValue(['/file.dart']);
    vi.mocked(ConfigurationManager.getConfig).mockResolvedValue({ apiKey: 'key' } as any);
    
    // Simuler une erreur dans le processeur
    vi.mocked(L10nProcessor).mockImplementation(() => ({
      localizeFiles: vi.fn().mockRejectedValue(new Error("API Timeout")),
    } as any));

    await command.execute();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("Error: API Timeout")
    );
  });
});