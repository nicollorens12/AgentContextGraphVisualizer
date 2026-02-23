import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { GraphData } from './types';

export function createWebviewPanel(
  context: vscode.ExtensionContext,
  graphData: GraphData,
  folderName: string
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'knowledgeGraph',
    `Knowledge Graph: ${folderName}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview')),
        vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview')),
      ],
    }
  );

  panel.webview.html = getWebviewContent(panel.webview, context, graphData);
  return panel;
}

export function updateWebviewData(panel: vscode.WebviewPanel, graphData: GraphData): void {
  panel.webview.postMessage({ type: 'updateGraph', data: graphData });
}

function getWebviewContent(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  graphData: GraphData
): string {
  const nonce = crypto.randomBytes(16).toString('hex');

  // Resolve webview resource URIs
  const webviewDir = path.join(context.extensionPath, 'src', 'webview');
  const stylesUri = webview.asWebviewUri(vscode.Uri.file(path.join(webviewDir, 'styles.css')));
  const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(webviewDir, 'graph.js')));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      style-src ${webview.cspSource} 'nonce-${nonce}';
      script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
      font-src ${webview.cspSource};
      img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${stylesUri}">
  <title>Knowledge Graph</title>
</head>
<body>
  <div id="controls">
    <input type="text" id="search" placeholder="Search nodes..." autocomplete="off" />
    <div id="category-filters"></div>
  </div>
  <div id="graph-container">
    <svg id="graph"></svg>
  </div>
  <div id="tooltip"></div>
  <div id="legend"></div>
  <script nonce="${nonce}">
    const graphData = ${JSON.stringify(graphData)};
    const vscode = acquireVsCodeApi();
  </script>
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
