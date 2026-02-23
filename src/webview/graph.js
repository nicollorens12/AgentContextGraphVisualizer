// Knowledge Graph d3-force Visualization
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

  // Sizing
  const nodeRadiusMin = 8;
  const nodeRadiusMax = 30;

  function getNodeRadius(node) {
    if (currentData.nodes.length <= 1) return 15;
    const maxInDegree = Math.max(...currentData.nodes.map(n => n.inDegree), 1);
    return nodeRadiusMin + (node.inDegree / maxInDegree) * (nodeRadiusMax - nodeRadiusMin);
  }

  function getNodeColor(node) {
    return CATEGORY_COLORS[node.category] || DEFAULT_COLOR;
  }

  function isNodeVisible(node) {
    const matchesSearch = !searchTerm ||
      node.label.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategories.has(node.category);
    return matchesSearch && matchesCategory;
  }

  // SVG setup
  const container = document.getElementById('graph-container');
  const svg = d3.select('#graph');
  const width = container.clientWidth;
  const height = container.clientHeight;

  svg.attr('viewBox', [0, 0, width, height]);

  // Arrow marker definition
  const defs = svg.append('defs');

  defs.append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 10)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-4L10,0L0,4')
    .attr('class', 'arrow-marker');

  // Main group for zoom/pan
  const g = svg.append('g');

  // Zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', (event) => {
      currentTransform = event.transform;
      g.attr('transform', event.transform);
    });

  svg.call(zoom);

  // Edge group (below nodes)
  const edgeGroup = g.append('g').attr('class', 'edges');
  const edgeLabelGroup = g.append('g').attr('class', 'edge-labels');
  const nodeGroup = g.append('g').attr('class', 'nodes');
  const labelGroup = g.append('g').attr('class', 'labels');

  // Tooltip
  const tooltip = document.getElementById('tooltip');

  function showTooltip(event, node) {
    tooltip.innerHTML = `
      <div class="tooltip-title">${escapeHtml(node.label)}</div>
      ${node.summary ? `<div class="tooltip-summary">${escapeHtml(node.summary)}</div>` : ''}
      <div class="tooltip-meta">
        <span>Category: ${node.category}</span>
        <span>In: ${node.inDegree}</span>
        <span>Out: ${node.outDegree}</span>
      </div>
      <div class="tooltip-meta">
        <span>${escapeHtml(node.relativePath)}</span>
      </div>
    `;
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

  // Curved edge path generator
  function edgeArc(d) {
    const sourceR = getNodeRadius(d.source);
    const targetR = getNodeRadius(d.target);

    const dx = d.target.x - d.source.x;
    const dy = d.target.y - d.source.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return '';

    // Shorten path by node radii
    const sx = d.source.x + (dx / dist) * sourceR;
    const sy = d.source.y + (dy / dist) * sourceR;
    const tx = d.target.x - (dx / dist) * (targetR + 6); // +6 for arrowhead
    const ty = d.target.y - (dy / dist) * (targetR + 6);

    // Curve amount — check for bidirectional edges
    const hasReverse = currentData.edges.some(
      e => e.source.id === d.target.id && e.target.id === d.source.id
    );
    const curvature = hasReverse ? 0.2 : 0.05;
    const sweep = dist * curvature;

    return `M${sx},${sy} A${sweep},${sweep} 0 0,1 ${tx},${ty}`;
  }

  // Edge label position
  function edgeLabelTransform(d) {
    const mx = (d.source.x + d.target.x) / 2;
    const my = (d.source.y + d.target.y) / 2;
    return `translate(${mx}, ${my})`;
  }

  // Build the visualization
  function buildGraph(data) {
    currentData = data;

    // Prepare d3 data
    const nodes = data.nodes.map(n => ({ ...n }));
    const edges = data.edges.map(e => ({
      ...e,
      source: e.source,
      target: e.target,
    }));

    // Clear existing
    edgeGroup.selectAll('*').remove();
    edgeLabelGroup.selectAll('*').remove();
    nodeGroup.selectAll('*').remove();
    labelGroup.selectAll('*').remove();

    // Draw edges
    const edgePaths = edgeGroup.selectAll('path')
      .data(edges)
      .join('path')
      .attr('class', 'edge-path')
      .attr('marker-end', 'url(#arrowhead)');

    const edgeLabels = edgeLabelGroup.selectAll('text')
      .data(edges)
      .join('text')
      .attr('class', 'edge-label')
      .attr('text-anchor', 'middle')
      .attr('dy', -4)
      .text(d => d.label);

    // Draw nodes
    const circles = nodeGroup.selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('class', 'node-circle')
      .attr('r', d => getNodeRadius(d))
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', d => d3.color(getNodeColor(d)).darker(0.3))
      .call(drag());

    // Draw labels
    const labels = labelGroup.selectAll('text')
      .data(nodes)
      .join('text')
      .attr('class', 'node-label')
      .attr('dy', 4)
      .text(d => truncateLabel(d.label, 25));

    // Node interactions
    circles
      .on('mouseover', function (event, d) {
        showTooltip(event, d);
        highlightConnected(d, edges, circles, labels, edgePaths, edgeLabels);
      })
      .on('mousemove', function (event) {
        positionTooltip(event);
      })
      .on('mouseout', function () {
        hideTooltip();
        resetHighlight(circles, labels, edgePaths, edgeLabels);
      })
      .on('click', function (event, d) {
        vscode.postMessage({ type: 'openFile', filePath: d.filePath });
      });

    // Force simulation
    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges)
        .id(d => d.id)
        .distance(120)
        .strength(0.7))
      .force('charge', d3.forceManyBody()
        .strength(-300)
        .distanceMax(400))
      .force('center', d3.forceCenter(width / 2, height / 2)
        .strength(0.05))
      .force('collide', d3.forceCollide()
        .radius(d => getNodeRadius(d) + 5))
      .alphaDecay(0.02)
      .velocityDecay(0.3)
      .on('tick', () => {
        edgePaths.attr('d', edgeArc);
        edgeLabels.attr('transform', edgeLabelTransform);
        circles.attr('cx', d => d.x).attr('cy', d => d.y);
        labels.attr('x', d => d.x + getNodeRadius(d) + 5).attr('y', d => d.y);
      });

    // Store references for filtering
    currentData.nodes = nodes;
    currentData.edges = edges;
    currentData._circles = circles;
    currentData._labels = labels;
    currentData._edgePaths = edgePaths;
    currentData._edgeLabels = edgeLabels;

    applyFilters();
  }

  // Highlight connected nodes/edges on hover
  function highlightConnected(node, edges, circles, labels, edgePaths, edgeLabels) {
    const connectedIds = new Set([node.id]);
    edges.forEach(e => {
      const sid = typeof e.source === 'object' ? e.source.id : e.source;
      const tid = typeof e.target === 'object' ? e.target.id : e.target;
      if (sid === node.id) connectedIds.add(tid);
      if (tid === node.id) connectedIds.add(sid);
    });

    circles.attr('opacity', d => connectedIds.has(d.id) ? 1 : 0.08);
    labels.attr('opacity', d => connectedIds.has(d.id) ? 1 : 0.08);

    edgePaths.attr('stroke-opacity', d => {
      const sid = typeof d.source === 'object' ? d.source.id : d.source;
      const tid = typeof d.target === 'object' ? d.target.id : d.target;
      return (sid === node.id || tid === node.id) ? 0.8 : 0.03;
    });

    edgeLabels.attr('fill-opacity', d => {
      const sid = typeof d.source === 'object' ? d.source.id : d.source;
      const tid = typeof d.target === 'object' ? d.target.id : d.target;
      return (sid === node.id || tid === node.id) ? 0.9 : 0;
    });
  }

  function resetHighlight(circles, labels, edgePaths, edgeLabels) {
    applyFilters();
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
        d.fx = null;
        d.fy = null;
      });
  }

  // Apply search + category filters
  function applyFilters() {
    if (!currentData._circles) return;

    const { _circles: circles, _labels: labels, _edgePaths: edgePaths, _edgeLabels: edgeLabels } = currentData;

    circles.attr('opacity', d => isNodeVisible(d) ? 1 : 0.08);
    labels.attr('opacity', d => isNodeVisible(d) ? 1 : 0.08);

    edgePaths.attr('stroke-opacity', d => {
      const s = typeof d.source === 'object' ? d.source : currentData.nodes.find(n => n.id === d.source);
      const t = typeof d.target === 'object' ? d.target : currentData.nodes.find(n => n.id === d.target);
      return (s && isNodeVisible(s) && t && isNodeVisible(t)) ? 0.15 : 0.03;
    });

    edgeLabels.attr('fill-opacity', 0);
  }

  // Search
  document.getElementById('search').addEventListener('input', function (e) {
    searchTerm = e.target.value;
    applyFilters();
  });

  // Category filters
  function buildCategoryFilters() {
    const container = document.getElementById('category-filters');
    container.innerHTML = '';

    const categories = [...new Set(currentData.nodes.map(n => n.category))].sort();

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
      });
      container.appendChild(btn);
    });
  }

  // Legend
  function buildLegend() {
    const legend = document.getElementById('legend');
    legend.innerHTML = '';

    const categories = [...new Set(currentData.nodes.map(n => n.category))].sort();
    categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `<span class="legend-dot" style="background:${CATEGORY_COLORS[cat] || DEFAULT_COLOR}"></span>${cat}`;
      legend.appendChild(item);
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

  // Handle live updates from file watcher
  window.addEventListener('message', function (event) {
    const message = event.data;
    if (message.type === 'updateGraph') {
      // Preserve zoom transform
      buildGraph(message.data);
      buildCategoryFilters();
      buildLegend();
      // Restore zoom
      g.attr('transform', currentTransform);
    }
  });

  // Handle window resize
  window.addEventListener('resize', function () {
    const w = container.clientWidth;
    const h = container.clientHeight;
    svg.attr('viewBox', [0, 0, w, h]);
    if (simulation) {
      simulation.force('center', d3.forceCenter(w / 2, h / 2).strength(0.05));
      simulation.alpha(0.3).restart();
    }
  });

  // Initial render
  buildGraph(currentData);
  buildCategoryFilters();
  buildLegend();
})();
