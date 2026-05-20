import * as fs from "fs";
import * as path from "path";
import process from "process";

interface ReadmeRecord {
  id: string;
  description: string;
  readme: string;
}

interface EmbeddingRecord {
  id: string;
  embedding: number[];
}

interface EmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

function isEmbeddingResponse(value: unknown): value is EmbeddingResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const obj = value as Record<string, unknown>;
  
  // Check if it's an error response
  if (obj.error) {
    return false;
  }

  const data = obj.data;
  if (!Array.isArray(data)) {
    return false;
  }

  return data.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const embedding = (item as { embedding?: unknown }).embedding;
    return Array.isArray(embedding);
  });
}

const BATCH_SIZE = 256;
const DEFAULT_CONCURRENCY = 10;
const MODEL = "perplexity/pplx-embed-v1-4b";
const API_ENDPOINT = "https://ai.hackclub.com/proxy/v1/embeddings";
const API_KEY = "REVOKED";
const MAX_SPLIT_DEPTH = 12;
const MAX_REQUEST_TOKENS = 100000;
const ESTIMATED_CHARS_PER_TOKEN = 4;

if (!API_KEY) {
  console.error(
    "Error: HACKCLUB_API_KEY environment variable is not set. Please set your Hack Club AI API key."
  );
  process.exit(1);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / ESTIMATED_CHARS_PER_TOKEN);
}

function chunkTextsByEstimatedTokens(texts: string[]): string[][] {
  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const text of texts) {
    const textTokens = estimateTokens(text);

    if (currentChunk.length > 0 && currentTokens + textTokens > MAX_REQUEST_TOKENS) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(text);
    currentTokens += textTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

const runWithConcurrency = async <T>(
  total: number,
  concurrency: number,
  worker: (index: number) => Promise<T>
): Promise<T[]> => {
  const results = new Array<T>(total);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < total) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(currentIndex);
    }
  };

  const workerCount = Math.min(concurrency, total);
  const workers = Array.from({ length: workerCount }, () => runWorker());
  await Promise.all(workers);
  return results;
};

async function generateEmbeddings(): Promise<void> {
  try {
    // Read readmes.json
    const readmesPath = path.join(__dirname,"..","generated", "readmes.json");
    const readmesContent = fs.readFileSync(readmesPath, "utf-8");
    const records: ReadmeRecord[] = JSON.parse(readmesContent);

    console.log(`Loaded ${records.length} records from readmes.json`);

    const embeddingResults: Array<EmbeddingRecord | null> = new Array(records.length).fill(null);
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);
    const concurrency = Math.max(1, Number(process.env.EMBEDDING_CONCURRENCY ?? DEFAULT_CONCURRENCY));
    let totalTokensUsed = 0;

    const isTokenLimitError = (status: number, message: string): boolean => {
      const lower = message.toLowerCase();
      return (
        status === 413 ||
        lower.includes("token") ||
        lower.includes("context length") ||
        lower.includes("maximum") ||
        lower.includes("too large")
      );
    };

    const requestEmbeddings = async (
      texts: string[],
      startIndex: number,
      depth = 0
    ): Promise<void> => {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          input: texts,
        }),
      });

      const responseText = await response.text();
      let parsed: unknown = null;
      if (responseText) {
        try {
          parsed = JSON.parse(responseText);
        } catch {
          parsed = null;
        }
      }

      const errorMessage =
        (parsed as any)?.error?.message ?? responseText ?? "Unknown error";

      if (!response.ok || (parsed as any)?.error) {
        if (texts.length > 1 && depth < MAX_SPLIT_DEPTH && isTokenLimitError(response.status, errorMessage)) {
          const mid = Math.ceil(texts.length / 2);
          await requestEmbeddings(texts.slice(0, mid), startIndex, depth + 1);
          await requestEmbeddings(texts.slice(mid), startIndex + mid, depth + 1);
          return;
        }

        throw new Error(
          `API request failed with status ${response.status}: ${errorMessage}`
        );
      }

      if (!isEmbeddingResponse(parsed)) {
        throw new Error(`API Error: ${errorMessage}`);
      }

      const data = parsed;
      totalTokensUsed += data.usage.total_tokens;

      data.data.forEach((embeddingData) => {
        const originalRecord = records[startIndex + embeddingData.index];
        const globalIndex = startIndex + embeddingData.index;
        embeddingResults[globalIndex] = {
          id: originalRecord.id,
          embedding: embeddingData.embedding,
        };
      });
    };

    await runWithConcurrency(totalBatches, concurrency, async (batchIndex) => {
      const startIdx = batchIndex * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, records.length);
      const batchRecords = records.slice(startIdx, endIdx);

      console.log(
        `\nProcessing batch ${batchIndex + 1}/${totalBatches} (records ${startIdx + 1} to ${endIdx})`
      );

      const texts = batchRecords.map((record) => `${record.readme} ${record.description}`.trim());
      const requestChunks = chunkTextsByEstimatedTokens(texts);

      let chunkOffset = 0;
      for (const chunkTexts of requestChunks) {
        await requestEmbeddings(chunkTexts, startIdx + chunkOffset);
        chunkOffset += chunkTexts.length;
      }

      console.log(
        `✓ Successfully generated embeddings for batch ${batchIndex + 1}`
      );
    });

    // Save embeddings to JSON file without building one giant string in memory.
    const outputPath = path.join(__dirname, "..", "generated", "embeddings.json");
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    const finalResults = embeddingResults.filter(
      (entry): entry is EmbeddingRecord => Boolean(entry)
    );

    await new Promise<void>((resolve, reject) => {
      const stream = fs.createWriteStream(outputPath, { encoding: "utf-8" });
      let isFirstRecord = true;

      const writeChunk = (chunk: string): Promise<void> =>
        new Promise((chunkResolve, chunkReject) => {
          if (stream.write(chunk)) {
            chunkResolve();
            return;
          }

          stream.once("drain", chunkResolve);
          stream.once("error", chunkReject);
        });

      stream.on("error", reject);
      stream.on("finish", resolve);

      void (async () => {
        try {
          await writeChunk("[\n");

          for (const record of finalResults) {
            const prefix = isFirstRecord ? "" : ",\n";
            isFirstRecord = false;
            await writeChunk(`${prefix}${JSON.stringify(record)}`);
          }

          stream.end("\n]\n");
        } catch (error) {
          reject(error);
          stream.destroy(error as Error);
        }
      })();
    });

    console.log(`\n✓ Complete! Generated embeddings for ${finalResults.length} records`);
    console.log(`Total tokens used: ${totalTokensUsed}`);
    console.log(`Embeddings saved to: ${outputPath}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

generateEmbeddings();
