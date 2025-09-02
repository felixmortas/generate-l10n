import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('l10n-helper.openUI', () => {
    const panel = vscode.window.createWebviewPanel(
      'l10nHelper',
      'L10n Helper',
      vscode.ViewColumn.One,
      {
        enableScripts: true
      }
    );

    panel.webview.html = getWebviewContent();

    // Réception des messages envoyés depuis le webview
    panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'run':
            vscode.window.showInformationMessage(
              `Dart: ${message.dartFiles}, ARB: ${message.arbFiles}, API: ${message.apiKey}`
            );

            // Exemple: lancer une commande Flutter
            const terminal = vscode.window.createTerminal('Flutter L10n');
            terminal.sendText("flutter gen-l10n");
            terminal.show();
            break;
        }
      },
      undefined,
      context.subscriptions
    );
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}

function getWebviewContent() {
  return /* html */`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: sans-serif; padding: 1rem; }
        h2 { margin-bottom: 1rem; }
        .field { margin-bottom: 1rem; }
        label { display:block; font-weight: bold; margin-bottom: 0.3rem; }
        input, select, button { width: 100%; padding: 0.5rem; border-radius: 6px; }
        button { background: #007acc; color: white; border: none; cursor: pointer; }
        button:hover { background: #005fa3; }
      </style>
    </head>
    <body>
      <h2>⚙️ L10n Helper</h2>

      <div class="field">
        <label for="dart">Fichiers .dart</label>
        <input type="file" id="dart" multiple accept=".dart" />
      </div>

      <div class="field">
        <label for="arb">Fichiers .arb</label>
        <input type="file" id="arb" multiple accept=".arb" />
      </div>

      <div class="field">
        <label for="apiKey">Clé API</label>
        <input type="text" id="apiKey" placeholder="Entrez la clé API" />
      </div>

      <button id="run">🚀 Lancer</button>

      <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('run').addEventListener('click', () => {
          const dartFiles = Array.from(document.getElementById('dart').files).map(f => f.name);
          const arbFiles = Array.from(document.getElementById('arb').files).map(f => f.name);
          const apiKey = document.getElementById('apiKey').value;

          vscode.postMessage({
            command: 'run',
            dartFiles,
            arbFiles,
            apiKey
          });
        });
      </script>
    </body>
    </html>
  `;
}
