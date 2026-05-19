# Neo4j Aura Setup Guide

## Step 1: Create a Neo4j Aura Instance

1. **Sign up / Login to Neo4j Aura:**
   - Go to https://console.neo4j.io
   - Sign in with your account (or create one)

2. **Create a New Database:**
   - Click "Create DBMS"
   - Choose **Aura Free** tier (plenty for 8k nodes)
   - Select region (closest to you)
   - Click "Create"
   - Wait ~2 minutes for provisioning

3. **Get Connection Details:**
   - Your database is now active
   - Click on your database to view details
   - You'll see:
     - **Connection string** (e.g., `neo4j+s://abcd1234.databases.neo4j.io`)
     - **Username** (default: `neo4j`)
     - **Password** (auto-generated, save this!)

## Step 2: Set Environment Variables

Create a `.env` file in the project root:

```bash
NEO4J_URI=neo4j+s://YOUR_CONNECTION_STRING_HERE
NEO4J_USER=neo4j
NEO4J_PASSWORD=YOUR_PASSWORD_HERE
```

**Example:**
```bash
NEO4J_URI=neo4j+s://abcd1234.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=MySecurePassword123!
```

## Step 3: Install Dependencies

```bash
npm install
```

## Step 4: Load Data into Neo4j

Make sure you have:
- ✅ `ysws_entries.json` (project data)
- ✅ `graph.json` (relationships from buildGraph.ts)

Then run:

```bash
npm run load-neo4j
```

**Output:**
```
✓ Connected to Neo4j
Clearing existing data...
✓ Database cleared
Creating 8142 Project nodes...
Progress: 100.00%
✓ Created all nodes
Creating relationships from 8142 nodes...
Progress: 100.00% (45231 relationships)
✓ Created relationships
Creating indexes...
✓ Created indexes

✓ Neo4j database loaded successfully!
```

## Step 5: Query Your Graph

Visit Neo4j Aura Console and run queries:

### Get a single project with connections:
```cypher
MATCH (p:Project {id: "recIbOxgu6WIRrcI4"})-[r:RELATED_TO]-(related)
RETURN p, r, related
LIMIT 10
```

### Get top 5 related projects by weight:
```cypher
MATCH (p:Project {id: "recIbOxgu6WIRrcI4"})-[r:RELATED_TO]-(related)
RETURN related.name, r.weight
ORDER BY r.weight DESC
LIMIT 5
```

### Find highly connected projects (hubs):
```cypher
MATCH (p:Project)-[r:RELATED_TO]-(related)
RETURN p.name, COUNT(r) as connections
ORDER BY connections DESC
LIMIT 20
```

### PageRank example:
```cypher
MATCH (n:Project)
WITH n
CALL algo.pageRank.stream('Project', 'RELATED_TO', {iterations:20, dampingFactor:0.85})
YIELD nodeId, score
RETURN algo.asNode(nodeId).name, score
ORDER BY score DESC
LIMIT 10
```

## Troubleshooting

### Connection Error?
- Double-check your `NEO4J_URI`, `NEO4J_USER`, and `NEO4J_PASSWORD`
- Make sure the password is exact (special characters matter!)
- Verify the database is active in Neo4j Aura console

### Out of Memory?
- Free tier has 50GB storage
- 8k projects should be ~20-30MB
- If needed, upgrade to a paid tier

### Want to Clear & Reload?
```bash
npm run load-neo4j
```

It automatically clears old data before loading.

## Next Steps

- Build a recommendation engine using the PageRank scores
- Create a visualization dashboard
- Migrate to a larger instance if needed
- Set up automated updates when new projects are added
