import * as vscode from 'vscode';

export function createFileWatcher(
  folderPath: string,
  panel: vscode.WebviewPanel,
  onRefresh: () => void
): vscode.Disposable {
  const pattern = new vscode.RelativePattern(folderPath, '**/*.md');
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const refresh = () => {
    if (debounceTimer) { clearTimeout(debounceTimer); }
    debounceTimer = setTimeout(() => {
      onRefresh();
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
