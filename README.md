# Knowledge Graph Visualizer

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/NicoLlorens.knowledge-graph-visualizer)](https://marketplace.visualstudio.com/items?itemName=NicoLlorens.knowledge-graph-visualizer)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A VS Code extension that turns a folder of interconnected markdown files into an interactive force-directed graph. Built for teams that use markdown-based knowledge graphs, documentation wikis, or Zettelkasten-style note systems.

## Quick Start

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=NicoLlorens.knowledge-graph-visualizer)
2. Right-click any folder in the Explorer sidebar
3. Select **"Visualize Knowledge Graph"**

The extension recursively scans all `.md` files, extracts links between them, and renders an interactive graph.

## Features

### Importance at a Glance

Nodes are sized by **in-degree** — files that are linked to most frequently appear largest. This immediately surfaces hub documents (indexes, architecture overviews) without any manual configuration.

### Category Coloring

Nodes are colored by their parent directory, creating natural visual clusters:

| Category | Color |
|----------|-------|
| Root | Red |
| Company | Blue |
| Architecture | Green |
| Decisions | Purple |
| Components | Yellow |
| Operations | Cyan |

### Interactive Controls

- **Hover** a node to see its title, summary, category, link counts, and file path
- **Click** a node to open the file directly in the editor
- **Drag** nodes to rearrange the layout
- **Zoom and pan** with scroll wheel and mouse drag
- **Search** by typing in the search bar — non-matching nodes dim to 8% opacity while preserving layout
- **Filter by category** using toggle buttons to focus on specific areas

### Live Updates

A file watcher monitors the folder for `.md` changes. When you edit, create, or delete a file, the graph refreshes automatically within ~500ms — no need to reopen.

### Theme Aware

The extension adapts to your VS Code theme automatically. Dark, light, and high-contrast themes are all supported through VS Code's CSS custom properties.

## How Link Parsing Works

The parser extracts links in two phases to maximize coverage while avoiding duplicates:

1. **Structured sections** — scans `## Related`, `## Full Map`, and similar H2 sections for list-style links (`- [Title](path.md)`)
2. **Inline body links** — scans the rest of the document for `[Title](path.md)`, deduplicated against phase 1

All paths are resolved relative to the source file's directory, so `../` references work correctly across nested folders.

## Development

```bash
git clone https://github.com/nicollorens12/Agent-Knowledge-Graph-Visualizer.git
cd Agent-Knowledge-Graph-Visualizer
npm install
npm run compile
```

Press **F5** in VS Code to launch an Extension Development Host with the extension loaded.

### Project Structure

```
src/
  extension.ts          Entry point — command registration, message handling
  types.ts              Shared interfaces (GraphNode, GraphEdge, GraphData)
  graphDataParser.ts    Recursive .md discovery, link extraction, degree computation
  webviewProvider.ts    Webview panel creation, CSP, d3 CDN loading
  fileWatcher.ts        File system watcher with debounced refresh
  webview/
    graph.js            d3-force visualization (~400 lines)
    styles.css          VS Code theme-aware styling
```

### Publishing

```bash
npx @vscode/vsce login NicoLlorens
npx @vscode/vsce publish
```

## License

[MIT](LICENSE)
