import { promises as fs } from "fs";
import path from "path";

type ReadmeEntry = {
  id: string;
  description?: string;
  readme?: string;
};

const DEFAULT_BASE_PATH = path.join(process.cwd(), "generated", "readmes.json");
const DEFAULT_DELTA_PATH = path.join(process.cwd(), "generated", "readmes_delta.json");
const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "generated", "readmes.json");

const readJsonArray = async (filePath: string): Promise<ReadmeEntry[]> => {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as ReadmeEntry[]) : [];
};

const writeJson = async (filePath: string, data: ReadmeEntry[]): Promise<void> => {
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(filePath, payload, "utf8");
};

const pickText = (current?: string, incoming?: string): string => {
  const currentValue = (current ?? "").trim();
  const incomingValue = (incoming ?? "").trim();
  if (incomingValue.length > 0) {
    return incomingValue;
  }
  return currentValue;
};

const resolvePaths = () => {
  const [basePathArg, deltaPathArg, outputPathArg] = process.argv.slice(2);
  return {
    basePath: basePathArg ?? DEFAULT_BASE_PATH,
    deltaPath: deltaPathArg ?? DEFAULT_DELTA_PATH,
    outputPath: outputPathArg ?? DEFAULT_OUTPUT_PATH,
  };
};

const mergeReadmes = (base: ReadmeEntry[], delta: ReadmeEntry[]): ReadmeEntry[] => {
  const merged = new Map<string, ReadmeEntry>();

  for (const entry of base) {
    if (!entry?.id) continue;
    merged.set(entry.id, {
      id: entry.id,
      description: entry.description ?? "",
      readme: entry.readme ?? "",
    });
  }

  for (const entry of delta) {
    if (!entry?.id) continue;
    const existing = merged.get(entry.id);
    if (existing) {
      merged.set(entry.id, {
        id: entry.id,
        description: pickText(existing.description, entry.description),
        readme: pickText(existing.readme, entry.readme),
      });
      continue;
    }

    merged.set(entry.id, {
      id: entry.id,
      description: entry.description ?? "",
      readme: entry.readme ?? "",
    });
  }

  return Array.from(merged.values());
};

const main = async () => {
  const { basePath, deltaPath, outputPath } = resolvePaths();
  const [base, delta] = await Promise.all([
    readJsonArray(basePath),
    readJsonArray(deltaPath),
  ]);

  const merged = mergeReadmes(base, delta);
  await writeJson(outputPath, merged);

  console.log(
    `Merged readmes: base=${base.length}, delta=${delta.length}, output=${merged.length} -> ${outputPath}`
  );
};

main().catch((error) => {
  console.error("Failed to merge readmes:", error);
  process.exitCode = 1;
});
