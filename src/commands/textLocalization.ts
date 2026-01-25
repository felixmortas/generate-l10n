import * as vscode from 'vscode';
import { L10nProcessor } from "../core/l10nProcessor.js";
import { ConfigurationManager } from "../core/configurationManager.js";
import { isValidFlutterString, executeGenL10n, runWithProgress } from "../core/utils.js";

export class TextLocalizationCommand {
  /**
   * Main entry point for the order
   */
  static async run(executeGen: boolean) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!this.validateSelection(selectedText)) return;

    const extConfig = await ConfigurationManager.getConfig();
    if (!extConfig) return;

    const processor = new L10nProcessor({ ...extConfig, files: [] });

    try {
      await this.executeWorkflow(editor, selection, selectedText, processor, executeGen);
      vscode.window.showInformationMessage("Text localized successfully!");
    } catch (err: any) {
      vscode.window.showErrorMessage(`L10n Error: ${err.message}`);
    }
  }

  /**
   * Confirming your selection
   */
  private static validateSelection(text: string): boolean {
    if (!text) {
      vscode.window.showWarningMessage("No text selected.");
      return false;
    }
    if (!isValidFlutterString(text)) {
      vscode.window.showErrorMessage("Invalid selection: Please select a string with quotation marks.");
      return false;
    }
    return true;
  }

  /**
   * Orchestrating progress and actions
   */
  private static async executeWorkflow(
    editor: vscode.TextEditor, 
    selection: vscode.Selection, 
    text: string, 
    processor: L10nProcessor, 
    runGen: boolean
  ) {
    await runWithProgress("Localizing selection...", async (progress) => {
      const replacement = await processor.processSelectedText(text);

      await editor.edit(editBuilder => {
        editBuilder.replace(selection, replacement);
      });

      if (runGen) {
        progress.report({ message: "Running flutter gen-l10n..." });
        await executeGenL10n();
      }
    });
  }
}