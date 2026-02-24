import * as fs from 'fs';
import * as path from 'path';
import { GraphNode, GraphEdge, GraphData, ParseResult, RawExtractedLink } from './types';

export function parseGraphData(rootFolder: string): ParseResult {
  const mdFiles = findMarkdownFiles(rootFolder);
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const contentMap = new Map<string, string>();
  const allExtractedLinks: RawExtractedLink[] = [];

  // Build nodes (read content once, store in contentMap)
  for (const filePath of mdFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(rootFolder, filePath);
    const id = normalizePath(filePath);

    contentMap.set(id, content);

    nodeMap.set(id, {
      id,
      label: extractTitle(content) || path.basename(filePath, '.md'),
      summary: extractSummary(content),
      category: extractCategory(rootFolder, filePath),
      filePath,
      relativePath,
      inDegree: 0,
      outDegree: 0,
      // Initialize agent-readiness fields with defaults
      tokenEstimate: 0,
      contentWordCount: 0,
      keywords: [],
      hasH1Title: false,
      hasOverviewSection: false,
      hasRelatedSection: false,
      brokenOutgoingCount: 0,
      bidirectionalRatio: 0,
      healthScore: 0,
      healthBreakdown: {
        hasTitle: 0, hasOverview: 0, hasOutgoingLinks: 0, hasIncomingLinks: 0,
        adequateLength: 0, hasRelatedSection: 0, noBrokenLinks: 0, bidirectionalRatio: 0,
      },
      warnings: [],
    });
  }

  // Extract edges
  const seenEdges = new Set<string>();

  for (const filePath of mdFiles) {
    const content = contentMap.get(normalizePath(filePath))!;
    const sourceId = normalizePath(filePath);
    const sourceDir = path.dirname(filePath);
    const sourceNode = nodeMap.get(sourceId)!;

    // Phase 1: Related section links
    const relatedLinks = extractRelatedLinks(content, sourceDir);
    for (const link of relatedLinks) {
      const targetId = normalizePath(link.resolvedPath);
      const existsOnDisk = fs.existsSync(link.resolvedPath);

      allExtractedLinks.push({
        sourceId,
        sourceLabel: sourceNode.label,
        sourceFilePath: filePath,
        resolvedPath: link.resolvedPath,
        label: link.label,
        type: 'related',
        existsOnDisk,
      });

      if (nodeMap.has(targetId) && targetId !== sourceId) {
        const edgeKey = `${sourceId}->${targetId}`;
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          edges.push({
            source: sourceId,
            target: targetId,
            label: link.label,
            type: 'related',
          });
        }
      }
    }

    // Phase 2: Inline body links
    const inlineLinks = extractInlineLinks(content, sourceDir);
    for (const link of inlineLinks) {
      const targetId = normalizePath(link.resolvedPath);
      const existsOnDisk = fs.existsSync(link.resolvedPath);

      allExtractedLinks.push({
        sourceId,
        sourceLabel: sourceNode.label,
        sourceFilePath: filePath,
        resolvedPath: link.resolvedPath,
        label: link.label,
        type: 'inline',
        existsOnDisk,
      });

      if (nodeMap.has(targetId) && targetId !== sourceId) {
        const edgeKey = `${sourceId}->${targetId}`;
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          edges.push({
            source: sourceId,
            target: targetId,
            label: link.label,
            type: 'inline',
          });
        }
      }
    }
  }

  // Compute degrees
  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (sourceNode) { sourceNode.outDegree++; }
    if (targetNode) { targetNode.inDegree++; }
  }

  const graphData: GraphData = {
    nodes: Array.from(nodeMap.values()),
    edges,
    // Initialize agent-readiness fields
    brokenLinks: [],
    backlinkSuggestions: [],
    similaritySuggestions: [],
    globalHealthScore: 0,
    globalHealthBreakdown: {
      hasTitle: 0, hasOverview: 0, hasOutgoingLinks: 0, hasIncomingLinks: 0,
      adequateLength: 0, hasRelatedSection: 0, noBrokenLinks: 0, bidirectionalRatio: 0,
    },
    totalTokenEstimate: 0,
  };

  return { graphData, contentMap, allExtractedLinks };
}

function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      results.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractTitle(content: string): string {
  const match = content.match(/^# (.+)$/m);
  return match ? match[1].trim() : '';
}

function extractSummary(content: string): string {
  // Try ## Overview section first
  const overviewMatch = content.match(/## Overview\s*\n\s*\n([\s\S]*?)(?:\n\s*\n##|\n\s*\n-|\s*$)/);
  if (overviewMatch) {
    return truncate(overviewMatch[1].trim(), 200);
  }

  // Fallback: first paragraph after H1
  const lines = content.split('\n');
  let foundH1 = false;
  let paragraphLines: string[] = [];

  for (const line of lines) {
    if (!foundH1 && line.startsWith('# ')) {
      foundH1 = true;
      continue;
    }
    if (foundH1) {
      if (line.trim() === '' && paragraphLines.length > 0) {
        break;
      }
      if (line.trim() !== '' && !line.startsWith('#')) {
        paragraphLines.push(line.trim());
      } else if (paragraphLines.length > 0) {
        break;
      }
    }
  }

  return truncate(paragraphLines.join(' '), 200);
}

function extractCategory(rootFolder: string, filePath: string): string {
  const relative = path.relative(rootFolder, filePath);
  const parts = relative.split(path.sep);

  if (parts.length === 1) { return 'root'; }

  const dirParts = parts.slice(0, -1);
  return dirParts[dirParts.length - 1];
}

interface ParsedLink {
  label: string;
  resolvedPath: string;
}

function extractRelatedLinks(content: string, sourceDir: string): ParsedLink[] {
  const links: ParsedLink[] = [];

  const sectionRegex = /^## (?:Related|Full Map|Quick Navigation|Architecture Decision Records|Company|Architecture|Components|Operations)\s*$/gm;
  let match;

  while ((match = sectionRegex.exec(content)) !== null) {
    const sectionStart = match.index + match[0].length;
    const nextSection = content.indexOf('\n## ', sectionStart + 1);
    const sectionContent = nextSection === -1
      ? content.slice(sectionStart)
      : content.slice(sectionStart, nextSection);

    const linkRegex = /- \[([^\]]+)\]\(([^)]+\.md)\)/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(sectionContent)) !== null) {
      const resolvedPath = path.resolve(sourceDir, linkMatch[2]);
      links.push({ label: linkMatch[1], resolvedPath });
    }
  }

  return links;
}

function extractInlineLinks(content: string, sourceDir: string): ParsedLink[] {
  const links: ParsedLink[] = [];

  const withoutRelated = content.replace(/^## Related[\s\S]*$/m, '');

  const linkRegex = /(?<!!)\[([^\]]+)\]\(([^)]+\.md)\)/g;
  let match;

  while ((match = linkRegex.exec(withoutRelated)) !== null) {
    const resolvedPath = path.resolve(sourceDir, match[2]);
    links.push({ label: match[1], resolvedPath });
  }

  return links;
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) { return str; }
  return str.slice(0, maxLen - 3) + '...';
}
