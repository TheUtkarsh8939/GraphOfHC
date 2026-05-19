import * as fs from "fs";
import * as path from "path";

interface EmbeddingRecord {
  id: string;
  embedding: number[];
}

interface Edge {
  id: string;
  weight: number;
}

type Graph = Record<string, Edge[]>;

const DEFAULT_THRESHOLD = 0.5;
const DEFAULT_MAX_NEIGHBORS = 20;

const getArgValue = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
};

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalize = (vector: number[]): number[] => {
  let sumSquares = 0;
  for (const value of vector) {
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) {
    return vector.map(() => 0);
  }
  return vector.map((value) => value / norm);
};

const dot = (a: number[], b: number[]): number => {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    total += a[i] * b[i];
  }
  return total;
};

const main = (): void => {
  const threshold = toNumber(getArgValue("threshold"), DEFAULT_THRESHOLD);
  const maxNeighbors = Math.max(1, Math.floor(toNumber(getArgValue("maxNeighbors"), DEFAULT_MAX_NEIGHBORS)));
  const inputPath = getArgValue("input") ?? path.join(__dirname, "../generated/embeddings.json");
  const outputPath = getArgValue("output") ?? path.join(__dirname, "../generated/graph.json");

  if (threshold < -1 || threshold > 1) {
    console.error("Threshold must be between -1 and 1.");
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf-8");
  const records: EmbeddingRecord[] = JSON.parse(raw);
  const total = records.length;

  if (total === 0) {
    console.error("No embeddings found in input file.");
    process.exit(1);
  }

  const ids = records.map((record) => record.id);
  const vectors = records.map((record) => normalize(record.embedding));

  const graph: Graph = {};
  for (const id of ids) graph[id] = [];

  // Keep only one candidate per pair (i < j) for later capped selection.
  const candidates: Array<{ a: string; b: string; weight: number }> = [];

  let comparisons = 0;
  const totalComparisons = (total * (total - 1)) / 2;

  for (let i = 0; i < total; i += 1) {
    for (let j = i + 1; j < total; j += 1) {
      const similarity = dot(vectors[i], vectors[j]);
      if (similarity >= threshold) {
        candidates.push({ a: ids[i], b: ids[j], weight: similarity });
      }
      comparisons += 1;
    }

    if ((i + 1) % 250 === 0 || i + 1 === total) {
      const percent = ((comparisons / totalComparisons) * 100).toFixed(2);
      console.log(`Progress: ${percent}% (${comparisons}/${totalComparisons})`);
    }
  }

  // Strongest edges first: this preserves the most relevant relationships under the cap.
  candidates.sort((x, y) => y.weight - x.weight);

  const degree = new Map<string, number>();
  for (const id of ids) degree.set(id, 0);

  const selected: Array<{ a: string; b: string; weight: number }> = [];

  // Pass 1: reduce isolated nodes by prioritizing edges touching uncovered nodes.
  for (const edge of candidates) {
    const da = degree.get(edge.a) ?? 0;
    const db = degree.get(edge.b) ?? 0;
    if (da >= maxNeighbors || db >= maxNeighbors) continue;
    if (da === 0 || db === 0) {
      selected.push(edge);
      degree.set(edge.a, da + 1);
      degree.set(edge.b, db + 1);
    }
  }

  // Pass 2: fill remaining capacity by weight.
  for (const edge of candidates) {
    const da = degree.get(edge.a) ?? 0;
    const db = degree.get(edge.b) ?? 0;
    if (da >= maxNeighbors || db >= maxNeighbors) continue;
    selected.push(edge);
    degree.set(edge.a, da + 1);
    degree.set(edge.b, db + 1);
  }

  // Build symmetric adjacency lists from selected edges.
  for (const edge of selected) {
    graph[edge.a].push({ id: edge.b, weight: edge.weight });
    graph[edge.b].push({ id: edge.a, weight: edge.weight });
  }

  let isolated = 0;
  let maxDegreeObserved = 0;
  for (const id of ids) {
    const d = graph[id].length;
    if (d === 0) isolated += 1;
    if (d > maxDegreeObserved) maxDegreeObserved = d;
  }

  const undirectedEdges = selected.length;
  console.log(
    `Prune summary: candidates=${candidates.length}, selected=${undirectedEdges}, maxNeighbors=${maxNeighbors}, isolated=${isolated}, maxDegree=${maxDegreeObserved}`
  );

  fs.writeFileSync(outputPath, JSON.stringify(graph, null, 2), "utf-8");
  console.log(`Graph saved to ${outputPath} with threshold ${threshold} and maxNeighbors ${maxNeighbors}`);
};

main();
