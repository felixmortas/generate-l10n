import * as vscode from 'vscode';
import { L10nProcessor } from "./core/l10nProcessor.js";
import { isValidFlutterString, executeGenL10n, runWithProgress } from "./core/utils.js";
import { ConfigurationManager } from "./core/configurationManager.js";
import { MyTreeDataProvider, FileNode } from "./views/l10nTreeView.js";
import { L10nCodeActionProvider } from "./providers/l10nCodeActionProvider.js";
import { TextLocalizationCommand } from './commands/textLocalization.js';

 /**
 * Activates the extension when VSCode loads it.
 * Registers commands for toggling files, processing selected files, and opening the extension settings.
 * @param context - VSCode extension context.
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('Extension activated!');

  // Initialize packageName from pubspec.yaml if not set
  const config = vscode.workspace.getConfiguration('generateL10n');
  if (!config.get<string>('packageName')) {
      await ConfigurationManager.ensurePackageName(config);
  }

  const treeDataProvider = new MyTreeDataProvider(context);

  // Create a tree view in the side panel for localization files
  const view = vscode.window.createTreeView('generateL10nView', {
    treeDataProvider
  });

  /**
   * Command: toggleCheck
   * Toggles the check state of a file in the tree view.
   */
  const toggleCheck = vscode.commands.registerCommand('generateL10n.toggleCheck', (node: FileNode) => {
    treeDataProvider.toggleCheck(node);
  });
  context.subscriptions.push(toggleCheck);

  /**
   * Command: localizeSelectedFiles
   * Processes all checked localization files using L10nProcessor and the configured AI provider/model.
   */
  const localizeSelectedFiles = vscode.commands.registerCommand('generateL10n.localizeSelectedFiles', async () => {
    const checked = treeDataProvider.getCheckedFiles();

    if (checked.length === 0) {
      vscode.window.showWarningMessage('No files are checked.');
      return;
    }

    // Get configuration from extension settings
    const extConfig = await ConfigurationManager.getConfig();
    if (!extConfig) {
        // Errors are already handled/displayed inside getConfig
        return; 
    }
    
    const processor = new L10nProcessor({
      ...extConfig,
      files: checked,
    });

    try {
      await runWithProgress("Processing localization files", async (progress) => {
        progress.report({ increment: 0, message: "Initializing..." });
        
        progress.report({ increment: 20, message: `Processing ${checked.length} file(s)...` });
        await processor.processFiles();
        
        progress.report({ increment: 50, message: "Files processed successfully" });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        progress.report({ increment: 70, message: "Running flutter gen-l10n..." });
        await executeGenL10n();
        
        progress.report({ increment: 90, message: "Finalizing..." });
        
        treeDataProvider.refresh();
        checked.forEach(filePath => {
          const fileNode = new FileNode('', filePath, true);
          treeDataProvider.toggleCheck(fileNode);
        });
        
        progress.report({ increment: 100, message: "Complete!" });
      });

      vscode.window.showInformationMessage("Processing completed successfully 🎉");
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error: ${err.message}`);
      console.error(err);
    }
  });

  context.subscriptions.push(localizeSelectedFiles);

  // Commands recording
  context.subscriptions.push(
    vscode.commands.registerCommand('generateL10n.localizeText', () => TextLocalizationCommand.run(false)),
    vscode.commands.registerCommand('generateL10n.localizeTextAndGenerate', () => TextLocalizationCommand.run(true))
  );

  // Registering a CodeActionProvider to display the light bulb (Quick Fix)
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider('dart', new L10nCodeActionProvider(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
    })
  );

  /**
   * Command: refreshTreeView
   * Refreshes the tree view to reflect any changes in the file system.
   */
  const refreshTreeView = vscode.commands.registerCommand('generateL10n.refreshTreeView', () => {
    treeDataProvider.refresh();
  });
  context.subscriptions.push(refreshTreeView);

  /**
   * Command: configureExtension
   * Opens the extension's settings page for the user to configure API key, provider, and model.
   */
  const configureExtension = vscode.commands.registerCommand("generateL10n.configureExtension", async () => {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "generateL10n"
    );
  });
  context.subscriptions.push(configureExtension);
}

/** Called when the extension is deactivated */
export function deactivate() {}
