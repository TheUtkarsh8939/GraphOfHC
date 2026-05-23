import * as fs from "fs";
import * as path from "path";

interface YswsEntry {
  id: string;
  ysws: string;
  code_url: string;
  description: string;
  demo_url: string;
  hours: number;
  name: string;
}

interface Edge {
  id: string;
  weight: number;
}

type Graph = Record<string, Edge[]>;

interface RenderNode extends YswsEntry {
  x: number;
  y: number;
  radius: number;
}

interface RenderEdge {
  source: string;
  target: string;
  weight: number;
  startxy: [number, number];
  endxy: [number, number];
}

interface RenderPayload {
  metadata: {
    length: number;
    breadth: number;
    generatedAt: string;
    nodeCount: number;
    edgeCount: number;
  };
  nodes: RenderNode[];
  edges: RenderEdge[];
}

const DEFAULT_GRAPH_PATH = path.join(process.cwd(), "generated", "graph.json");
const DEFAULT_ENTRIES_PATH = path.join(process.cwd(), "generated", "ysws_entries.json");
const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "static", "render-graph.json");

const DEFAULT_WIDTH = 16000;
const DEFAULT_HEIGHT = 9000;
const DEFAULT_PADDING = 120;
const DEFAULT_RADIUS_SCALE = 1.3;
const DEFAULT_SPACING = 1.2;
const DEFAULT_LAYOUT_MODE = "force";
const DEFAULT_LAYOUT_ITERATIONS = 180;
const DEFAULT_LAYOUT_SEED = 42;
const DEFAULT_REPULSION_SAMPLES = 10;

const getArgValue = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
};

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value: number, precision = 2): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const computeRadius = (hours: number, radiusScale: number): number => {
  const safeHours = Math.max(0, hours);
  // log1p keeps 0-hour nodes valid while preserving logarithmic growth.
  return round(Math.pow(safeHours, 0.6)/4.84 * radiusScale, 2);
};

const phyllotaxisLayout = (
  count: number,
  width: number,
  height: number,
  padding: number,
  spacing: number
): Array<{ x: number; y: number }> => {
  if (count === 0) {
    return [];
  }

  const usableWidth = Math.max(1, width - 2 * padding);
  const usableHeight = Math.max(1, height - 2 * padding);
  const radiusLimit = (Math.min(usableWidth, usableHeight) / 2) * spacing;
  const centerX = width / 2;
  const centerY = height / 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const radial = Math.sqrt(t) * radiusLimit;
    const angle = i * goldenAngle;

    const x = round(centerX + radial * Math.cos(angle), 2);
    const y = round(centerY + radial * Math.sin(angle), 2);
    points.push({ x, y });
  }

  return points;
};

const createRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const forceDirectedLayout = (
  nodeIds: string[],
  graph: Graph,
  width: number,
  height: number,
  padding: number,
  iterations: number,
  seed: number,
  repulsionSamples: number,
  spacing: number,
  edgePull: number
): Map<string, { x: number; y: number }> => {
  const count = nodeIds.length;
  const result = new Map<string, { x: number; y: number }>();
  if (count === 0) {
    return result;
  }

  const minX = padding;
  const maxX = width - padding;
  const minY = padding;
  const maxY = height - padding;

  const usableWidth = Math.max(1, maxX - minX);
  const usableHeight = Math.max(1, maxY - minY);

  const rng = createRng(seed);

  const idToIndex = new Map<string, number>();
  nodeIds.forEach((id, index) => idToIndex.set(id, index));

  const positions = nodeIds.map(() => ({
    x: minX + rng() * usableWidth,
    y: minY + rng() * usableHeight,
  }));

  const allEdges: Array<{ a: number; b: number; w: number }> = [];
  const seen = new Set<string>();
  for (const sourceId of nodeIds) {
    const sourceIdx = idToIndex.get(sourceId);
    if (sourceIdx === undefined) {
      continue;
    }

    for (const edge of graph[sourceId] ?? []) {
      const targetIdx = idToIndex.get(edge.id);
      if (targetIdx === undefined || sourceIdx === targetIdx) {
        continue;
      }

      const a = Math.min(sourceIdx, targetIdx);
      const b = Math.max(sourceIdx, targetIdx);
      const key = `${a}:${b}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      allEdges.push({ a, b, w: Math.max(0.0001, edge.weight) });
    }
  }

  const area = Math.max(1, usableWidth * usableHeight);
  const k = Math.sqrt(area / count) * spacing;
  const maxStep = Math.max(1, k * 0.4);
  const sampleCount = Math.max(2, Math.min(count - 1, repulsionSamples));

  const weightedDegrees = new Array<number>(count).fill(0);
  for (const edge of allEdges) {
    weightedDegrees[edge.a] += edge.w;
    weightedDegrees[edge.b] += edge.w;
  }

  for (let iter = 0; iter < iterations; iter += 1) {
    const dispX = new Array<number>(count).fill(0);
    const dispY = new Array<number>(count).fill(0);

    // Sampled repulsion keeps complexity manageable for large graphs.
    for (let i = 0; i < count; i += 1) {
      for (let s = 0; s < sampleCount; s += 1) {
        const j = Math.floor(rng() * count);
        if (j === i) {
          continue;
        }

        let dx = positions[i].x - positions[j].x;
        let dy = positions[i].y - positions[j].y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 0.01) {
          dx = (rng() - 0.5) * 0.1;
          dy = (rng() - 0.5) * 0.1;
          distSq = dx * dx + dy * dy;
        }

        const dist = Math.sqrt(distSq);
        const force = (k * k) / Math.max(dist, 0.01);
        const ux = dx / dist;
        const uy = dy / dist;

        dispX[i] += ux * force;
        dispY[i] += uy * force;
        dispX[j] -= ux * force;
        dispY[j] -= uy * force;
      }
    }

    // Attraction along graph edges; stronger weights attract more.
    for (const edge of allEdges) {
      const from = positions[edge.a];
      const to = positions[edge.b];
      let dx = from.x - to.x;
      let dy = from.y - to.y;
      const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
      const ux = dx / dist;
      const uy = dy / dist;

      const normalizedWeight = clamp(edge.w, 0, 1);
      const targetLength = k * (1.25 - 0.85 * normalizedWeight);
      const pull = ((dist - targetLength) * (0.08 + normalizedWeight * 0.18));

      dispX[edge.a] -= ux * pull;
      dispY[edge.a] -= uy * pull;
      dispX[edge.b] += ux * pull;
      dispY[edge.b] += uy * pull;
    }

    // Outward gravity that grows toward edges to fight center clumping.
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.max(1, Math.min(usableWidth, usableHeight) / 2);
    const tunedEdgePull = edgePull;
    for (let i = 0; i < count; i += 1) {
      const dx = positions[i].x - centerX;
      const dy = positions[i].y - centerY;
      const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
      const normalized = clamp(dist / maxRadius, 0, 1);
      const force = tunedEdgePull * normalized * normalized;
      dispX[i] += (dx / dist) * force;
      dispY[i] += (dy / dist) * force;
    }

    const progress = iter / Math.max(1, iterations - 1);
    const temperature = maxStep * (1 - progress);

    for (let i = 0; i < count; i += 1) {
      const dx = dispX[i];
      const dy = dispY[i];
      const dispLen = Math.max(0.0001, Math.sqrt(dx * dx + dy * dy));
      const step = Math.min(temperature, dispLen);

      positions[i].x = clamp(positions[i].x + (dx / dispLen) * step, minX, maxX);
      positions[i].y = clamp(positions[i].y + (dy / dispLen) * step, minY, maxY);
    }
  }

  for (let i = 0; i < count; i += 1) {
    result.set(nodeIds[i], {
      x: round(positions[i].x, 2),
      y: round(positions[i].y, 2),
    });
  }

  return result;
};

const main = (): void => {
  const graphPath = getArgValue("graph") ?? DEFAULT_GRAPH_PATH;
  const entriesPath = getArgValue("entries") ?? DEFAULT_ENTRIES_PATH;
  const outputPath = getArgValue("output") ?? DEFAULT_OUTPUT_PATH;

  const width = toNumber(getArgValue("width"), DEFAULT_WIDTH);
  const height = toNumber(getArgValue("height"), DEFAULT_HEIGHT);
  const padding = toNumber(getArgValue("padding"), DEFAULT_PADDING);
  const radiusScale = toNumber(getArgValue("radiusScale"), DEFAULT_RADIUS_SCALE);
  const spacing = Math.max(0.5, toNumber(getArgValue("spacing"), DEFAULT_SPACING));
  const layoutMode = (getArgValue("layout") ?? DEFAULT_LAYOUT_MODE).toLowerCase();
  const layoutIterations = Math.max(1, Math.floor(toNumber(getArgValue("layoutIterations"), DEFAULT_LAYOUT_ITERATIONS)));
  const layoutSeed = Math.floor(toNumber(getArgValue("layoutSeed"), DEFAULT_LAYOUT_SEED));
  const repulsionSamples = Math.max(
    2,
    Math.floor(toNumber(getArgValue("repulsionSamples"), DEFAULT_REPULSION_SAMPLES))
  );
  const edgePull = Math.max(0, toNumber(getArgValue("edgePull"), 0.0035));
  const maxNeighbors = Math.max(1, Math.floor(toNumber(getArgValue("maxNeighbors"), 20)));

  if (width <= 0 || height <= 0) {
    console.error("Width and height must be greater than 0.");
    process.exit(1);
  }

  const graphRaw = fs.readFileSync(graphPath, "utf-8");
  const entriesRaw = fs.readFileSync(entriesPath, "utf-8");

  const graph: Graph = JSON.parse(graphRaw);
  const entries: YswsEntry[] = JSON.parse(entriesRaw);

  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const graphIds = new Set(Object.keys(graph));

  const validEntries = entries.filter((entry) => graphIds.has(entry.id));
  if (validEntries.length === 0) {
    console.error("No overlapping ids found between graph and ysws entries.");
    process.exit(1);
  }

  // Higher-degree nodes first keeps important nodes near the center for non-force fallback.
  validEntries.sort((a, b) => {
    const degreeA = graph[a.id]?.length ?? 0;
    const degreeB = graph[b.id]?.length ?? 0;
    if (degreeA !== degreeB) {
      return degreeB - degreeA;
    }
    return b.hours - a.hours;
  });

  const nodeIds = validEntries.map((entry) => entry.id);
  const forcePositions =
    layoutMode === "force"
      ? forceDirectedLayout(
          nodeIds,
          graph,
          width,
          height,
          padding,
          layoutIterations,
          layoutSeed,
          repulsionSamples,
          spacing,
          edgePull
        )
      : new Map<string, { x: number; y: number }>();

  const points =
    layoutMode === "force"
      ? []
      : phyllotaxisLayout(validEntries.length, width, height, padding, spacing);

  const nodeById = new Map<string, RenderNode>();
  const nodes: RenderNode[] = validEntries.map((entry, index) => {
    const point =
      layoutMode === "force"
        ? forcePositions.get(entry.id) ?? { x: width / 2, y: height / 2 }
        : points[index];
    const node: RenderNode = {
      ...entry,
      x: point.x,
      y: point.y,
      radius: computeRadius(entry.hours, radiusScale),
    };
    nodeById.set(node.id, node);
    return node;
  });

  const seen = new Set<string>();
  const edges: RenderEdge[] = [];
  // Prune neighbor lists to top-N by weight to limit total edges and memory usage.
  // This keeps the strongest relationships while avoiding explosion in high-degree nodes.
  for (const [sourceId, neighbors] of Object.entries(graph)) {
    const source = nodeById.get(sourceId);
    if (!source) continue;

    // sort neighbors by weight desc and take top `maxNeighbors`
    const topNeighbors = (neighbors ?? [])
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxNeighbors);

    for (const neighbor of topNeighbors) {
      const target = nodeById.get(neighbor.id);
      if (!target) continue;

      // graph.json stores both directions; this deduplicates undirected edges.
      const pairKey = sourceId < neighbor.id ? `${sourceId}::${neighbor.id}` : `${neighbor.id}::${sourceId}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      edges.push({
        source: sourceId,
        target: neighbor.id,
        weight: round(neighbor.weight, 6),
        startxy: [source.x, source.y],
        endxy: [target.x, target.y],
      });
    }
  }

  const payload: RenderPayload = {
    metadata: {
      length: width,
      breadth: height,
      generatedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
    nodes,
    edges,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf-8");

  const orphanEntries = entries.length - validEntries.length;
  const orphanGraphNodes = [...graphIds].filter((id) => !entryById.has(id)).length;

  console.log(`Render graph written to ${outputPath}`);
  console.log(`Nodes: ${nodes.length}, Edges: ${edges.length}`);
  console.log(
    `Layout: ${layoutMode}${
      layoutMode === "force"
        ? ` (iterations=${layoutIterations}, seed=${layoutSeed}, repulsionSamples=${repulsionSamples})`
        : ""
    }`
  );
  if (orphanEntries > 0 || orphanGraphNodes > 0) {
    console.log(
      `Skipped ${orphanEntries} entry records not present in graph and ${orphanGraphNodes} graph ids not present in entries.`
    );
  }
};

main();