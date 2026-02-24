// Agent Context Graph d3-force Visualization
// Expects: graphData (injected), vscode (acquireVsCodeApi), d3 (CDN)

(function () {
  'use strict';

  // Category colors
  const CATEGORY_COLORS = {
    root: '#e06c75',
    company: '#61afef',
    architecture: '#98c379',
    decisions: '#c678dd',
    components: '#e5c07b',
    operations: '#56b6c2',
  };

  const DEFAULT_COLOR = '#abb2bf';

  // State
  let currentData = JSON.parse(JSON.stringify(graphData));
  let searchTerm = '';
  let activeCategories = new Set(Object.keys(CATEGORY_COLORS));
  let simulation;
  let currentTransform = d3.zoomIdentity;
  let selectedNode = null;

  // Mode state
  let activeMode = null; // null | 'reachability' | 'health' | 'budget' | 'suggestions' | 'path'
  let entryPointId = null;
  let reachabilityMap = new Map();
  let pathSource = null;
  let pathTarget = null;
  let currentPath = null;

  // Sizing
  const nodeRadiusMin = 8;
  const nodeRadiusMax = 30;

  function getNodeRadius(node) {
    if (node.isGhost) return 6;
    if (activeMode === 'budget' && currentData.nodes.length > 1) {
      const maxTokens = Math.max(...currentData.nodes.filter(n => !n.isGhost).map(n => n.tokenEstimate || 0), 1);
      return nodeRadiusMin + ((node.tokenEstimate || 0) / maxTokens) * (nodeRadiusMax - nodeRadiusMin);
    }
    if (currentData.nodes.length <= 1) return 15;
    const maxInDegree = Math.max(...currentData.nodes.filter(n => !n.isGhost).map(n => n.inDegree), 1);
    return nodeRadiusMin + (node.inDegree / maxInDegree) * (nodeRadiusMax - nodeRadiusMin);
  }

  function getNodeColor(node) {
    if (node.isGhost) return '#e06c75';
    switch (activeMode) {
      case 'reachability': return reachabilityColor(node);
      case 'health': return healthColor(node.healthScore);
      case 'budget': return budgetColor(node.tokenEstimate || 0);
      default: return CATEGORY_COLORS[node.category] || DEFAULT_COLOR;
    }
  }

  function reachabilityColor(node) {
    if (!entryPointId) return CATEGORY_COLORS[node.category] || DEFAULT_COLOR;
    const hops = reachabilityMap.get(node.id);
    if (hops === undefined) return '#555555';
    if (hops === 0) return '#61afef';
    if (hops === 1) return '#98c379';
    if (hops === 2) return '#7ec87e';
    if (hops === 3) return '#e5c07b';
    if (hops === 4) return '#d19a66';
    return '#e06c75';
  }

  function healthColor(score) {
    if (score >= 75) return '#98c379';
    if (score >= 50) return '#e5c07b';
    if (score >= 25) return '#d19a66';
    return '#e06c75';
  }

  function budgetColor(tokens) {
    const maxTokens = Math.max(...currentData.nodes.filter(n => !n.isGhost).map(n => n.tokenEstimate || 0), 1);
    const ratio = tokens / maxTokens;
    if (ratio <= 0.25) return '#98c379';
    if (ratio <= 0.5) return '#e5c07b';
    if (ratio <= 0.75) return '#d19a66';
    return '#e06c75';
  }

  function isNodeVisible(node) {
    if (node.isGhost) return true;
    const matchesSearch = !searchTerm ||
      node.label.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategories.has(node.category);
    return matchesSearch && matchesCategory;
  }

  // SVG setup
  const container = document.getElementById('graph-container');
  const svg = d3.select('#graph');
  let width = container.clientWidth;
  let height = container.clientHeight;

  svg.attr('viewBox', [0, 0, width, height]);

  // Defs: markers + filters
  const defs = svg.append('defs');

  // Arrowhead — only shown on hover/selection edges
  defs.append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 10)
    .attr('refY', 0)
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-3.5L10,0L0,3.5')
    .attr('class', 'arrow-marker');

  defs.append('marker')
    .attr('id', 'arrowhead-suggestion')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 10)
    .attr('refY', 0)
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-3.5L10,0L0,3.5')
    .attr('fill', '#98c379')
    .attr('opacity', 0.6);

  defs.append('marker')
    .attr('id', 'arrowhead-path')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 10)
    .attr('refY', 0)
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-3.5L10,0L0,3.5')
    .attr('fill', '#61afef')
    .attr('opacity', 0.9);

  // Subtle glow filter for nodes
  const glow = defs.append('filter')
    .attr('id', 'node-glow')
    .attr('x', '-50%').attr('y', '-50%')
    .attr('width', '200%').attr('height', '200%');
  glow.append('feGaussianBlur')
    .attr('stdDeviation', '3')
    .attr('result', 'blur');
  glow.append('feComposite')
    .attr('in', 'SourceGraphic')
    .attr('in2', 'blur')
    .attr('operator', 'over');

  // Main group for zoom/pan
  const g = svg.append('g');

  // Zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.1, 5])
    .on('zoom', (event) => {
      currentTransform = event.transform;
      g.attr('transform', event.transform);
    });

  svg.call(zoom);

  // Click on background to deselect
  svg.on('click', function (event) {
    if (event.target === this || event.target === g.node()) {
      deselectNode();
    }
  });

  // Groups (layered order)
  const edgeGroup = g.append('g').attr('class', 'edges');
  const suggestionEdgeGroup = g.append('g').attr('class', 'suggestion-edges');
  const pathEdgeGroup = g.append('g').attr('class', 'path-edges');
  const brokenEdgeGroup = g.append('g').attr('class', 'broken-edges');
  const edgeLabelGroup = g.append('g').attr('class', 'edge-labels');
  const nodeGroup = g.append('g').attr('class', 'nodes');
  const ghostNodeGroup = g.append('g').attr('class', 'ghost-nodes');
  const labelGroup = g.append('g').attr('class', 'labels');
  const badgeGroup = g.append('g').attr('class', 'badges');

  // Tooltip
  const tooltip = document.getElementById('tooltip');

  function showTooltip(event, node) {
    if (node.isGhost) {
      tooltip.innerHTML = `
        <div class="tooltip-title">Missing: ${escapeHtml(node.label)}</div>
        <div class="tooltip-meta"><span>Broken link target</span></div>
      `;
    } else {
      tooltip.innerHTML = `
        <div class="tooltip-title">${escapeHtml(node.label)}</div>
        ${node.summary ? `<div class="tooltip-summary">${escapeHtml(node.summary)}</div>` : ''}
        <div class="tooltip-meta">
          <span>Category: ${node.category}</span>
          <span>In: ${node.inDegree}</span>
          <span>Out: ${node.outDegree}</span>
          <span>~${node.tokenEstimate || 0} tokens</span>
        </div>
        <div class="tooltip-meta">
          <span>Health: ${node.healthScore || 0}/100</span>
          ${node.warnings && node.warnings.length > 0 ? `<span>${node.warnings.length} warnings</span>` : ''}
        </div>
        <div class="tooltip-meta">
          <span>${escapeHtml(node.relativePath)}</span>
        </div>
      `;
    }
    tooltip.classList.add('visible');
    positionTooltip(event);
  }

  function positionTooltip(event) {
    const x = event.clientX + 15;
    const y = event.clientY - 10;
    const rect = tooltip.getBoundingClientRect();

    tooltip.style.left = (x + rect.width > window.innerWidth)
      ? (event.clientX - rect.width - 15) + 'px'
      : x + 'px';
    tooltip.style.top = (y + rect.height > window.innerHeight)
      ? (window.innerHeight - rect.height - 10) + 'px'
      : y + 'px';
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
  }

  // Straight edge coordinate helpers (clipped to node borders)
  function edgeCoords(d) {
    const sx = d.source.x, sy = d.source.y;
    const tx = d.target.x, ty = d.target.y;
    const dx = tx - sx, dy = ty - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return { x1: sx, y1: sy, x2: tx, y2: ty };
    const sourceR = getNodeRadius(d.source);
    const targetR = getNodeRadius(d.target);
    return {
      x1: sx + (dx / dist) * sourceR,
      y1: sy + (dy / dist) * sourceR,
      x2: tx - (dx / dist) * (targetR + 4),
      y2: ty - (dy / dist) * (targetR + 4),
    };
  }

  // Edge label position (midpoint)
  function edgeLabelTransform(d) {
    const mx = (d.source.x + d.target.x) / 2;
    const my = (d.source.y + d.target.y) / 2;
    return `translate(${mx}, ${my})`;
  }

  // Dynamic force parameters — spread nodes out more
  function getForceParams(nodeCount) {
    const charge = -Math.max(1200, 500 + nodeCount * 40);
    const linkDist = Math.max(200, 140 + nodeCount * 5);
    const collideRadius = 30;
    return { charge, linkDist, collideRadius };
  }

  // Fit-to-view
  function fitToView() {
    if (!currentData.nodes || currentData.nodes.length === 0) return;

    const padding = 80;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    currentData.nodes.forEach(n => {
      if (n.x == null || n.y == null) return;
      const r = getNodeRadius(n);
      minX = Math.min(minX, n.x - r);
      maxX = Math.max(maxX, n.x + r);
      minY = Math.min(minY, n.y - r);
      maxY = Math.max(maxY, n.y + r);
    });

    if (!isFinite(minX)) return;

    const graphW = maxX - minX + padding * 2;
    const graphH = maxY - minY + padding * 2;
    const scale = Math.min(width / graphW, height / graphH, 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-cx, -cy);

    svg.transition().duration(500).call(zoom.transform, transform);
  }

  // ==================== MODE SYSTEM ====================

  function setMode(mode) {
    if (activeMode === mode) {
      // Toggle off
      activeMode = null;
    } else {
      activeMode = mode;
    }

    // Reset mode-specific state
    if (activeMode !== 'reachability') {
      entryPointId = null;
      reachabilityMap = new Map();
    }
    if (activeMode !== 'path') {
      pathSource = null;
      pathTarget = null;
      currentPath = null;
    }

    // Update button active states
    ['health', 'budget', 'reachability', 'suggestions', 'path'].forEach(m => {
      const btn = document.getElementById(`btn-${m}`);
      if (btn) btn.classList.toggle('active', activeMode === m);
    });

    // Show/hide mode-specific controls
    const reachControls = document.getElementById('reachability-controls');
    const pathInfo = document.getElementById('path-info');
    const modeLegend = document.getElementById('mode-legend');

    reachControls.classList.toggle('hidden', activeMode !== 'reachability');
    pathInfo.classList.toggle('hidden', activeMode !== 'path');

    // Update legend
    updateModeLegend();
    modeLegend.classList.toggle('hidden', !activeMode || activeMode === 'suggestions' || activeMode === 'path');

    // Populate reachability dropdown
    if (activeMode === 'reachability') {
      populateEntryPointSelect();
    }

    applyModeVisuals();
  }

  function updateModeLegend() {
    const legend = document.getElementById('mode-legend');
    if (!activeMode) { legend.innerHTML = ''; return; }

    let items = [];
    if (activeMode === 'health') {
      items = [
        { color: '#98c379', label: '75-100 (Good)' },
        { color: '#e5c07b', label: '50-74 (Fair)' },
        { color: '#d19a66', label: '25-49 (Poor)' },
        { color: '#e06c75', label: '0-24 (Critical)' },
      ];
    } else if (activeMode === 'budget') {
      items = [
        { color: '#98c379', label: 'Low tokens' },
        { color: '#e5c07b', label: 'Medium' },
        { color: '#d19a66', label: 'High' },
        { color: '#e06c75', label: 'Very high' },
      ];
    } else if (activeMode === 'reachability') {
      items = [
        { color: '#61afef', label: 'Entry point' },
        { color: '#98c379', label: '1 hop' },
        { color: '#e5c07b', label: '3 hops' },
        { color: '#e06c75', label: '5+ hops' },
        { color: '#555555', label: 'Unreachable' },
      ];
    }

    legend.innerHTML = items.map(i =>
      `<div class="legend-item"><span class="legend-dot" style="background:${i.color}"></span>${i.label}</div>`
    ).join('');
  }

  function applyModeVisuals() {
    if (!currentData._circles) return;

    const { _circles: circles, _labels: labels, _edgePaths: edgePaths, _glowCircles: glowCircles } = currentData;

    // Update node colors and radii
    circles
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', d => {
        if (d.isGhost) return '#e06c75';
        if (selectedNode && d.id === selectedNode.id) return '#ffffff';
        return d3.color(getNodeColor(d)).brighter(0.4);
      })
      .attr('r', d => getNodeRadius(d));

    if (glowCircles) {
      glowCircles
        .attr('fill', d => getNodeColor(d))
        .attr('r', d => getNodeRadius(d) + 4);
    }

    // Reachability: gray out unreachable
    if (activeMode === 'reachability' && entryPointId) {
      circles
        .attr('opacity', d => {
          if (d.isGhost) return 0.4;
          return reachabilityMap.has(d.id) ? 1 : 0.15;
        })
        .attr('stroke-dasharray', d => reachabilityMap.has(d.id) ? null : '3,2');

      labels.attr('opacity', d => reachabilityMap.has(d.id) ? 0.85 : 0.1);
    } else if (!selectedNode) {
      circles.attr('stroke-dasharray', d => d.isGhost ? '3,2' : null);
      applyFilters();
    }

    // Suggestion edges
    suggestionEdgeGroup.selectAll('*').remove();
    if (activeMode === 'suggestions' && currentData.backlinkSuggestions) {
      drawSuggestionEdges();
    }

    // Path edges
    pathEdgeGroup.selectAll('*').remove();
    if (activeMode === 'path' && currentPath && currentPath.length > 1) {
      drawPathEdges();
    }
  }

  // ==================== REACHABILITY ====================

  function computeReachability(entryId) {
    const map = new Map();
    const queue = [entryId];
    map.set(entryId, 0);

    // Build adjacency from edges (outgoing only)
    const adj = new Map();
    currentData.edges.forEach(e => {
      if (e.source.isGhost || e.target.isGhost) return;
      const sid = typeof e.source === 'object' ? e.source.id : e.source;
      const tid = typeof e.target === 'object' ? e.target.id : e.target;
      if (!adj.has(sid)) adj.set(sid, []);
      adj.get(sid).push(tid);
    });

    while (queue.length > 0) {
      const current = queue.shift();
      const currentHops = map.get(current);
      const neighbors = adj.get(current) || [];
      for (const neighbor of neighbors) {
        if (!map.has(neighbor)) {
          map.set(neighbor, currentHops + 1);
          queue.push(neighbor);
        }
      }
    }

    return map;
  }

  function populateEntryPointSelect() {
    const select = document.getElementById('entry-point-select');
    select.innerHTML = '<option value="">-- Select --</option>';

    // Sort: prioritize README, index, CLAUDE at top
    const priorityPatterns = ['readme', 'index', 'claude'];
    const sorted = [...currentData.nodes]
      .filter(n => !n.isGhost)
      .sort((a, b) => {
        const aP = priorityPatterns.some(p => a.label.toLowerCase().includes(p)) ? 0 : 1;
        const bP = priorityPatterns.some(p => b.label.toLowerCase().includes(p)) ? 0 : 1;
        if (aP !== bP) return aP - bP;
        return a.label.localeCompare(b.label);
      });

    for (const node of sorted) {
      const opt = document.createElement('option');
      opt.value = node.id;
      opt.textContent = node.label;
      select.appendChild(opt);
    }

    select.addEventListener('change', function () {
      if (this.value) {
        entryPointId = this.value;
        reachabilityMap = computeReachability(entryPointId);
        const reachable = reachabilityMap.size;
        const total = currentData.nodes.filter(n => !n.isGhost).length;
        document.getElementById('reachability-info').textContent =
          `${reachable}/${total} reachable (${Math.round(reachable / total * 100)}%)`;
      } else {
        entryPointId = null;
        reachabilityMap = new Map();
        document.getElementById('reachability-info').textContent = '';
      }
      applyModeVisuals();
    });
  }

  // ==================== PATH ANALYSIS ====================

  function findShortestPath(sourceId, targetId) {
    const prev = new Map();
    const visited = new Set();
    const queue = [sourceId];
    visited.add(sourceId);
    prev.set(sourceId, null);

    // Build adjacency (outgoing)
    const adj = new Map();
    currentData.edges.forEach(e => {
      if (e.source.isGhost || e.target.isGhost) return;
      const sid = typeof e.source === 'object' ? e.source.id : e.source;
      const tid = typeof e.target === 'object' ? e.target.id : e.target;
      if (!adj.has(sid)) adj.set(sid, []);
      adj.get(sid).push(tid);
    });

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === targetId) {
        // Reconstruct path
        const path = [];
        let node = targetId;
        while (node !== null) {
          path.unshift(node);
          node = prev.get(node);
        }
        return path;
      }
      const neighbors = adj.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          prev.set(neighbor, current);
          queue.push(neighbor);
        }
      }
    }

    return null;
  }

  function handlePathClick(node) {
    if (node.isGhost) return;

    if (!pathSource) {
      pathSource = node;
      pathTarget = null;
      currentPath = null;
      updatePathInfo(`Source: ${node.label} — click another node as target`);
    } else if (!pathTarget && node.id !== pathSource.id) {
      pathTarget = node;
      currentPath = findShortestPath(pathSource.id, pathTarget.id);

      if (currentPath) {
        let totalTokens = 0;
        for (const nid of currentPath) {
          const n = currentData.nodes.find(nd => nd.id === nid);
          if (n) totalTokens += (n.tokenEstimate || 0);
        }
        updatePathInfo(`${pathSource.label} → ${pathTarget.label}: ${currentPath.length - 1} hops, ~${totalTokens} tokens`);
      } else {
        updatePathInfo(`No path found from ${pathSource.label} to ${pathTarget.label}`);
      }

      applyModeVisuals();
    } else {
      // Reset
      pathSource = node;
      pathTarget = null;
      currentPath = null;
      updatePathInfo(`Source: ${node.label} — click another node as target`);
      applyModeVisuals();
    }
  }

  function updatePathInfo(text) {
    document.getElementById('path-info-text').textContent = text;
  }

  function drawPathEdges() {
    if (!currentPath || currentPath.length < 2) return;

    const pathSet = new Set(currentPath);

    // Find edges on the path and draw as straight lines
    for (let i = 0; i < currentPath.length - 1; i++) {
      const fromId = currentPath[i];
      const toId = currentPath[i + 1];

      const edge = currentData.edges.find(e => {
        const sid = typeof e.source === 'object' ? e.source.id : e.source;
        const tid = typeof e.target === 'object' ? e.target.id : e.target;
        return sid === fromId && tid === toId;
      });

      if (edge) {
        const c = edgeCoords(edge);
        pathEdgeGroup.append('line')
          .datum(edge)
          .attr('class', 'path-highlight-edge')
          .attr('x1', c.x1).attr('y1', c.y1)
          .attr('x2', c.x2).attr('y2', c.y2)
          .attr('marker-end', 'url(#arrowhead-path)');
      }
    }

    // Highlight path nodes
    if (currentData._circles) {
      currentData._circles
        .classed('path-highlight-node', d => pathSet.has(d.id))
        .attr('opacity', d => {
          if (d.isGhost) return 0.4;
          return pathSet.has(d.id) ? 1 : 0.15;
        });

      currentData._labels
        .attr('opacity', d => pathSet.has(d.id) ? 1 : 0.1);
    }
  }

  function drawSuggestionEdges() {
    suggestionEdgeGroup.selectAll('*').remove();
    const suggestions = currentData.backlinkSuggestions || [];
    for (const s of suggestions) {
      const fromNode = currentData.nodes.find(n => n.id === s.fromId);
      const toNode = currentData.nodes.find(n => n.id === s.toId);
      if (fromNode && toNode && fromNode.x != null && toNode.x != null) {
        suggestionEdgeGroup.append('line')
          .datum({ fromNode, toNode })
          .attr('class', 'suggestion-edge')
          .attr('x1', fromNode.x)
          .attr('y1', fromNode.y)
          .attr('x2', toNode.x)
          .attr('y2', toNode.y);
      }
    }
  }

  // ==================== SELECTION & DETAIL ====================

  function selectNode(node) {
    if (activeMode === 'path') {
      handlePathClick(node);
      return;
    }

    if (selectedNode && selectedNode.id === node.id) {
      deselectNode();
      return;
    }

    selectedNode = node;
    node.fx = node.x;
    node.fy = node.y;

    applySelectionHighlight();
    showDetailPanel(node);
  }

  function deselectNode() {
    if (selectedNode) {
      selectedNode.fx = null;
      selectedNode.fy = null;
      selectedNode = null;
    }
    applyFilters();
    if (activeMode) applyModeVisuals();
    hideDetailPanel();
  }

  function getConnectedIds(node) {
    const ids = new Set([node.id]);
    currentData.edges.forEach(e => {
      const sid = typeof e.source === 'object' ? e.source.id : e.source;
      const tid = typeof e.target === 'object' ? e.target.id : e.target;
      if (sid === node.id) ids.add(tid);
      if (tid === node.id) ids.add(sid);
    });
    return ids;
  }

  function applySelectionHighlight() {
    if (!selectedNode || !currentData._circles) return;

    const { _circles: circles, _labels: labels, _edgePaths: edgePaths, _edgeLabels: edgeLabels } = currentData;
    const connectedIds = getConnectedIds(selectedNode);

    circles
      .attr('opacity', d => connectedIds.has(d.id) ? 1 : 0.08)
      .classed('selected', d => d.id === selectedNode.id)
      .attr('stroke', d => {
        if (d.id === selectedNode.id) return '#ffffff';
        return d3.color(getNodeColor(d)).brighter(0.4);
      });

    if (currentData._glowCircles) {
      currentData._glowCircles.attr('opacity', d => connectedIds.has(d.id) ? 0.25 : 0.02);
    }

    labels.attr('opacity', d => connectedIds.has(d.id) ? 1 : 0.08);

    // Show edges for selected node
    edgePaths
      .attr('stroke-opacity', d => {
        const sid = typeof d.source === 'object' ? d.source.id : d.source;
        const tid = typeof d.target === 'object' ? d.target.id : d.target;
        return (sid === selectedNode.id || tid === selectedNode.id) ? 0.4 : 0;
      })
      .attr('marker-end', d => {
        const sid = typeof d.source === 'object' ? d.source.id : d.source;
        const tid = typeof d.target === 'object' ? d.target.id : d.target;
        return (sid === selectedNode.id || tid === selectedNode.id) ? 'url(#arrowhead)' : null;
      });

    edgeLabels.attr('fill-opacity', d => {
      const sid = typeof d.source === 'object' ? d.source.id : d.source;
      const tid = typeof d.target === 'object' ? d.target.id : d.target;
      return (sid === selectedNode.id || tid === selectedNode.id) ? 0.8 : 0;
    });
  }

  // Detail panel
  function showDetailPanel(node) {
    if (node.isGhost) return;

    const panel = document.getElementById('detail-panel');
    const content = document.getElementById('detail-content');

    // Compute connections
    const incoming = [];
    const outgoing = [];
    currentData.edges.forEach(e => {
      const sid = typeof e.source === 'object' ? e.source.id : e.source;
      const tid = typeof e.target === 'object' ? e.target.id : e.target;
      if (tid === node.id) {
        const src = currentData.nodes.find(n => n.id === sid);
        if (src && !src.isGhost) incoming.push({ node: src, label: e.label });
      }
      if (sid === node.id) {
        const tgt = currentData.nodes.find(n => n.id === tid);
        if (tgt && !tgt.isGhost) outgoing.push({ node: tgt, label: e.label });
      }
    });

    const color = getNodeColor(node);
    const warnings = node.warnings || [];
    const healthScore = node.healthScore || 0;
    const hb = node.healthBreakdown || {};

    content.innerHTML = `
      <div class="detail-title">${escapeHtml(node.label)}</div>
      <div class="detail-category" style="background:${color}">${node.category}</div>
      ${node.summary ? `<div class="detail-summary">${escapeHtml(node.summary)}</div>` : ''}
      <div class="detail-path">${escapeHtml(node.relativePath)}</div>
      <div class="detail-stats">
        <div class="detail-stat">
          <div class="detail-stat-value">${node.inDegree}</div>
          <div class="detail-stat-label">Incoming</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-value">${node.outDegree}</div>
          <div class="detail-stat-label">Outgoing</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-value">~${node.tokenEstimate || 0}</div>
          <div class="detail-stat-label">Tokens</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-value" style="color:${healthColor(healthScore)}">${healthScore}</div>
          <div class="detail-stat-label">Health</div>
        </div>
      </div>

      <div class="detail-section-title">Health Breakdown</div>
      <div class="health-breakdown">
        ${buildBreakdownBar('H1 Title', hb.hasTitle || 0, 10)}
        ${buildBreakdownBar('Overview', hb.hasOverview || 0, 15)}
        ${buildBreakdownBar('Outgoing Links', hb.hasOutgoingLinks || 0, 15)}
        ${buildBreakdownBar('Incoming Links', hb.hasIncomingLinks || 0, 15)}
        ${buildBreakdownBar('Length', hb.adequateLength || 0, 10)}
        ${buildBreakdownBar('Related Section', hb.hasRelatedSection || 0, 10)}
        ${buildBreakdownBar('No Broken Links', hb.noBrokenLinks || 0, 10)}
        ${buildBreakdownBar('Bidirectional', hb.bidirectionalRatio || 0, 15)}
      </div>

      ${warnings.length > 0 ? `
        <div class="detail-section-title">Warnings (${warnings.length})</div>
        <ul class="detail-link-list">
          ${warnings.map(w => `<li style="color:#e5c07b;font-size:12px">${escapeHtml(w.message)}</li>`).join('')}
        </ul>
      ` : ''}

      ${incoming.length > 0 ? `
        <div class="detail-section-title">Incoming (${incoming.length})</div>
        <ul class="detail-link-list">
          ${incoming.map(c => `<li><a data-node-id="${c.node.id}">${escapeHtml(c.node.label)}</a> <span style="opacity:0.4;font-size:10px">${escapeHtml(c.label)}</span></li>`).join('')}
        </ul>
      ` : ''}
      ${outgoing.length > 0 ? `
        <div class="detail-section-title">Outgoing (${outgoing.length})</div>
        <ul class="detail-link-list">
          ${outgoing.map(c => `<li><a data-node-id="${c.node.id}">${escapeHtml(c.node.label)}</a> <span style="opacity:0.4;font-size:10px">${escapeHtml(c.label)}</span></li>`).join('')}
        </ul>
      ` : ''}
      ${activeMode === 'reachability' ? `<button class="detail-open-btn" id="btn-set-entry">Set as Entry Point</button>` : ''}
      <button class="detail-open-btn" data-filepath="${escapeHtml(node.filePath)}">Open File</button>
    `;

    // Wire up
    content.querySelectorAll('a[data-node-id]').forEach(a => {
      a.addEventListener('click', () => {
        const targetNode = currentData.nodes.find(n => n.id === a.dataset.nodeId);
        if (targetNode) selectNode(targetNode);
      });
    });

    content.querySelector('.detail-open-btn[data-filepath]').addEventListener('click', function () {
      vscode.postMessage({ type: 'openFile', filePath: this.dataset.filepath });
    });

    const entryBtn = content.querySelector('#btn-set-entry');
    if (entryBtn) {
      entryBtn.addEventListener('click', () => {
        const select = document.getElementById('entry-point-select');
        select.value = node.id;
        select.dispatchEvent(new Event('change'));
      });
    }

    panel.classList.remove('hidden');
  }

  function buildBreakdownBar(label, value, max) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    const color = pct >= 75 ? '#98c379' : pct >= 50 ? '#e5c07b' : pct > 0 ? '#d19a66' : '#555';
    return `
      <div class="health-breakdown-item">
        <span class="health-breakdown-label">${label}</span>
        <div class="health-breakdown-bar">
          <div class="health-breakdown-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="health-breakdown-value">${value}/${max}</span>
      </div>
    `;
  }

  function hideDetailPanel() {
    document.getElementById('detail-panel').classList.add('hidden');
    if (currentData._circles) {
      currentData._circles.classed('selected', false)
        .attr('stroke', d => d3.color(getNodeColor(d)).brighter(0.4));
    }
  }

  // ==================== INSIGHTS PANEL ====================

  function buildInsightsContent() {
    const content = document.getElementById('insights-content');
    const nodes = currentData.nodes.filter(n => !n.isGhost);
    const edges = currentData.edges;

    let html = '';
    html += buildOverviewCards(nodes, edges);
    html += buildHealthSection(nodes);
    html += buildBudgetSection(nodes);
    html += buildBrokenLinksSection();
    html += buildOrphanSection(nodes);
    html += buildWeakSection(nodes);
    html += buildHubSection(nodes);
    html += buildWarningsSection(nodes);
    html += buildBacklinkSection();
    html += buildSimilaritySection();

    content.innerHTML = html;
    wireInsightsClicks(content);
  }

  function buildOverviewCards(nodes, edges) {
    const totalNodes = nodes.length;
    const totalEdges = edges.length;
    const categories = new Set(nodes.map(n => n.category));
    const avgDegree = totalNodes > 0
      ? (nodes.reduce((s, n) => s + n.inDegree + n.outDegree, 0) / totalNodes).toFixed(1)
      : '0';
    const orphans = nodes.filter(n => (n.inDegree + n.outDegree) === 0);
    const deadEnds = nodes.filter(n => n.outDegree === 0 && n.inDegree > 0);

    return `
      <div class="insights-grid">
        <div class="insight-card">
          <div class="insight-card-value">${totalNodes}</div>
          <div class="insight-card-label">Nodes</div>
        </div>
        <div class="insight-card">
          <div class="insight-card-value">${totalEdges}</div>
          <div class="insight-card-label">Edges</div>
        </div>
        <div class="insight-card">
          <div class="insight-card-value">${avgDegree}</div>
          <div class="insight-card-label">Avg Degree</div>
        </div>
        <div class="insight-card">
          <div class="insight-card-value">${categories.size}</div>
          <div class="insight-card-label">Categories</div>
        </div>
        <div class="insight-card">
          <div class="insight-card-value">${orphans.length}</div>
          <div class="insight-card-label">Orphans</div>
        </div>
        <div class="insight-card">
          <div class="insight-card-value">${deadEnds.length}</div>
          <div class="insight-card-label">Dead Ends</div>
        </div>
      </div>
    `;
  }

  function buildHealthSection(nodes) {
    const globalScore = currentData.globalHealthScore || 0;
    const color = healthColor(globalScore);
    const bottom5 = [...nodes].sort((a, b) => (a.healthScore || 0) - (b.healthScore || 0)).slice(0, 5);

    const gb = currentData.globalHealthBreakdown || {};

    return `
      <div class="insights-section-title">Documentation Health</div>
      <div style="text-align:center;margin:8px 0 12px">
        <div class="health-score-value" style="color:${color}">${globalScore}</div>
        <div style="font-size:10px;opacity:0.55">GLOBAL HEALTH SCORE</div>
      </div>
      <div class="health-breakdown">
        ${buildBreakdownBar('H1 Title', gb.hasTitle || 0, 10)}
        ${buildBreakdownBar('Overview', gb.hasOverview || 0, 15)}
        ${buildBreakdownBar('Outgoing Links', gb.hasOutgoingLinks || 0, 15)}
        ${buildBreakdownBar('Incoming Links', gb.hasIncomingLinks || 0, 15)}
        ${buildBreakdownBar('Length', gb.adequateLength || 0, 10)}
        ${buildBreakdownBar('Related Section', gb.hasRelatedSection || 0, 10)}
        ${buildBreakdownBar('No Broken Links', gb.noBrokenLinks || 0, 10)}
        ${buildBreakdownBar('Bidirectional', gb.bidirectionalRatio || 0, 15)}
      </div>
      <div class="insights-section-title" style="margin-top:12px">Lowest Health (Bottom 5)</div>
      ${bottom5.length > 0
        ? `<ul class="insights-node-list">${bottom5.map(n =>
            `<li><a data-node-id="${n.id}">${escapeHtml(n.label)}</a> <span class="badge" style="background:${healthColor(n.healthScore || 0)};color:#1e1e1e">${n.healthScore || 0}</span></li>`
          ).join('')}</ul>`
        : '<div class="insights-empty">No nodes</div>'
      }
    `;
  }

  function buildBudgetSection(nodes) {
    const total = currentData.totalTokenEstimate || 0;
    const avg = nodes.length > 0 ? Math.round(total / nodes.length) : 0;
    const sorted = [...nodes].sort((a, b) => (b.tokenEstimate || 0) - (a.tokenEstimate || 0));
    const largest = sorted.slice(0, 3);
    const smallest = sorted.slice(-3).reverse();

    return `
      <div class="insights-section-title">Context Window Budget</div>
      <div class="insights-grid" style="margin-bottom:8px">
        <div class="insight-card">
          <div class="insight-card-value">~${total.toLocaleString()}</div>
          <div class="insight-card-label">Total Tokens</div>
        </div>
        <div class="insight-card">
          <div class="insight-card-value">~${avg.toLocaleString()}</div>
          <div class="insight-card-label">Avg Tokens</div>
        </div>
      </div>
      <div style="font-size:11px;opacity:0.55;margin-bottom:4px">LARGEST DOCS</div>
      <ul class="insights-node-list">${largest.map(n =>
        `<li><a data-node-id="${n.id}">${escapeHtml(n.label)}</a> <span class="badge">~${(n.tokenEstimate || 0).toLocaleString()}</span></li>`
      ).join('')}</ul>
      <div style="font-size:11px;opacity:0.55;margin-bottom:4px;margin-top:8px">SMALLEST DOCS</div>
      <ul class="insights-node-list">${smallest.map(n =>
        `<li><a data-node-id="${n.id}">${escapeHtml(n.label)}</a> <span class="badge">~${(n.tokenEstimate || 0).toLocaleString()}</span></li>`
      ).join('')}</ul>
    `;
  }

  function buildBrokenLinksSection() {
    const broken = currentData.brokenLinks || [];
    return `
      <div class="insights-section-title">Broken Links (${broken.length})</div>
      ${broken.length > 0
        ? `<ul class="insights-node-list">${broken.map(bl =>
            `<li><a data-node-id="${bl.sourceId}">${escapeHtml(bl.sourceLabel)}</a> <span style="opacity:0.4;font-size:10px">→ ${escapeHtml(bl.label)}</span></li>`
          ).join('')}</ul>`
        : '<div class="insights-empty">No broken links</div>'
      }
    `;
  }

  function buildOrphanSection(nodes) {
    const orphans = nodes.filter(n => (n.inDegree + n.outDegree) === 0);
    return `
      <div class="insights-section-title">Orphan Nodes (${orphans.length})</div>
      ${orphans.length > 0
        ? `<ul class="insights-node-list">${orphans.map(n =>
            `<li><a data-node-id="${n.id}">${escapeHtml(n.label)}</a></li>`
          ).join('')}</ul>`
        : '<div class="insights-empty">No orphan nodes</div>'
      }
    `;
  }

  function buildWeakSection(nodes) {
    const weak = nodes.filter(n => (n.inDegree + n.outDegree) === 1);
    return `
      <div class="insights-section-title">Weakly Connected (${weak.length})</div>
      ${weak.length > 0
        ? `<ul class="insights-node-list">${weak.map(n =>
            `<li><a data-node-id="${n.id}">${escapeHtml(n.label)}</a> <span class="badge">${n.inDegree + n.outDegree}</span></li>`
          ).join('')}</ul>`
        : '<div class="insights-empty">No weakly connected nodes</div>'
      }
    `;
  }

  function buildHubSection(nodes) {
    const hubs = [...nodes]
      .sort((a, b) => (b.inDegree + b.outDegree) - (a.inDegree + a.outDegree))
      .slice(0, 5);
    return `
      <div class="insights-section-title">Hub Nodes (Top 5)</div>
      ${hubs.length > 0
        ? `<ul class="insights-node-list">${hubs.map(n =>
            `<li><a data-node-id="${n.id}">${escapeHtml(n.label)}</a> <span class="badge">${n.inDegree + n.outDegree}</span></li>`
          ).join('')}</ul>`
        : '<div class="insights-empty">No nodes</div>'
      }
    `;
  }

  function buildWarningsSection(nodes) {
    // Group warnings by type
    const groups = {};
    for (const node of nodes) {
      for (const w of (node.warnings || [])) {
        if (!groups[w.type]) groups[w.type] = [];
        groups[w.type].push(node);
      }
    }

    const types = Object.keys(groups);
    if (types.length === 0) {
      return `
        <div class="insights-section-title">Structure Warnings</div>
        <div class="insights-empty">No warnings</div>
      `;
    }

    let html = `<div class="insights-section-title">Structure Warnings</div>`;
    for (const type of types) {
      const nodeList = groups[type];
      html += `<div style="font-size:11px;opacity:0.7;margin:6px 0 2px;color:#e5c07b">${formatWarningType(type)} (${nodeList.length})</div>`;
      html += `<ul class="insights-node-list">${nodeList.slice(0, 5).map(n =>
        `<li><a data-node-id="${n.id}">${escapeHtml(n.label)}</a></li>`
      ).join('')}${nodeList.length > 5 ? `<li style="opacity:0.4;font-size:11px">+${nodeList.length - 5} more</li>` : ''}</ul>`;
    }
    return html;
  }

  function formatWarningType(type) {
    const map = {
      'missing-h1': 'Missing H1 Title',
      'missing-overview': 'Missing Overview',
      'no-outgoing-links': 'No Outgoing Links',
      'no-related-section': 'No Related Section',
      'too-short': 'Too Short',
      'orphan': 'Orphan',
    };
    return map[type] || type;
  }

  function buildBacklinkSection() {
    const suggestions = currentData.backlinkSuggestions || [];
    return `
      <div class="insights-section-title">Missing Backlinks (${suggestions.length})</div>
      ${suggestions.length > 0
        ? `<ul class="insights-node-list">${suggestions.slice(0, 10).map(s =>
            `<li style="font-size:11px"><a data-node-id="${s.fromId}">${escapeHtml(s.fromLabel)}</a> <span style="opacity:0.4">should link back to</span> <a data-node-id="${s.toId}">${escapeHtml(s.toLabel)}</a></li>`
          ).join('')}${suggestions.length > 10 ? `<li style="opacity:0.4;font-size:11px">+${suggestions.length - 10} more</li>` : ''}</ul>`
        : '<div class="insights-empty">All links are bidirectional</div>'
      }
    `;
  }

  function buildSimilaritySection() {
    const suggestions = currentData.similaritySuggestions || [];
    return `
      <div class="insights-section-title">Suggested Links (${suggestions.length})</div>
      ${suggestions.length > 0
        ? `<ul class="insights-node-list">${suggestions.slice(0, 10).map(s =>
            `<li style="font-size:11px"><a data-node-id="${s.nodeAId}">${escapeHtml(s.nodeALabel)}</a> <span style="opacity:0.4">↔</span> <a data-node-id="${s.nodeBId}">${escapeHtml(s.nodeBLabel)}</a> <span class="badge">${Math.round(s.similarityScore * 100)}%</span></li>`
          ).join('')}${suggestions.length > 10 ? `<li style="opacity:0.4;font-size:11px">+${suggestions.length - 10} more</li>` : ''}</ul>`
        : '<div class="insights-empty">No similar unlinked docs found</div>'
      }
    `;
  }

  function wireInsightsClicks(container) {
    container.querySelectorAll('a[data-node-id]').forEach(a => {
      a.addEventListener('click', () => {
        const targetNode = currentData.nodes.find(n => n.id === a.dataset.nodeId);
        if (targetNode) selectNode(targetNode);
      });
    });
  }

  function toggleInsightsPanel() {
    const panel = document.getElementById('insights-panel');
    const btn = document.getElementById('btn-insights');
    const isHidden = panel.classList.contains('hidden');

    if (isHidden) {
      buildInsightsContent();
      panel.classList.remove('hidden');
      btn.classList.add('active');
    } else {
      panel.classList.add('hidden');
      btn.classList.remove('active');
    }
    handleResize();
  }

  // ==================== BUILD GRAPH ====================

  function buildGraph(data) {
    currentData = data;

    // Separate real nodes from ghost data
    const realNodes = data.nodes.map(n => ({ ...n }));
    const edges = data.edges.map(e => ({
      ...e,
      source: e.source,
      target: e.target,
    }));

    // Build ghost nodes from broken links
    const ghostNodes = [];
    const ghostEdges = [];
    const brokenLinks = data.brokenLinks || [];
    const ghostMap = new Map();

    for (const bl of brokenLinks) {
      if (!ghostMap.has(bl.targetPath)) {
        const ghostNode = {
          id: bl.targetPath,
          label: bl.label,
          isGhost: true,
          x: null,
          y: null,
        };
        ghostMap.set(bl.targetPath, ghostNode);
        ghostNodes.push(ghostNode);
      }
      ghostEdges.push({
        source: bl.sourceId,
        target: bl.targetPath,
        label: bl.label,
        isBroken: true,
      });
    }

    const allNodes = [...realNodes, ...ghostNodes];
    const allEdges = [...edges, ...ghostEdges];

    // Clear existing
    edgeGroup.selectAll('*').remove();
    edgeLabelGroup.selectAll('*').remove();
    nodeGroup.selectAll('*').remove();
    ghostNodeGroup.selectAll('*').remove();
    labelGroup.selectAll('*').remove();
    badgeGroup.selectAll('*').remove();
    brokenEdgeGroup.selectAll('*').remove();
    suggestionEdgeGroup.selectAll('*').remove();
    pathEdgeGroup.selectAll('*').remove();

    // Draw normal edges as straight lines (hidden by default)
    const edgePaths = edgeGroup.selectAll('line')
      .data(edges)
      .join('line')
      .attr('class', 'edge-line');

    const edgeLabels = edgeLabelGroup.selectAll('text')
      .data(edges)
      .join('text')
      .attr('class', 'edge-label')
      .attr('text-anchor', 'middle')
      .attr('dy', -4)
      .text(d => d.label);

    // Draw broken edges
    const brokenEdgePaths = brokenEdgeGroup.selectAll('line')
      .data(ghostEdges)
      .join('line')
      .attr('class', 'broken-edge');

    // Draw real nodes — glow layer underneath
    const glowCircles = nodeGroup.selectAll('circle.node-glow')
      .data(realNodes)
      .join('circle')
      .attr('class', 'node-glow-circle')
      .attr('r', d => getNodeRadius(d) + 4)
      .attr('fill', d => getNodeColor(d))
      .attr('opacity', 0.15)
      .attr('filter', 'url(#node-glow)');

    const circles = nodeGroup.selectAll('circle.node-circle')
      .data(realNodes)
      .join('circle')
      .attr('class', 'node-circle')
      .attr('r', d => getNodeRadius(d))
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', d => d3.color(getNodeColor(d)).brighter(0.4))
      .call(drag());

    // Draw ghost nodes
    const ghosts = ghostNodeGroup.selectAll('circle')
      .data(ghostNodes)
      .join('circle')
      .attr('class', 'ghost-node')
      .attr('r', 6);

    // Draw labels — positioned below node
    const labels = labelGroup.selectAll('text')
      .data(realNodes)
      .join('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .text(d => truncateLabel(d.label, 22));

    // Warning badges
    const badges = badgeGroup.selectAll('g')
      .data(realNodes.filter(n => n.warnings && n.warnings.length > 0))
      .join('g')
      .attr('class', 'warning-badge');

    badges.append('circle')
      .attr('r', 7)
      .attr('fill', '#d19a66');

    badges.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 3.5)
      .attr('font-size', '9px')
      .attr('fill', '#1e1e1e')
      .attr('font-weight', '700')
      .text(d => d.warnings.length);

    // Node interactions
    circles
      .on('mouseover', function (event, d) {
        if (!selectedNode) {
          showTooltip(event, d);
          highlightConnected(d, edges, circles, labels, edgePaths, edgeLabels);
        } else {
          showTooltip(event, d);
        }
      })
      .on('mousemove', function (event) {
        positionTooltip(event);
      })
      .on('mouseout', function () {
        hideTooltip();
        if (!selectedNode) {
          resetHighlight();
        }
      })
      .on('click', function (event, d) {
        event.stopPropagation();
        selectNode(d);
      });

    ghosts
      .on('mouseover', function (event, d) { showTooltip(event, d); })
      .on('mousemove', function (event) { positionTooltip(event); })
      .on('mouseout', function () { hideTooltip(); });

    // Dynamic force params
    const fp = getForceParams(allNodes.length);

    // Force simulation
    simulation = d3.forceSimulation(allNodes)
      .force('link', d3.forceLink(allEdges)
        .id(d => d.id)
        .distance(fp.linkDist)
        .strength(d => d.isBroken ? 0.3 : 0.7))
      .force('charge', d3.forceManyBody()
        .strength(fp.charge))
      .force('center', d3.forceCenter(width / 2, height / 2)
        .strength(0.05))
      .force('collide', d3.forceCollide()
        .radius(d => getNodeRadius(d) + fp.collideRadius))
      .alphaDecay(0.02)
      .velocityDecay(0.3)
      .on('tick', () => {
        // Straight edges — clip to node borders
        edgePaths.each(function (d) {
          const c = edgeCoords(d);
          d3.select(this)
            .attr('x1', c.x1).attr('y1', c.y1)
            .attr('x2', c.x2).attr('y2', c.y2);
        });

        edgeLabels.attr('transform', edgeLabelTransform);

        // Nodes
        glowCircles.attr('cx', d => d.x).attr('cy', d => d.y);
        circles.attr('cx', d => d.x).attr('cy', d => d.y);
        ghosts.attr('cx', d => d.x).attr('cy', d => d.y);

        // Broken edges
        brokenEdgePaths.each(function (d) {
          const src = typeof d.source === 'object' ? d.source : allNodes.find(n => n.id === d.source);
          const tgt = typeof d.target === 'object' ? d.target : allNodes.find(n => n.id === d.target);
          d3.select(this)
            .attr('x1', src ? src.x : 0).attr('y1', src ? src.y : 0)
            .attr('x2', tgt ? tgt.x : 0).attr('y2', tgt ? tgt.y : 0);
        });

        // Labels below node, centered
        labels
          .attr('x', d => d.x)
          .attr('y', d => d.y + getNodeRadius(d) + 14);

        // Warning badges position (top-right of node)
        badges.attr('transform', d => `translate(${d.x + getNodeRadius(d) - 2}, ${d.y - getNodeRadius(d) + 2})`);

        // Update suggestion edges on tick
        if (activeMode === 'suggestions') {
          suggestionEdgeGroup.selectAll('line').each(function () {
            const d = d3.select(this).datum();
            if (d && d.fromNode && d.toNode) {
              d3.select(this)
                .attr('x1', d.fromNode.x).attr('y1', d.fromNode.y)
                .attr('x2', d.toNode.x).attr('y2', d.toNode.y);
            }
          });
        }

        // Update path edges on tick
        if (activeMode === 'path' && currentPath) {
          pathEdgeGroup.selectAll('line').each(function (d) {
            const c = edgeCoords(d);
            d3.select(this)
              .attr('x1', c.x1).attr('y1', c.y1)
              .attr('x2', c.x2).attr('y2', c.y2);
          });
        }
      });

    // Store references
    currentData.nodes = allNodes;
    currentData.edges = allEdges;
    currentData._circles = circles;
    currentData._glowCircles = glowCircles;
    currentData._ghosts = ghosts;
    currentData._labels = labels;
    currentData._edgePaths = edgePaths;
    currentData._edgeLabels = edgeLabels;
    currentData._badges = badges;

    // Apply default state
    applyFilters();
    if (activeMode) applyModeVisuals();

    // Auto-fit after simulation settles
    simulation.on('end', () => {
      fitToView();
    });
  }

  // Highlight connected nodes/edges on hover — edges appear only here
  function highlightConnected(node, edges, circles, labels, edgePaths, edgeLabels) {
    const connectedIds = getConnectedIds(node);

    circles.attr('opacity', d => connectedIds.has(d.id) ? 1 : 0.08);
    labels.attr('opacity', d => connectedIds.has(d.id) ? 1 : 0.08);

    if (currentData._glowCircles) {
      currentData._glowCircles.attr('opacity', d => connectedIds.has(d.id) ? 0.25 : 0.02);
    }

    // Show edges connected to hovered node
    edgePaths
      .attr('stroke-opacity', d => {
        const sid = typeof d.source === 'object' ? d.source.id : d.source;
        const tid = typeof d.target === 'object' ? d.target.id : d.target;
        return (sid === node.id || tid === node.id) ? 0.35 : 0;
      })
      .attr('marker-end', d => {
        const sid = typeof d.source === 'object' ? d.source.id : d.source;
        const tid = typeof d.target === 'object' ? d.target.id : d.target;
        return (sid === node.id || tid === node.id) ? 'url(#arrowhead)' : null;
      });

    edgeLabels.attr('fill-opacity', d => {
      const sid = typeof d.source === 'object' ? d.source.id : d.source;
      const tid = typeof d.target === 'object' ? d.target.id : d.target;
      return (sid === node.id || tid === node.id) ? 0.8 : 0;
    });
  }

  function resetHighlight() {
    applyFilters();
    if (activeMode) applyModeVisuals();
  }

  // Drag behavior
  function drag() {
    return d3.drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.1).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        if (!selectedNode || selectedNode.id !== d.id) {
          d.fx = null;
          d.fy = null;
        }
      });
  }

  // Apply search + category filters (default state)
  function applyFilters() {
    if (!currentData._circles) return;

    const { _circles: circles, _glowCircles: glowCircles, _labels: labels, _edgePaths: edgePaths, _edgeLabels: edgeLabels } = currentData;

    if (selectedNode) {
      applySelectionHighlight();
      return;
    }

    circles
      .attr('opacity', d => isNodeVisible(d) ? 1 : 0.08)
      .classed('selected', false)
      .attr('stroke', d => d3.color(getNodeColor(d)).brighter(0.4));

    if (glowCircles) {
      glowCircles
        .attr('opacity', d => isNodeVisible(d) ? 0.15 : 0.02)
        .attr('fill', d => getNodeColor(d));
    }

    // Show all labels (centered below node)
    labels.attr('opacity', d => {
      if (!isNodeVisible(d)) return 0.05;
      if (searchTerm) return 1;
      return (d.inDegree + d.outDegree) > 1 ? 0.8 : 0.4;
    });

    // Edges visible at subtle opacity by default
    edgePaths
      .attr('stroke-opacity', d => {
        const s = typeof d.source === 'object' ? d.source : currentData.nodes.find(n => n.id === d.source);
        const t = typeof d.target === 'object' ? d.target : currentData.nodes.find(n => n.id === d.target);
        return (s && isNodeVisible(s) && t && isNodeVisible(t)) ? 0.12 : 0.02;
      })
      .attr('marker-end', 'url(#arrowhead)');

    edgeLabels.attr('fill-opacity', 0);
  }

  // Search
  document.getElementById('search').addEventListener('input', function (e) {
    searchTerm = e.target.value;
    applyFilters();
    if (activeMode) applyModeVisuals();
  });

  // Category filters
  function buildCategoryFilters() {
    const filtersContainer = document.getElementById('category-filters');
    filtersContainer.innerHTML = '';

    const categories = [...new Set(currentData.nodes.filter(n => !n.isGhost).map(n => n.category))].sort();

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'category-btn active';
      btn.innerHTML = `<span class="dot" style="background:${CATEGORY_COLORS[cat] || DEFAULT_COLOR}"></span>${cat}`;
      btn.addEventListener('click', () => {
        if (activeCategories.has(cat)) {
          activeCategories.delete(cat);
          btn.classList.remove('active');
          btn.classList.add('dimmed');
        } else {
          activeCategories.add(cat);
          btn.classList.add('active');
          btn.classList.remove('dimmed');
        }
        applyFilters();
        if (activeMode) applyModeVisuals();
      });
      filtersContainer.appendChild(btn);
    });
  }

  // Utilities
  function truncateLabel(str, max) {
    return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Handle resize
  function handleResize() {
    width = container.clientWidth;
    height = container.clientHeight;
    svg.attr('viewBox', [0, 0, width, height]);
    if (simulation) {
      simulation.force('center', d3.forceCenter(width / 2, height / 2).strength(0.05));
      simulation.alpha(0.3).restart();
    }
  }

  // ==================== BUTTON WIRING ====================

  document.getElementById('btn-fit').addEventListener('click', fitToView);
  document.getElementById('btn-insights').addEventListener('click', toggleInsightsPanel);
  document.getElementById('detail-close').addEventListener('click', deselectNode);
  document.getElementById('insights-close').addEventListener('click', toggleInsightsPanel);

  // Mode buttons
  document.getElementById('btn-health').addEventListener('click', () => setMode('health'));
  document.getElementById('btn-budget').addEventListener('click', () => setMode('budget'));
  document.getElementById('btn-reachability').addEventListener('click', () => setMode('reachability'));
  document.getElementById('btn-suggestions').addEventListener('click', () => setMode('suggestions'));
  document.getElementById('btn-path').addEventListener('click', () => setMode('path'));

  // Export buttons
  document.getElementById('btn-export-index').addEventListener('click', () => {
    vscode.postMessage({ type: 'exportIndex' });
  });
  document.getElementById('btn-export-json').addEventListener('click', () => {
    vscode.postMessage({ type: 'exportJson' });
  });

  // Path clear
  document.getElementById('path-clear').addEventListener('click', () => {
    pathSource = null;
    pathTarget = null;
    currentPath = null;
    updatePathInfo('Click a node to set as source');
    applyModeVisuals();
    applyFilters();
  });

  // Handle live updates from file watcher
  window.addEventListener('message', function (event) {
    const message = event.data;
    if (message.type === 'updateGraph') {
      selectedNode = null;
      hideDetailPanel();
      buildGraph(message.data);
      buildCategoryFilters();
      // Restore zoom
      g.attr('transform', currentTransform);
    }
  });

  // Handle window resize
  window.addEventListener('resize', handleResize);

  // Initial render
  buildGraph(currentData);
  buildCategoryFilters();
})();
