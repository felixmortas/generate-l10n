import * as vscode from 'vscode';
import { L10nProcessor } from "auto-l10n-ts"; 

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension activée !');

  const treeDataProvider = new MyTreeDataProvider(context);
  const view = vscode.window.createTreeView('generateL10nView', {
    treeDataProvider
  });

  // Commande pour cocher/décocher un fichier
  const toggleCheck = vscode.commands.registerCommand('generateL10n.toggleCheck', (node: FileNode) => {
    treeDataProvider.toggleCheck(node);
  });
  context.subscriptions.push(toggleCheck);


  // Commande pour traiter les fichiers cochés
  const processSelectedFiles = vscode.commands.registerCommand('generateL10n.processSelectedFiles', async () => {
    const checked = treeDataProvider.getCheckedFiles();

    if (checked.length === 0) {
      vscode.window.showWarningMessage('Aucun fichier coché.');
      return;
    }

    vscode.window.showInformationMessage(
      `Fichiers cochés : ${checked.join(', ')}`
    );

    const apiKey = await context.secrets.get("apiKey");
    if (!apiKey) {
      vscode.window.showErrorMessage("Clé API manquante. Veuillez la définir avec la commande 'Définir la clé API'.");
      return;
    }

    // init arbsFolder variable to the first workspace folder + /lib/l10n
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("Aucun dossier ouvert dans l'espace de travail.");
      return;
    }
    const arbsFolder = `${workspaceFolders[0].uri.fsPath}/lib/l10n`;

    const modifier = new L10nProcessor({
      provider: "mistral", // ou récupéré via settings
      model: "mistral-small-latest",
      arbsFolder: arbsFolder,
      files: checked,
      apiKey, // <-- on injecte la clé
    });

    await modifier.process();
    vscode.window.showInformationMessage("Traitement terminé 🎉");

  });
  context.subscriptions.push(processSelectedFiles);

  const configureExtension = vscode.commands.registerCommand("generateL10n.configureExtension", async () => {
    // Ouvre la page des paramètres de l'extension
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "generateL10n"
    );
  });
  context.subscriptions.push(configureExtension);

}

class MyTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private root: DirectoryNode | null = null;
  private checkedFiles = new Set<string>(); // chemins cochés

  constructor(private context: vscode.ExtensionContext) {
    this.refresh();
  }

  refresh(): void {
    this.root = this.buildFileTree();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.isFile) {
      const isChecked = this.checkedFiles.has(element.path);
      const item = new vscode.TreeItem(
        `${isChecked ? '☑' : '☐'} ${element.name}`,
        vscode.TreeItemCollapsibleState.None
      );
      item.resourceUri = vscode.Uri.file(element.path);
      item.contextValue = 'file';
      item.command = {
        command: 'generateL10n.toggleCheck',
        title: 'Cocher/Décocher',
        arguments: [element]
      };
      return item;
    } else {
      const collapsibleState = element.name === "lib"
        ? vscode.TreeItemCollapsibleState.Expanded
        : (element.children.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None);

      const item = new vscode.TreeItem(element.name, collapsibleState);
      item.resourceUri = vscode.Uri.file(element.path);
      item.contextValue = 'directory';
      return item;
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
      return Promise.resolve([]);
    }

    return Promise.resolve(element.children);
  }

  // Commande interne pour cocher/décocher
  toggleCheck(node: FileNode) {
    if (this.checkedFiles.has(node.path)) {
      this.checkedFiles.delete(node.path);
    } else {
      this.checkedFiles.add(node.path);
    }
    this._onDidChangeTreeData.fire(node);
  }

  getCheckedFiles(): string[] {
    return Array.from(this.checkedFiles);
  }

  private sortChildren(node: DirectoryNode): void {
    node.children.sort((a, b) => {
      if (a.isFile !== b.isFile) {
        return a.isFile ? 1 : -1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    node.children.forEach(child => {
      if (!child.isFile) {
        this.sortChildren(child as DirectoryNode);
      }
    });
  }

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
        if (!relativePath) return;

        const parts = relativePath.split(/[/\\]/);
        let current: DirectoryNode = tree;

        parts.forEach((part, index) => {
          if (index === parts.length - 1) {
            current.children.push(new FileNode(part, uri.fsPath, true));
          } else {
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

      this.sortChildren(tree);
      this._onDidChangeTreeData.fire(undefined);
    });

    return tree;
  }
}

// Types pour représenter les nœuds
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
