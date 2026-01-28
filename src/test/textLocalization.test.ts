import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { TextLocalizationCommand } from '../commands/textLocalization'; // Ajuste le chemin
import { ConfigurationManager } from '../core/configurationManager';
import { L10nProcessor } from '../core/l10nProcessor';
import * as utils from '../core/utils';

// Mocks des dépendances complexes
vi.mock('../core/llmClient');
vi.mock('../core/llmService');
vi.mock('../core/l10nProcessor');

describe('TextLocalizationCommand', () => {
  
  // Setup des mocks de base avant chaque test
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock de la configuration par défaut
    vi.spyOn(ConfigurationManager, 'getConfig').mockResolvedValue({
      provider: 'mistral',
      model: 'mistral-large',
      apiKey: 'fake-key',
      mainArbFilePath: 'app_en.arb'
    } as any);

    // Mock de l'utilitaire de validation (doit retourner true par défaut)
    vi.spyOn(utils, 'isValidFlutterString').mockReturnValue(true);
    vi.spyOn(utils, 'runWithProgress').mockImplementation(async (title, task) => {
      return await task({ report: vi.fn() });
    });
    vi.spyOn(utils, 'executeGenL10n').mockResolvedValue(undefined);
  });

  it('should abort if no active editor is found', async () => {
    // Force activeTextEditor à undefined
    (vscode.window as any).activeTextEditor = undefined;
    
    await TextLocalizationCommand.run(false);
    
    expect(ConfigurationManager.getConfig).not.toHaveBeenCalled();
  });

  it('should show warning if selected text is empty', async () => {
    // Mock d'un éditeur avec une sélection vide
    (vscode.window as any).activeTextEditor = {
      selection: {},
      document: { getText: vi.fn().mockReturnValue("") }
    };

    await TextLocalizationCommand.run(false);

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith("No text selected.");
  });

  it('should show error if string is not a valid Flutter string', async () => {
    (vscode.window as any).activeTextEditor = {
      selection: {},
      document: { getText: vi.fn().mockReturnValue("invalid string") }
    };
    vi.spyOn(utils, 'isValidFlutterString').mockReturnValue(false);

    await TextLocalizationCommand.run(false);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining("Invalid selection")
    );
  });

  it('should execute the full workflow and replace text', async () => {
    // 1. Setup l'éditeur avec du texte sélectionné
    const mockEdit = vi.fn().mockImplementation((callback) => {
      const builder = { replace: vi.fn() };
      callback(builder);
      return Promise.resolve(true);
    });

    (vscode.window as any).activeTextEditor = {
      selection: { start: { line: 0 }, end: { line: 0 } },
      document: { getText: vi.fn().mockReturnValue("'Hello'") },
      edit: mockEdit
    };

    // 2. Mock du processeur pour simuler une transformation réussie
    const mockReplacement = "AppLocalizations.of(context)!.hello";
    const localizeSpy = vi.spyOn(L10nProcessor.prototype, 'localizeSelectedText')
                          .mockResolvedValue(mockReplacement);

    // 3. Exécution
    await TextLocalizationCommand.run(true);

    // 4. Vérifications
    expect(localizeSpy).toHaveBeenCalledWith("'Hello'");
    expect(mockEdit).toHaveBeenCalled();
    expect(utils.executeGenL10n).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith("Text localized successfully!");
  });

  it('should handle errors during the workflow', async () => {
    (vscode.window as any).activeTextEditor = {
      selection: {},
      document: { getText: vi.fn().mockReturnValue("'Error Case'") },
      edit: vi.fn()
    };

    vi.spyOn(L10nProcessor.prototype, 'localizeSelectedText')
      .mockRejectedValue(new Error("API Timeout"));

    await TextLocalizationCommand.run(false);

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("L10n Error: API Timeout");
  });

});