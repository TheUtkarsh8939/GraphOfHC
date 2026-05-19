import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import neo4j, { Driver, Session } from "neo4j-driver";

dotenv.config();

interface RenderNode {
  id: string;
  ysws: string;
  code_url: string;
  description: string;
  demo_url: string;
  hours: number;
  name: string;
  x: number;
  y: number;
  radius: number;
}

interface RenderEdge {
  source: string;
  target: string;
  weight?: number;
  startxy?: [number, number];
  endxy?: [number, number];
}

interface RenderGraph {
  metadata?: {
    length?: number;
    breadth?: number;
    generatedAt?: string;
    nodeCount?: number;
    edgeCount?: number;
  };
  nodes: RenderNode[];
  edges: RenderEdge[];
}

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

const createNodes = async (nodes: RenderNode[]): Promise<void> => {
  console.log(`Creating ${nodes.length} Project nodes...`);

  for (let i = 0; i < nodes.length; i += 100) {
    const batch = nodes.slice(i, Math.min(i + 100, nodes.length));

    const query = `
      UNWIND $nodes AS node
      CREATE (p:Project {
        id: node.id,
        ysws: node.ysws,
        code_url: node.code_url,
        description: node.description,
        demo_url: node.demo_url,
        hours: node.hours,
        name: node.name,
        x: node.x,
        y: node.y,
        radius: node.radius
      })
    `;

    await session.run(query, { nodes: batch });

    const percent = (((i + batch.length) / nodes.length) * 100).toFixed(2);
    console.log(`Progress: ${percent}%`);
  }

  console.log("✓ Created all nodes");
};

const createRelationships = async (edges: RenderEdge[]): Promise<void> => {
  console.log(`Creating ${edges.length} relationships...`);

  const totalRelationships = edges.length;
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

  for (const edge of edges) {
    relBatch.push({
      sourceId: edge.source,
      targetId: edge.target,
      weight: edge.weight ?? 1
    });

    if (relBatch.length >= relBatchSize) {
      await session.run(query, { rels: relBatch });
      relationshipCount += relBatch.length;
      relBatch = [];
      showProgress(relationshipCount);
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
    const graphPath = path.join(__dirname, "render-graph.json");

    const graphRaw = fs.readFileSync(graphPath, "utf-8");
    const graph: RenderGraph = JSON.parse(graphRaw);

    console.log(`\nLoaded ${graph.nodes.length} projects and ${graph.edges.length} edges`);

    // Clear and load
    await clearDatabase();
    await createNodes(graph.nodes);
    await createIndexes();
    await createRelationships(graph.edges);

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
