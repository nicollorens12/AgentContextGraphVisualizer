export interface GraphNode {
  id: string;
  label: string;
  summary: string;
  category: string;
  filePath: string;
  relativePath: string;
  inDegree: number;
  outDegree: number;
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
}
