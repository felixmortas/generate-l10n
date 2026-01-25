import * as vscode from 'vscode';

/**
 * Provides Code Actions (Quick Fixes) when text is selected in Dart files.
 */
export class L10nCodeActionProvider implements vscode.CodeActionProvider {
  /**
   * Returns a list of code actions for the given document range.
   */
  provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
    // Do not show actions if the selection is empty
    if (range.isEmpty) { return []; }

    const action = new vscode.CodeAction('Auto-L10n: Localize Text', vscode.CodeActionKind.QuickFix);
    action.command = { 
      command: 'generateL10n.localizeText', 
      title: 'Auto-L10n: Localize Text' 
    };

    const actionExec = new vscode.CodeAction('Auto-L10n: Localize & Build', vscode.CodeActionKind.QuickFix);
    actionExec.command = { 
      command: 'generateL10n.localizeTextAndGenerate', 
      title: 'Auto-L10n: Localize & Build' 
    };

    return [action, actionExec];
  }
}