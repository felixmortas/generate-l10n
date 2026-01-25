import * as vscode from 'vscode';
import { L10nProcessor } from "../core/l10nProcessor.js";
import { ConfigurationManager } from "../core/configurationManager.js";
import { executeGenL10n, runWithProgress } from "../core/utils.js";
import { MyTreeDataProvider, FileNode } from "../views/l10nTreeView.js";

export class FilesLocalizationCommand {
  constructor(private treeDataProvider: MyTreeDataProvider) {}

  async execute() {
    const checked = this.treeDataProvider.getCheckedFiles();

    if (checked.length === 0) {
      vscode.window.showWarningMessage('No files are checked.');
      return;
    }

    const extConfig = await ConfigurationManager.getConfig();
    if (!extConfig) return;

    const processor = new L10nProcessor({ ...extConfig, files: checked });

    try {
      await this.runWorkflow(processor, checked);
      vscode.window.showInformationMessage("Processing completed successfully 🎉");
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error: ${err.message}`);
      console.error(err);
    }
  }

  private async runWorkflow(processor: L10nProcessor, checked: string[]) {
    await runWithProgress("Processing files localization", async (progress) => {
      progress.report({ increment: 20, message: `Processing ${checked.length} file(s)...` });
      await processor.localizeFiles();
      
      progress.report({ increment: 70, message: "Running flutter gen-l10n..." });
      await executeGenL10n();
      
      progress.report({ increment: 90, message: "Finalizing..." });
      
      // Mise à jour de l'UI
      this.treeDataProvider.refresh();
      this.resetCheckmarks(checked);
      
      progress.report({ increment: 100, message: "Complete!" });
    });
  }

  private resetCheckmarks(files: string[]) {
    files.forEach(filePath => {
      const fileNode = new FileNode('', filePath, true);
      this.treeDataProvider.toggleCheck(fileNode);
    });
  }
}