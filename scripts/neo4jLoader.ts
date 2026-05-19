import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import neo4j, { Driver, Session } from "neo4j-driver";

dotenv.config();

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

const NEO4J_URI = process.env.NEO4J_URI || "bolt://localhost:7687";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;

if (!NEO4J_PASSWORD) {
  console.error("Error: NEO4J_PASSWORD environment variable is not set.");
  process.exit(1);
}

let driver: Driver;
let session: Session;

const connect = async (): Promise<void> => {
  driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  session = driver.session();
  await session.run("RETURN 1");
  console.log("✓ Connected to Neo4j");
};

const clearDatabase = async (): Promise<void> => {
  console.log("Clearing existing data...");
  await session.run("MATCH (n) DETACH DELETE n");
  console.log("✓ Database cleared");
};

const createNodes = async (entries: YswsEntry[]): Promise<void> => {
  console.log(`Creating ${entries.length} Project nodes...`);

  for (let i = 0; i < entries.length; i += 100) {
    const batch = entries.slice(i, Math.min(i + 100, entries.length));

    const query = `
      UNWIND $entries AS entry
      CREATE (p:Project {
        id: entry.id,
        ysws: entry.ysws,
        code_url: entry.code_url,
        description: entry.description,
        demo_url: entry.demo_url,
        hours: entry.hours,
        name: entry.name
      })
    `;

    await session.run(query, { entries: batch });

    const percent = (((i + batch.length) / entries.length) * 100).toFixed(2);
    console.log(`Progress: ${percent}%`);
  }

  console.log("✓ Created all nodes");
};

const createRelationships = async (graph: Graph): Promise<void> => {
  const edges = Object.entries(graph);
  console.log(`Creating relationships from ${edges.length} nodes...`);

  const totalRelationships = Object.values(graph).reduce((sum, arr) => sum + arr.length, 0);
  const relBatchSize = 7000;
  let relationshipCount = 0;

  const showProgress = (count: number): void => {
    const percent = totalRelationships === 0 ? 100 : ((count / totalRelationships) * 100).toFixed(1);
    const barLength = 40;
    const filledLength = Math.floor((count / totalRelationships) * barLength);
    const bar = "#".repeat(filledLength) + "-".repeat(barLength - filledLength);
    process.stdout.write(`\rCreating relationships: [${bar}] ${percent}% | ${count}/${totalRelationships}`);
  };

  const query = `
    UNWIND $rels AS rel
    MATCH (a:Project {id: rel.sourceId}), (b:Project {id: rel.targetId})
    CREATE (a)-[:RELATED_TO {weight: rel.weight}]->(b)
  `;

  let relBatch: Array<{ sourceId: string; targetId: string; weight: number }> = [];

  for (const [sourceId, connections] of edges) {
    for (const edge of connections) {
      relBatch.push({ sourceId, targetId: edge.id, weight: edge.weight });

      if (relBatch.length >= relBatchSize) {
        await session.run(query, { rels: relBatch });
        relationshipCount += relBatch.length;
        relBatch = [];
        showProgress(relationshipCount);
      }
    }
  }

  if (relBatch.length > 0) {
    await session.run(query, { rels: relBatch });
    relationshipCount += relBatch.length;
    showProgress(relationshipCount);
  }

  console.log(`\n✓ Created ${relationshipCount} relationships`);
};

const createIndexes = async (): Promise<void> => {
  console.log("Creating indexes...");
  await session.run("CREATE INDEX project_id IF NOT EXISTS FOR (p:Project) ON (p.id)");
  console.log("✓ Created indexes");
};

const main = async (): Promise<void> => {
  try {
    await connect();

    // Load data
    const entriesPath = path.join(__dirname, "ysws_entries.json");
    const graphPath = path.join(__dirname, "..", "generated", "render-graph.json");

    const entriesRaw = fs.readFileSync(entriesPath, "utf-8");
    const entries: YswsEntry[] = JSON.parse(entriesRaw);

    const graphRaw = fs.readFileSync(graphPath, "utf-8");
    const graph: Graph = JSON.parse(graphRaw);

    console.log(`\nLoaded ${entries.length} projects and graph`);

    // Clear and load
    await clearDatabase();
    await createNodes(entries);
    await createIndexes();
    await createRelationships(graph);

    console.log("\n✓ Neo4j database loaded successfully!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
};

main();
