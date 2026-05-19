import * as fs from "fs";
import * as path from "path";

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
const MODEL = "perplexity/pplx-embed-v1-0.6b";
const API_ENDPOINT = "https://ai.hackclub.com/proxy/v1/embeddings";
const API_KEY = "REMOVED";

if (!API_KEY) {
  console.error(
    "Error: HACKCLUB_API_KEY environment variable is not set. Please set your Hack Club AI API key."
  );
  process.exit(1);
}

async function generateEmbeddings(): Promise<void> {
  try {
    // Read readmes.json
    const readmesPath = path.join(__dirname, "readmes.json");
    const readmesContent = fs.readFileSync(readmesPath, "utf-8");
    const records: ReadmeRecord[] = JSON.parse(readmesContent);

    console.log(`Loaded ${records.length} records from readmes.json`);

    const embeddingResults: EmbeddingRecord[] = [];
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);

    // Process records in batches
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, records.length);
      const batchRecords = records.slice(startIdx, endIdx);

      console.log(
        `\nProcessing batch ${batchIndex + 1}/${totalBatches} (records ${startIdx + 1} to ${endIdx})`
      );

      // Prepare texts for embedding
      const texts = batchRecords.map((record) => {
        // Concatenate readme and description
        return `${record.readme} ${record.description}`.trim();
      });

      try {
        // Call Hack Club AI embeddings API
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

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `API request failed with status ${response.status}: ${errorText}`
          );
        }

        const rawData = await response.json();
        if (!isEmbeddingResponse(rawData)) {
          const errorMsg = (rawData as any)?.error?.message || JSON.stringify(rawData);
          throw new Error(`API Error: ${errorMsg}`);
        }

        const data = rawData;

        // Map embeddings back to records
        data.data.forEach((embeddingData) => {
          const originalRecord = batchRecords[embeddingData.index];
          embeddingResults.push({
            id: originalRecord.id,
            embedding: embeddingData.embedding,
          });
        });

        console.log(
          `✓ Successfully generated embeddings for batch ${batchIndex + 1}`
        );
        console.log(`  - Tokens used: ${data.usage.total_tokens}`);
      } catch (error) {
        console.error(`✗ Error processing batch ${batchIndex + 1}:`, error);
        throw error;
      }
    }

    // Save embeddings to JSON file
    const outputPath = path.join(__dirname, "embeddings.json");
    fs.writeFileSync(outputPath, JSON.stringify(embeddingResults, null, 2));

    console.log(`\n✓ Complete! Generated embeddings for ${embeddingResults.length} records`);
    console.log(`Embeddings saved to: ${outputPath}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

generateEmbeddings();
