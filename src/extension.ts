import * as vscode from 'vscode';
import { L10nProcessor } from "./core/l10nProcessor.js";
import { isValidFlutterString, executeGenL10n, runWithProgress } from "./core/utils.js";
import { ConfigurationManager } from "./core/configurationManager.js";

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

  /**
   * Common logic for processing the selected text
   */
  async function handleSelectedText(executeGen: boolean) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText) {
      vscode.window.showWarningMessage("No text selected.");
      return;
    }

    if (!isValidFlutterString(selectedText)) {
      vscode.window.showErrorMessage("Invalid selection: Please select a string with quotation marks (e.g., \"text\").");
      return;
    }

    // Retrieval of configuration (identical to localizeSelectedFiles command)
    const extConfig = await ConfigurationManager.getConfig();
    if (!extConfig) { return; }

    const processor = new L10nProcessor({
      ...extConfig,
      files: [], // Still not used for text-only processing
    });

    try {
      await runWithProgress("Localizing selection...", async (progress) => {
        // 1. Call to the processor
        const replacement = await processor.processSelectedText(selectedText);

        // 2. Replacement in the editor
        await editor.edit(editBuilder => {
          editBuilder.replace(selection, replacement);
        });

        // 3. Execution of flutter gen-l10n if requested
        if (executeGen) {
          progress.report({ message: "Running flutter gen-l10n..." });
          await executeGenL10n();
        }
      });

      vscode.window.showInformationMessage("Text localized successfully!");
    } catch (err: any) {
      vscode.window.showErrorMessage(`L10n Error: ${err.message}`);
    }
  }

  // Commands recording
  context.subscriptions.push(
    vscode.commands.registerCommand('generateL10n.localizeText', () => handleSelectedText(false)),
    vscode.commands.registerCommand('generateL10n.localizeTextAndGenerate', () => handleSelectedText(true))
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

/**
 * Class to display options in the lightbulb (Quick Fix) when text is selected.
 */
class L10nCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
    if (range.isEmpty) { return []; }

    const action = new vscode.CodeAction('Auto-L10n: Localize Text', vscode.CodeActionKind.QuickFix);
    action.command = { command: 'generateL10n.localizeText', title: 'Auto-L10n: Localize Text' };

    const actionExec = new vscode.CodeAction('Auto-L10n: Localize & Build', vscode.CodeActionKind.QuickFix);
    actionExec.command = { command: 'generateL10n.localizeTextAndGenerate', title: 'Auto-L10n: Localize & Build' };

    return [action, actionExec];
  }
}

/** Called when the extension is deactivated */
export function deactivate() {}
