# Agent Context Graph Visualizer

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/NicoLlorens.agent-context-graph-visualizer)](https://marketplace.visualstudio.com/items?itemName=NicoLlorens.agent-context-graph-visualizer)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A VS Code extension that turns a folder of interconnected markdown files into an interactive force-directed graph — with built-in analysis tools to optimize your documentation for AI agents. Surfaces broken links, orphan documents, health scores, token budgets, and structural issues so your knowledge base delivers maximum context to LLMs.

## Quick Start

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=NicoLlorens.agent-context-graph-visualizer)
2. Right-click any folder in the Explorer sidebar
3. Select **"Visualize Agent Context Graph"**

The extension recursively scans all `.md` files, extracts links between them, and renders an interactive graph with agent-readiness analysis.

## Core Visualization

### Force-Directed Graph
Documents appear as nodes connected by directed edges. The d3-force layout automatically arranges nodes so related documents cluster together.

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

- **Hover** a node to see its title, summary, category, link counts, token estimate, and health score
- **Click** a node to open a detail panel with full stats, health breakdown, warnings, and connections
- **Drag** nodes to rearrange the layout
- **Zoom and pan** with scroll wheel and mouse drag
- **Search** by typing in the search bar — non-matching nodes dim to 8% opacity while preserving layout
- **Filter by category** using toggle buttons to focus on specific areas

### Live Updates
A file watcher monitors the folder for `.md` changes. When you edit, create, or delete a file, the graph refreshes automatically with full re-analysis within ~500ms.

### Theme Aware
Adapts to your VS Code theme automatically. Dark, light, and high-contrast themes are all supported through VS Code's CSS custom properties.

## Agent-Readiness Analysis

### Documentation Health Score
Every document gets a 0-100 health score based on 8 metrics:

| Metric | Max Points |
|--------|-----------|
| Has H1 Title | 10 |
| Has ## Overview section | 15 |
| Has outgoing links | 15 |
| Has incoming links | 15 |
| Adequate length (50+ words) | 10 |
| Has ## Related section | 10 |
| No broken links | 10 |
| Bidirectional link ratio | 15 |

A global health score averages all documents. The **Health mode** recolors nodes green (75+), yellow (50-74), orange (25-49), or red (0-24). The detail panel and insights panel show per-metric breakdown bars.

### Broken Link Detection
The parser tracks every markdown link and checks whether the target exists on disk. Missing targets appear as **red ghost nodes** with dashed borders, connected by red dashed edges. The insights panel lists all broken links with their source documents.

### Structure Validation
Each document is checked for common structural issues. Orange **warning badges** appear on nodes that have problems:

- Missing H1 title heading
- Missing ## Overview section
- No outgoing links to other docs
- Missing ## Related section
- Too short (under 50 words)
- Orphan (no connections at all)

### Bidirectional Link Suggestions
The analyzer detects one-way links — where A links to B but B doesn't link back. In **Suggestions mode**, green dashed edges overlay the graph showing where backlinks should be added. The insights panel lists each suggestion.

### Missing Link Detection
Content similarity analysis using Jaccard similarity on extracted keywords. Compares every pair of unlinked documents and surfaces the top 20 most similar pairs. Helps discover related documents that should be cross-referenced.

### Context Window Budget
Every document gets a token estimate (~1.3x word count). In **Budget mode**, nodes resize and recolor based on token count — making it easy to spot oversized documents that may blow context limits. The insights panel shows total tokens, averages, and the largest/smallest documents.

### Reachability Analysis
Select an entry point (README, index, CLAUDE.md are prioritized at the top of the dropdown) and see which documents are reachable via outgoing links using BFS. Nodes color by hop distance: blue (entry) → green (1 hop) → yellow (3 hops) → red (5+ hops). Unreachable nodes turn gray with dashed outlines. The info bar shows reachability percentage.

### Navigation Path Analysis
In **Path mode**, click two nodes to find the shortest path between them via BFS on outgoing edges. The path highlights in bright blue with hop count and total token cost displayed in a bottom bar. Useful for understanding how an agent would navigate from one document to another.

### Export Agent-Ready Artifacts

- **Export Index** — generates a `_map.md` file with hierarchical document listing grouped by category, hub documents, health scores, broken links, and a global health breakdown table
- **Export JSON** — exports the full graph data as clean JSON (strips D3 internal fields), including all analysis results

## Visualization Modes

| Mode | Activation | Node Color | Node Size | Overlay |
|------|-----------|------------|-----------|---------|
| Default | No mode active | Category | In-degree | — |
| Health | Click "Health" | Score gradient | In-degree | — |
| Budget | Click "Budget" | Token density | Token count | — |
| Reachability | Click "Reachability" | Hop distance | In-degree | Unreachable grayed |
| Suggestions | Click "Suggestions" | Category | In-degree | Green dashed backlinks |
| Path | Click "Path" | Category | In-degree | Blue shortest path |

Click any mode button again to toggle it off and return to default.

## How Link Parsing Works

The parser extracts links in two phases to maximize coverage while avoiding duplicates:

1. **Structured sections** — scans `## Related`, `## Full Map`, and similar H2 sections for list-style links (`- [Title](path.md)`)
2. **Inline body links** — scans the rest of the document for `[Title](path.md)`, deduplicated against phase 1

All paths are resolved relative to the source file's directory, so `../` references work correctly across nested folders. Links to non-existent files are tracked as broken links.

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
  extension.ts          Entry point — command registration, message handling, export wiring
  types.ts              Shared interfaces (GraphNode, GraphEdge, GraphData, analysis types)
  graphDataParser.ts    Recursive .md discovery, link extraction, degree computation
  analyzer.ts           Post-parse analysis: health scores, broken links, similarity, validation
  exporter.ts           Export _map.md index and JSON artifacts
  webviewProvider.ts    Webview panel creation, CSP, HTML template with mode controls
  fileWatcher.ts        File system watcher with debounced refresh
  webview/
    graph.js            d3-force visualization with 6 modes and 9 analysis features
    styles.css          VS Code theme-aware styling
```

### Publishing

```bash
npx @vscode/vsce login NicoLlorens
npx @vscode/vsce publish
```

## License

[MIT](LICENSE)
