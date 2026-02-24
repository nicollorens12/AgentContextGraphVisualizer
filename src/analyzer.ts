import {
  GraphData,
  GraphNode,
  RawExtractedLink,
  BrokenLink,
  BacklinkSuggestion,
  SimilaritySuggestion,
  HealthBreakdown,
  ValidationWarning,
} from './types';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'not', 'no', 'nor', 'so', 'if', 'then', 'than', 'that', 'this', 'these', 'those',
  'it', 'its', 'as', 'into', 'through', 'about', 'up', 'out', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'also',
  'just', 'because', 'any', 'when', 'which', 'who', 'how', 'what', 'where', 'why',
  'while', 'after', 'before', 'above', 'below', 'between', 'under', 'over', 'during',
  'use', 'used', 'using', 'new', 'one', 'two', 'see', 'e', 'g', 'i', 'we', 'you', 'they',
  'my', 'your', 'our', 'his', 'her', 'their', 'me', 'him', 'us', 'them',
]);

export function analyzeGraphData(
  graphData: GraphData,
  _rootFolder: string,
  contentMap: Map<string, string>,
  allRawLinks: RawExtractedLink[]
): GraphData {
  const nodeMap = new Map<string, GraphNode>();
  for (const node of graphData.nodes) {
    nodeMap.set(node.id, node);
  }

  // Enrich node content metadata
  enrichNodeContent(graphData.nodes, contentMap);

  // Detect broken links
  graphData.brokenLinks = detectBrokenLinks(allRawLinks, nodeMap);

  // Count broken outgoing per node
  for (const bl of graphData.brokenLinks) {
    const node = nodeMap.get(bl.sourceId);
    if (node) { node.brokenOutgoingCount++; }
  }

  // Detect missing backlinks
  graphData.backlinkSuggestions = detectMissingBacklinks(graphData.edges, nodeMap);

  // Compute bidirectional ratios
  computeBidirectionalRatios(graphData.nodes, graphData.edges);

  // Compute validation warnings
  computeValidationWarnings(graphData.nodes);

  // Compute health scores (depends on above)
  computeHealthScores(graphData.nodes);

  // Compute global health
  if (graphData.nodes.length > 0) {
    graphData.globalHealthScore = Math.round(
      graphData.nodes.reduce((sum, n) => sum + n.healthScore, 0) / graphData.nodes.length
    );
  }
  graphData.globalHealthBreakdown = computeGlobalBreakdown(graphData.nodes);

  // Detect similarity suggestions
  graphData.similaritySuggestions = detectSimilarityLinks(graphData.nodes, graphData.edges);

  // Total token estimate
  graphData.totalTokenEstimate = graphData.nodes.reduce((sum, n) => sum + n.tokenEstimate, 0);

  return graphData;
}

function enrichNodeContent(nodes: GraphNode[], contentMap: Map<string, string>): void {
  for (const node of nodes) {
    const content = contentMap.get(node.id) || '';
    const stripped = stripMarkdown(content);
    const words = stripped.split(/\s+/).filter(w => w.length > 0);

    node.contentWordCount = words.length;
    node.tokenEstimate = Math.round(words.length * 1.3);
    node.keywords = extractKeywords(stripped);
    node.hasH1Title = /^# .+$/m.test(content);
    node.hasOverviewSection = /^## Overview/m.test(content);
    node.hasRelatedSection = /^## Related/m.test(content);
  }
}

function stripMarkdown(content: string): string {
  return content
    .replace(/^#{1,6}\s+/gm, '')           // headings
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')  // images
    .replace(/`{1,3}[^`]*`{1,3}/g, '')       // inline code
    .replace(/```[\s\S]*?```/g, '')           // code blocks
    .replace(/[*_~]+/g, '')                   // bold/italic/strikethrough
    .replace(/^\s*[-*+]\s+/gm, '')            // list markers
    .replace(/^\s*\d+\.\s+/gm, '')            // ordered list markers
    .replace(/\|/g, ' ')                      // table pipes
    .replace(/---+/g, '')                     // horizontal rules
    .replace(/>\s*/g, '')                      // blockquotes
    .toLowerCase();
}

function extractKeywords(stripped: string): string[] {
  const words = stripped.split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
  const freq = new Map<string, number>();
  for (const w of words) {
    const clean = w.replace(/[^a-z0-9-]/g, '');
    if (clean.length > 2) {
      freq.set(clean, (freq.get(clean) || 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);
}

function detectBrokenLinks(
  allRawLinks: RawExtractedLink[],
  nodeMap: Map<string, GraphNode>
): BrokenLink[] {
  const broken: BrokenLink[] = [];
  const seen = new Set<string>();

  for (const link of allRawLinks) {
    if (!link.existsOnDisk && !nodeMap.has(link.resolvedPath)) {
      const key = `${link.sourceId}->${link.resolvedPath}`;
      if (!seen.has(key)) {
        seen.add(key);
        broken.push({
          sourceId: link.sourceId,
          sourceLabel: link.sourceLabel,
          sourceFilePath: link.sourceFilePath,
          targetPath: link.resolvedPath,
          label: link.label,
        });
      }
    }
  }
  return broken;
}

function detectMissingBacklinks(
  edges: GraphData['edges'],
  nodeMap: Map<string, GraphNode>
): BacklinkSuggestion[] {
  const edgeSet = new Set<string>();
  for (const e of edges) {
    const sid = typeof e.source === 'string' ? e.source : (e.source as unknown as GraphNode).id;
    const tid = typeof e.target === 'string' ? e.target : (e.target as unknown as GraphNode).id;
    edgeSet.add(`${sid}->${tid}`);
  }

  const suggestions: BacklinkSuggestion[] = [];
  for (const e of edges) {
    const sid = typeof e.source === 'string' ? e.source : (e.source as unknown as GraphNode).id;
    const tid = typeof e.target === 'string' ? e.target : (e.target as unknown as GraphNode).id;
    const reverseKey = `${tid}->${sid}`;
    if (!edgeSet.has(reverseKey)) {
      const fromNode = nodeMap.get(tid);
      const toNode = nodeMap.get(sid);
      if (fromNode && toNode) {
        suggestions.push({
          fromId: tid,
          fromLabel: fromNode.label,
          toId: sid,
          toLabel: toNode.label,
          toFilePath: toNode.filePath,
        });
      }
    }
  }

  // Deduplicate (A->B suggestion should appear once)
  const seen = new Set<string>();
  return suggestions.filter(s => {
    const key = `${s.fromId}->${s.toId}`;
    if (seen.has(key)) { return false; }
    seen.add(key);
    return true;
  });
}

function computeBidirectionalRatios(nodes: GraphNode[], edges: GraphData['edges']): void {
  const outgoingMap = new Map<string, Set<string>>();
  const incomingMap = new Map<string, Set<string>>();

  for (const e of edges) {
    const sid = typeof e.source === 'string' ? e.source : (e.source as unknown as GraphNode).id;
    const tid = typeof e.target === 'string' ? e.target : (e.target as unknown as GraphNode).id;
    if (!outgoingMap.has(sid)) { outgoingMap.set(sid, new Set()); }
    outgoingMap.get(sid)!.add(tid);
    if (!incomingMap.has(tid)) { incomingMap.set(tid, new Set()); }
    incomingMap.get(tid)!.add(sid);
  }

  for (const node of nodes) {
    const outgoing = outgoingMap.get(node.id) || new Set();
    const incoming = incomingMap.get(node.id) || new Set();
    const allNeighbors = new Set([...outgoing, ...incoming]);
    if (allNeighbors.size === 0) {
      node.bidirectionalRatio = 0;
      continue;
    }
    let bidirectionalCount = 0;
    for (const neighbor of allNeighbors) {
      if (outgoing.has(neighbor) && incoming.has(neighbor)) {
        bidirectionalCount++;
      }
    }
    node.bidirectionalRatio = bidirectionalCount / allNeighbors.size;
  }
}

function computeValidationWarnings(nodes: GraphNode[]): void {
  for (const node of nodes) {
    const warnings: ValidationWarning[] = [];

    if (!node.hasH1Title) {
      warnings.push({ type: 'missing-h1', message: 'Missing H1 title heading' });
    }
    if (!node.hasOverviewSection) {
      warnings.push({ type: 'missing-overview', message: 'Missing ## Overview section' });
    }
    if (node.outDegree === 0) {
      warnings.push({ type: 'no-outgoing-links', message: 'No outgoing links to other docs' });
    }
    if (!node.hasRelatedSection) {
      warnings.push({ type: 'no-related-section', message: 'Missing ## Related section' });
    }
    if (node.contentWordCount < 50) {
      warnings.push({ type: 'too-short', message: `Only ${node.contentWordCount} words (recommend 50+)` });
    }
    if (node.inDegree === 0 && node.outDegree === 0) {
      warnings.push({ type: 'orphan', message: 'Orphan node — no incoming or outgoing links' });
    }

    node.warnings = warnings;
  }
}

function computeHealthScores(nodes: GraphNode[]): void {
  for (const node of nodes) {
    const breakdown: HealthBreakdown = {
      hasTitle: node.hasH1Title ? 10 : 0,
      hasOverview: node.hasOverviewSection ? 15 : 0,
      hasOutgoingLinks: node.outDegree > 0 ? 15 : 0,
      hasIncomingLinks: node.inDegree > 0 ? 15 : 0,
      adequateLength: node.contentWordCount >= 50 ? 10 : Math.round((node.contentWordCount / 50) * 10),
      hasRelatedSection: node.hasRelatedSection ? 10 : 0,
      noBrokenLinks: node.brokenOutgoingCount === 0 ? 10 : 0,
      bidirectionalRatio: Math.round(node.bidirectionalRatio * 15),
    };

    node.healthBreakdown = breakdown;
    node.healthScore = Object.values(breakdown).reduce((a, b) => a + b, 0);
  }
}

function computeGlobalBreakdown(nodes: GraphNode[]): HealthBreakdown {
  if (nodes.length === 0) {
    return { hasTitle: 0, hasOverview: 0, hasOutgoingLinks: 0, hasIncomingLinks: 0, adequateLength: 0, hasRelatedSection: 0, noBrokenLinks: 0, bidirectionalRatio: 0 };
  }
  const sum: HealthBreakdown = { hasTitle: 0, hasOverview: 0, hasOutgoingLinks: 0, hasIncomingLinks: 0, adequateLength: 0, hasRelatedSection: 0, noBrokenLinks: 0, bidirectionalRatio: 0 };
  for (const node of nodes) {
    for (const key of Object.keys(sum) as (keyof HealthBreakdown)[]) {
      sum[key] += node.healthBreakdown[key];
    }
  }
  for (const key of Object.keys(sum) as (keyof HealthBreakdown)[]) {
    sum[key] = Math.round(sum[key] / nodes.length);
  }
  return sum;
}

function detectSimilarityLinks(nodes: GraphNode[], edges: GraphData['edges']): SimilaritySuggestion[] {
  // Build edge set for existing connections
  const edgeSet = new Set<string>();
  for (const e of edges) {
    const sid = typeof e.source === 'string' ? e.source : (e.source as unknown as GraphNode).id;
    const tid = typeof e.target === 'string' ? e.target : (e.target as unknown as GraphNode).id;
    edgeSet.add(`${sid}<>${tid}`);
    edgeSet.add(`${tid}<>${sid}`);
  }

  // Build keyword sets
  const keywordSets = new Map<string, Set<string>>();
  for (const node of nodes) {
    keywordSets.set(node.id, new Set(node.keywords));
  }

  const suggestions: SimilaritySuggestion[] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];

      // Skip if already connected
      if (edgeSet.has(`${a.id}<>${b.id}`)) { continue; }

      const setA = keywordSets.get(a.id)!;
      const setB = keywordSets.get(b.id)!;

      if (setA.size === 0 || setB.size === 0) { continue; }

      // Jaccard similarity
      let intersection = 0;
      for (const kw of setA) {
        if (setB.has(kw)) { intersection++; }
      }
      const union = setA.size + setB.size - intersection;
      const similarity = union > 0 ? intersection / union : 0;

      if (similarity >= 0.15) {
        suggestions.push({
          nodeAId: a.id,
          nodeALabel: a.label,
          nodeBId: b.id,
          nodeBLabel: b.label,
          similarityScore: Math.round(similarity * 100) / 100,
        });
      }
    }
  }

  // Sort by similarity descending, take top 20
  suggestions.sort((a, b) => b.similarityScore - a.similarityScore);
  return suggestions.slice(0, 20);
}
