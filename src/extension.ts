import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension activée !');

  const treeDataProvider = new MyTreeDataProvider(context);
  const view = vscode.window.createTreeView('myExtensionView', {
    treeDataProvider,
    canSelectMany: true // IMPORTANT : permet la sélection multiple
  });

  // Commande pour traiter les fichiers sélectionnés
  const processSelectedFiles = vscode.commands.registerCommand('myExtension.processSelectedFiles', async () => {
    const selected = view.selection; // Récupère les éléments sélectionnés

    if (selected.length === 0) {
      vscode.window.showWarningMessage('Aucun fichier sélectionné.');
      return;
    }

    // Ici, tu peux traiter les fichiers sélectionnés
    vscode.window.showInformationMessage(
      `Fichiers sélectionnés : ${selected.join(', ')}`
    );

    // Exemple : tu peux passer les chemins à une fonction
    // await processFiles(selected);
  });
}

// Un exemple de TreeDataProvider simple
class MyTreeDataProvider implements vscode.TreeDataProvider<string> {
  private _onDidChangeTreeData = new vscode.EventEmitter<string | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: string): vscode.TreeItem {
    return {
      label: element,
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      resourceUri: vscode.Uri.file(element), // Permet d'avoir une icône de fichier
      contextValue: 'file'
    };
  }

  async getChildren(): Promise<string[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showWarningMessage('Aucun dossier ouvert dans l\'espace de travail.');
      return [];
    }

    try {
      // Rechercher tous les fichiers et dossiers dans lib/ et ses sous-dossiers
      const files = await vscode.workspace.findFiles(
        'lib/**/*.dart',           // ← Inclure tout ce qui est dans lib/
        '{**/node_modules,**/.git}' // Exclure les dossiers indésirables
      );

      // Retourner les chemins absolus (fsPath)
      return files.map(file => file.fsPath);
    } catch (err) {
      console.error('Erreur lors de la lecture du dossier lib/', err);
      vscode.window.showErrorMessage('Impossible de lire le dossier lib/.');
      return [];
    }
  }
}

export function deactivate() {}