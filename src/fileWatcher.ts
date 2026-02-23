import * as vscode from 'vscode';
import { parseGraphData } from './graphDataParser';
import { updateWebviewData } from './webviewProvider';

export function createFileWatcher(
  folderPath: string,
  panel: vscode.WebviewPanel
): vscode.Disposable {
  const pattern = new vscode.RelativePattern(folderPath, '**/*.md');
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const refresh = () => {
    if (debounceTimer) { clearTimeout(debounceTimer); }
    debounceTimer = setTimeout(() => {
      const graphData = parseGraphData(folderPath);
      updateWebviewData(panel, graphData);
    }, 500);
  };

  watcher.onDidCreate(refresh);
  watcher.onDidChange(refresh);
  watcher.onDidDelete(refresh);

  return {
    dispose: () => {
      if (debounceTimer) { clearTimeout(debounceTimer); }
      watcher.dispose();
    },
  };
}
