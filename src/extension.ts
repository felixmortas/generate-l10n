import * as vscode from 'vscode';
import { ConfigurationManager } from "./core/configurationManager.js";
import { MyTreeDataProvider, FileNode } from "./views/l10nTreeView.js";
import { L10nCodeActionProvider } from "./providers/l10nCodeActionProvider.js";
import { TextLocalizationCommand } from './commands/textLocalization.js';
import { FilesLocalizationCommand } from './commands/filesLocalization.js';

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
  const localizeFilesCmd = new FilesLocalizationCommand(treeDataProvider);

  // Create a tree view in the side panel for localization files
  const view = vscode.window.createTreeView('generateL10nView', {
    treeDataProvider
  });

  // Commands recording
  context.subscriptions.push(
    vscode.commands.registerCommand('generateL10n.localizeSelectedFiles', () => localizeFilesCmd.execute()),
    vscode.commands.registerCommand('generateL10n.localizeText', () => TextLocalizationCommand.run(false)),
    vscode.commands.registerCommand('generateL10n.localizeTextAndGenerate', () => TextLocalizationCommand.run(true)),
    vscode.commands.registerCommand('generateL10n.toggleCheck', (node: FileNode) => treeDataProvider.toggleCheck(node)),
    vscode.commands.registerCommand('generateL10n.refreshTreeView', () => treeDataProvider.refresh()),
    vscode.commands.registerCommand("generateL10n.configureExtension", async () => {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "generateL10n"
      );
    }),
    vscode.languages.registerCodeActionsProvider('dart', new L10nCodeActionProvider(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
    })
  );
}

/** Called when the extension is deactivated */
export function deactivate() {}
