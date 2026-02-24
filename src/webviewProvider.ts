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
    'agentContextGraph',
    `Agent Context Graph: ${folderName}`,
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
  <title>Agent Context Graph</title>
</head>
<body>
  <div id="controls">
    <input type="text" id="search" placeholder="Search nodes..." autocomplete="off" />
    <div id="category-filters"></div>
    <div id="control-buttons">
      <button id="btn-fit" title="Fit graph to view">Fit</button>
      <button id="btn-insights" title="Toggle graph insights">Insights</button>
      <span class="btn-separator"></span>
      <button id="btn-health" title="Color by health score">Health</button>
      <button id="btn-budget" title="Size by token count">Budget</button>
      <button id="btn-reachability" title="Reachability from entry point">Reachability</button>
      <button id="btn-suggestions" title="Show backlink suggestions">Suggestions</button>
      <button id="btn-path" title="Find shortest path between nodes">Path</button>
      <span class="btn-separator"></span>
      <button id="btn-export-index" title="Export _map.md index">Export Index</button>
      <button id="btn-export-json" title="Export graph as JSON">Export JSON</button>
    </div>
  </div>
  <div id="reachability-controls" class="hidden">
    <label for="entry-point-select">Entry Point:</label>
    <select id="entry-point-select"></select>
    <span id="reachability-info"></span>
  </div>
  <div id="main-layout">
    <div id="graph-container">
      <svg id="graph"></svg>
    </div>
    <div id="detail-panel" class="side-panel hidden">
      <div class="panel-header">
        <span class="panel-title">Node Details</span>
        <button id="detail-close" class="panel-close">&times;</button>
      </div>
      <div id="detail-content"></div>
    </div>
    <div id="insights-panel" class="side-panel hidden">
      <div class="panel-header">
        <span class="panel-title">Graph Insights</span>
        <button id="insights-close" class="panel-close">&times;</button>
      </div>
      <div id="insights-content"></div>
    </div>
  </div>
  <div id="path-info" class="hidden">
    <span id="path-info-text"></span>
    <button id="path-clear">Clear</button>
  </div>
  <div id="mode-legend" class="hidden"></div>
  <div id="tooltip"></div>
  <script nonce="${nonce}">
    const graphData = ${JSON.stringify(graphData)};
    const vscode = acquireVsCodeApi();
  </script>
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
