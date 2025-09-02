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

class MyTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private root: DirectoryNode | null = null;

  constructor(private context: vscode.ExtensionContext) {
    this.refresh();
  }

  refresh(): void {
    this.root = this.buildFileTree();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.isFile) {
      return {
        label: element.name,
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        resourceUri: vscode.Uri.file(element.path),
        contextValue: 'file'
      };
    } else {
      return {
        label: element.name,
        collapsibleState: element.children.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        resourceUri: vscode.Uri.file(element.path),
        contextValue: 'directory'
      };
    }
  }

  getChildren(element?: TreeNode): Thenable<TreeNode[]> {
    if (!this.root) {
      return Promise.resolve([]);
    }

    if (!element) {
      return Promise.resolve([this.root]); // racine = dossier lib
    }

    if (element.isFile) {
      return Promise.resolve([]); // un fichier n’a pas d’enfants
    }

    return Promise.resolve(element.children);
  }

  // Fonction pour trier les enfants : dossiers d'abord, puis fichiers, chacun trié alphabétiquement
  private sortChildren(node: DirectoryNode): void {
    node.children.sort((a, b) => {
      // Dossiers d'abord, fichiers ensuite
      if (a.isFile !== b.isFile) {
        return a.isFile ? 1 : -1; // dossier < fichier
      }
      // Si même type, tri alphabétique (insensible à la casse)
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    // Tri récursif pour tous les sous-dossiers
    node.children.forEach(child => {
      if (!child.isFile) {
        this.sortChildren(child as DirectoryNode);
      }
    });
  }

  // Fonction pour construire l'arbre
  private buildFileTree(): DirectoryNode {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return new DirectoryNode('Aucun projet ouvert', '', false);
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const libPath = `${rootPath}/lib`;
    const tree = new DirectoryNode('lib', libPath, false);

    const files = vscode.workspace.findFiles(
      'lib/**/*.dart',
      '{**/node_modules,**/.git,**/l10n/**}'
    );

    files.then(uris => {
      uris.forEach(uri => {
        const relativePath = uri.fsPath.substring(libPath.length + 1);
        if (!relativePath) return; // éviter lib/ lui-même

        const parts = relativePath.split(/[/\\]/);
        let current: DirectoryNode = tree;

        parts.forEach((part, index) => {
          if (index === parts.length - 1) {
            // Fichier
            current.children.push(new FileNode(part, uri.fsPath, true));
          } else {
            // Dossier
            let dir = current.children.find(
              c => c.name === part && !c.isFile
            ) as DirectoryNode | undefined;

            if (!dir) {
              const fullPath = `${libPath}/${parts.slice(0, index + 1).join('/')}`;
              dir = new DirectoryNode(part, fullPath, false);
              current.children.push(dir);
            }
            current = dir;
          }
        });
      });

      // 🌟 Tri de l'arbre après construction
      this.sortChildren(tree);

      // Rafraîchir après chargement
      this._onDidChangeTreeData.fire(undefined);
    });

    return tree;
  }
}

// Types pour représenter les nœuds de l'arbre
class FileNode {
  constructor(public name: string, public path: string, public isFile: true) {}
}

class DirectoryNode {
  constructor(
    public name: string,
    public path: string,
    public isFile: false,
    public children: Array<FileNode | DirectoryNode> = []
  ) {}
}

type TreeNode = FileNode | DirectoryNode;

export function deactivate() {}