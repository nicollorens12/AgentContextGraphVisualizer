import * as vscode from 'vscode';
import * as path from 'path';
import { parseGraphData } from './graphDataParser';
import { createWebviewPanel } from './webviewProvider';
import { createFileWatcher } from './fileWatcher';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'knowledgeGraph.visualize',
    (uri: vscode.Uri) => {
      const folderPath = uri.fsPath;
      const folderName = path.basename(folderPath);

      const graphData = parseGraphData(folderPath);

      if (graphData.nodes.length === 0) {
        vscode.window.showWarningMessage('No markdown files found in the selected folder.');
        return;
      }

      const panel = createWebviewPanel(context, graphData, folderName);
      const watcher = createFileWatcher(folderPath, panel);

      panel.webview.onDidReceiveMessage(
        (message) => {
          if (message.type === 'openFile') {
            const fileUri = vscode.Uri.file(message.filePath);
            vscode.workspace.openTextDocument(fileUri).then((doc) => {
              vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            });
          }
        },
        undefined,
        context.subscriptions
      );

      panel.onDidDispose(() => {
        watcher.dispose();
      });
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
