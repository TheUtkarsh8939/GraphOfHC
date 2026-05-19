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

const DEFAULT_THRESHOLD = 0.55;

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
  const inputPath = getArgValue("input") ?? path.join(__dirname, "embeddings.json");
  const outputPath = getArgValue("output") ?? path.join(__dirname, "graph.json");

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
  for (const id of ids) {
    graph[id] = [];
  }

  let comparisons = 0;
  const totalComparisons = (total * (total - 1)) / 2;

  for (let i = 0; i < total; i += 1) {
    for (let j = i + 1; j < total; j += 1) {
      const similarity = dot(vectors[i], vectors[j]);
      if (similarity >= threshold) {
        graph[ids[i]].push({ id: ids[j], weight: similarity });
        graph[ids[j]].push({ id: ids[i], weight: similarity });
      }
      comparisons += 1;
    }

    if ((i + 1) % 250 === 0 || i + 1 === total) {
      const percent = ((comparisons / totalComparisons) * 100).toFixed(2);
      console.log(`Progress: ${percent}% (${comparisons}/${totalComparisons})`);
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(graph, null, 2), "utf-8");
  console.log(`Graph saved to ${outputPath} with threshold ${threshold}`);
};

main();
