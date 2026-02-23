# Knowledge Graph Visualizer

VS Code extension that visualizes markdown-based knowledge graphs as interactive d3-force directed graphs.

## Usage

1. Right-click any folder in the VS Code Explorer
2. Select **"Visualize Knowledge Graph"**
3. The extension scans all `.md` files recursively, extracts links between them, and renders an interactive graph

## Features

- **Node sizing**: nodes scale by in-degree (most-linked-to files are largest)
- **Color by category**: directory-based coloring (root, company, architecture, decisions, components, operations)
- **Hover tooltips**: title, summary, category, link counts, file path
- **Click to open**: clicking a node opens the file in the editor
- **Search**: filter nodes by label (non-matching nodes dim to 8% opacity)
- **Category filters**: toggle categories on/off
- **Drag, zoom, pan**: full d3 interaction
- **Live updates**: file watcher auto-refreshes the graph when `.md` files change
- **Theme-aware**: adapts to VS Code light, dark, and high-contrast themes

## Development

```bash
cd tools/knowledge-graph-visualizer
npm install
npm run compile
```

Press **F5** in VS Code to launch the Extension Development Host.

## Architecture

```
src/
  extension.ts        # Command registration, message handling
  types.ts            # GraphNode, GraphEdge, GraphData interfaces
  graphDataParser.ts  # Recursive .md discovery, link extraction, degree computation
  webviewProvider.ts  # Webview panel creation, CSP, d3 CDN loading
  fileWatcher.ts      # Watch .md changes, debounced refresh
  webview/
    graph.js          # d3-force visualization (nodes, edges, interactions)
    styles.css        # VS Code theme-aware styling
```

## Link Parsing

The parser extracts links in two phases:

1. **Structured sections**: `## Related`, `## Full Map`, and other H2 sections containing `- [Title](path.md)` list items
2. **Inline body links**: `[Title](path.md)` anywhere in the document (deduplicated against phase 1)

All paths are resolved relative to the source file's directory, handling `../` navigation correctly.
