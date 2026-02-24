import * as vscode from 'vscode';
import * as path from 'path';
import { GraphData } from './types';
import { parseGraphData } from './graphDataParser';
import { analyzeGraphData } from './analyzer';
import { handleExportIndex, handleExportJson } from './exporter';
import { createWebviewPanel, updateWebviewData } from './webviewProvider';
import { createFileWatcher } from './fileWatcher';

function buildFullGraph(folderPath: string): GraphData {
  const result = parseGraphData(folderPath);
  return analyzeGraphData(result.graphData, folderPath, result.contentMap, result.allExtractedLinks);
}

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'agentContextGraph.visualize',
    (uri: vscode.Uri) => {
      const folderPath = uri.fsPath;
      const folderName = path.basename(folderPath);

      let graphData = buildFullGraph(folderPath);

      if (graphData.nodes.length === 0) {
        vscode.window.showWarningMessage('No markdown files found in the selected folder.');
        return;
      }

      const panel = createWebviewPanel(context, graphData, folderName);

      const watcher = createFileWatcher(folderPath, panel, () => {
        graphData = buildFullGraph(folderPath);
        updateWebviewData(panel, graphData);
      });

      panel.webview.onDidReceiveMessage(
        async (message) => {
          if (message.type === 'openFile') {
            const fileUri = vscode.Uri.file(message.filePath);
            vscode.workspace.openTextDocument(fileUri).then((doc) => {
              vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            });
          } else if (message.type === 'exportIndex') {
            await handleExportIndex(graphData, folderPath);
          } else if (message.type === 'exportJson') {
            await handleExportJson(graphData, folderPath);
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
