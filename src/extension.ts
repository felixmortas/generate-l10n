import * as vscode from 'vscode';
import { L10nProcessor } from "./core/l10nProcessor.js";

 /**
 * Activates the extension when VSCode loads it.
 * Registers commands for toggling files, processing selected files, and opening the extension settings.
 * @param context - VSCode extension context.
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Extension activated!');

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
   * Command: processSelectedFiles
   * Processes all checked localization files using L10nProcessor and the configured AI provider/model.
   */
  const processSelectedFiles = vscode.commands.registerCommand('generateL10n.processSelectedFiles', async () => {
    const checked = treeDataProvider.getCheckedFiles();

    if (checked.length === 0) {
      vscode.window.showWarningMessage('No files are checked.');
      return;
    }

    vscode.window.showInformationMessage(
      `Checked files: ${checked.join(', ')}`
    );

    // Get configuration from extension settings
    const config = vscode.workspace.getConfiguration('generateL10n');
    const apiKey = config.get<string>('apiKey') ?? '';
    const provider = config.get<string>('provider') ?? 'mistral';
    const model = config.get<string>('model') ?? 'mistral-small-latest';
    const backup = config.get<boolean>('backup') ?? false;

    if (!apiKey) {
      vscode.window.showErrorMessage(
        "Missing API key. Please set it in the extension settings."
      );
      return;
    }
    
    // Determine the ARB folder path based on the first workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("No workspace folder is open.");
      return;
    }
    const arbsFolder = `${workspaceFolders[0].uri.fsPath}/lib/l10n`;

    const modifier = new L10nProcessor({
      provider,
      model,
      arbsFolder,
      files: checked,
      apiKey,
      backup,
    });

    try {
      await modifier.process();
      const terminal = vscode.window.createTerminal('Flutter L10n');
      terminal.show();
      terminal.sendText('flutter gen-l10n');
      treeDataProvider.refresh();

      // uncheck all files after processing
      checked.forEach(filePath => {
        const fileNode = new FileNode('', filePath, true);
        treeDataProvider.toggleCheck(fileNode);
      });

      vscode.window.showInformationMessage("Processing completed successfully 🎉");
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error: ${err.message}`);
      console.error(err);
    }
  });
  context.subscriptions.push(processSelectedFiles);

  /**
   * Command: refreshView
   * Refreshes the tree view to reflect any changes in the file system.
   */
  const refreshView = vscode.commands.registerCommand('generateL10n.refreshView', () => {
    treeDataProvider.refresh();
  });
  context.subscriptions.push(refreshView);

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

/**
 * Tree data provider for the localization files.
 * Displays a tree view of the /lib folder with Dart files and allows checking/unchecking files.
 */
class MyTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private root: DirectoryNode | null = null;
  private checkedFiles = new Set<string>(); // Set of checked file paths

  constructor(private context: vscode.ExtensionContext) {
    this.refresh();
  }

  /** Refreshes the tree view by rebuilding the file tree */
  refresh(): void {
    this.root = this.buildFileTree();
    this._onDidChangeTreeData.fire(undefined);
  }

  /** Converts a tree node into a VSCode TreeItem */
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
        title: 'Toggle Check',
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

  /** Returns the children of a given tree node */
  getChildren(element?: TreeNode): Thenable<TreeNode[]> {
    if (!this.root) {
      return Promise.resolve([]);
    }

    if (!element) {
      return Promise.resolve([this.root]); // root folder
    }

    if (element.isFile) {
      return Promise.resolve([]);
    }

    return Promise.resolve(element.children);
  }

  /** Toggles the checked state of a file */
  toggleCheck(node: FileNode) {
    if (this.checkedFiles.has(node.path)) {
      this.checkedFiles.delete(node.path);
    } else {
      this.checkedFiles.add(node.path);
    }
    this._onDidChangeTreeData.fire(node);
  }

  /** Returns a list of all checked file paths */
  getCheckedFiles(): string[] {
    return Array.from(this.checkedFiles);
  }

  /** Sorts children nodes: directories first, then files alphabetically */
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

  /** Builds the tree of files under /lib, excluding node_modules, .git, and l10n folders */
  private buildFileTree(): DirectoryNode {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return new DirectoryNode('No project open', '', false);
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

// --- Tree node types ---
/** Represents a file in the tree */
class FileNode {
  constructor(public name: string, public path: string, public isFile: true) {}
}

/** Represents a directory in the tree */
class DirectoryNode {
  constructor(
    public name: string,
    public path: string,
    public isFile: false,
    public children: Array<FileNode | DirectoryNode> = []
  ) {}
}

type TreeNode = FileNode | DirectoryNode;

/** Called when the extension is deactivated */
export function deactivate() {}
