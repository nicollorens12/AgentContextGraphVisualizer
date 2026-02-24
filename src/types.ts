export interface GraphNode {
  id: string;
  label: string;
  summary: string;
  category: string;
  filePath: string;
  relativePath: string;
  inDegree: number;
  outDegree: number;
  // Agent-readiness fields
  tokenEstimate: number;
  contentWordCount: number;
  keywords: string[];
  hasH1Title: boolean;
  hasOverviewSection: boolean;
  hasRelatedSection: boolean;
  brokenOutgoingCount: number;
  bidirectionalRatio: number;
  healthScore: number;
  healthBreakdown: HealthBreakdown;
  warnings: ValidationWarning[];
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  type: 'related' | 'inline';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  // Agent-readiness fields
  brokenLinks: BrokenLink[];
  backlinkSuggestions: BacklinkSuggestion[];
  similaritySuggestions: SimilaritySuggestion[];
  globalHealthScore: number;
  globalHealthBreakdown: HealthBreakdown;
  totalTokenEstimate: number;
}

export interface BrokenLink {
  sourceId: string;
  sourceLabel: string;
  sourceFilePath: string;
  targetPath: string;
  label: string;
}

export interface BacklinkSuggestion {
  fromId: string;
  fromLabel: string;
  toId: string;
  toLabel: string;
  toFilePath: string;
}

export interface SimilaritySuggestion {
  nodeAId: string;
  nodeALabel: string;
  nodeBId: string;
  nodeBLabel: string;
  similarityScore: number;
}

export interface HealthBreakdown {
  hasTitle: number;
  hasOverview: number;
  hasOutgoingLinks: number;
  hasIncomingLinks: number;
  adequateLength: number;
  hasRelatedSection: number;
  noBrokenLinks: number;
  bidirectionalRatio: number;
}

export interface ValidationWarning {
  type: 'missing-h1' | 'missing-overview' | 'no-outgoing-links' | 'no-related-section' | 'too-short' | 'orphan';
  message: string;
}

export interface RawExtractedLink {
  sourceId: string;
  sourceLabel: string;
  sourceFilePath: string;
  resolvedPath: string;
  label: string;
  type: 'related' | 'inline';
  existsOnDisk: boolean;
}

export interface ParseResult {
  graphData: GraphData;
  contentMap: Map<string, string>;
  allExtractedLinks: RawExtractedLink[];
}
