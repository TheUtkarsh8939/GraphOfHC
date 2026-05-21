# Constellation
![Photo](https://user-cdn.hackclub-assets.com/019e49cc-4e31-727d-a479-86d52d0567bc/Screenshot%202026-05-21%20143923.png)
![Sveltekit](https://img.shields.io/badge/Made_with-Sveltekit-orange)
![Typescript](https://img.shields.io/badge/Made_with-TypeScript-blue)
![Go](https://img.shields.io/badge/Made_with-Go-blue)
![Neo4j](https://img.shields.io/badge/Powered_by-Neo4j-green)
![Hackclub](https://img.shields.io/badge/For-Hack_Club-red)
![License](https://img.shields.io/badge/License-GPLv3-blue)
A project made by [@TheUtkarsh8939](). A massive graph of over 36 thousand projects ever submitted to hackclub database. With over 160k edges formed by embedding the project descriptions using Perplexity's pplx-4b-embed model and connecting projects with a cosine similarity of 0.4 or higher. The graph is visualised using a custom-built WebGL interface, allowing users to explore the relationships between projects in an interactive and intuitive way. The project is open-source and available on GitHub for anyone to explore and contribute to. The code is written in Go and Typescript, and the graph data is stored in a Neo4j database as well as a local .json file. 

## Inspiration
I wanted to make a recommendation system for hackclub projects, and I thought that a graph would be a great way to represent the relationships between projects. The core data generation system found in `/scripts` is cloned to Neo4j and using its PageRank and other algorithms, I will create a recommendation system for hackclub projects. The graph is also a great way to visualise the relationships between projects, and I wanted to create an interactive interface for users to explore the graph.

## Work In Progress
- Implementing a recommendation system using the graph data and Neo4j's algorithms.
- Add a newsletter kinda thing?
- Use hackclub auth and ships api to allow users to save projects to their profile and get personalized recommendations.
- Add more features to the graph, such as project tags and user starring.

## Data Generation
The data generation process involves several steps:
1. **Data Collection**: The project data is collected from the Hack Club database, which contains information about all the projects ever submitted to Hack Club. The data is then cleaned to remove duplicate entries and irrelevant information.
- Code in `scripts/fetchData.ts`

2. **Embedding Generation**: Every project whose description is less than 20 words gets its readme fetched and cleaned
- Code in `scripts/generateReadmeDelta.ts` (Create a /generated/readmes.json b4 running this)
- Originally the code was in `scripts/fetchReadme.ts` but I moved it to `generateReadmeDelta.ts` to only fetch readmes for projects that need it, instead of fetching readmes for all projects every time, the new file is also parallelized to fetch readmes faster and use more bandwidth.

3. **Embedding Generation**: The cleaned project descriptions are then embedded using Perplexity's pplx-4b-embed model. This process converts the textual descriptions into high-dimensional vectors that can be used to measure similarity between projects.
- Code in `scripts/generateEmbeddings.ts` (Parallelized to speed up the embedding generation process)

4. **Graph Construction**: The embedded vectors are then used to construct a graph where each node represents a project and edges are formed between projects that have a cosine similarity of 0.4 or higher. This results in a graph with over 36 thousand nodes and 160k edges.
- Code in `scripts/buildGraph.go`(Paralleized to speed up the graph construction process)
- Originally the graph construction code was in `scripts/buildGraph.ts` but due to node.js limitations in parallelization and file handling(especially with large files), I moved the graph construction code to Go, which allows for better performance and easier handling of large data sets.

5. **Visual Generation**: The graph is pre rendered so the broswer does not have to handle it, the positions are calculated using custom algorithms and is really customizable, allowing for different layouts and visual styles to be applied to the graph.
- Code in `scripts/generateRenderData.ts` (Generates the visual data for the graph, such as node positions and edge connections, and stores it in a .json file for use in the frontend)
6. **Data Storage(Optional)**: The graph data is stored in a Neo4j database, which allows for efficient querying and analysis of the graph structure. Additionally, the graph data is also stored in a local .json file for easy access and backup.
- Code in `scripts/neo4jloader.ts` (Stores the graph data in Neo4j)

7. **Running the server**: The server is made using sveltekit, just do npm run dev and go to localhost:5173 to see the graph in action, you can click on the nodes to see the project details and explore the relationships between projects.

## Generating Data
To generate the graph data, you can run the following commands in the terminal in order
- `scripts/fetchData.ts` (Fetches the project data from the Hack Club database and cleans it)
- Create Generated/readmes.json (This file will store the readmes for projects that need it, it should be an empty json object {})
- `scripts/generateReadmeDelta.ts` (Fetches the readmes for projects that need it and cleans them)
- `scripts/generateEmbeddings.ts` (Generates the embeddings for the project descriptions using Perplexity's pplx-4b-embed model)
- `scripts/buildGraph.go` (Constructs the graph based on the embeddings and cosine similarity)
- `scripts/generateRenderData.ts` (Generates the visual data for the graph, such as node positions and edge connections, and stores it in a .json file for use in the frontend)

## Optional Scripts
- `scripts/neo4jloader.ts` (Stores the graph data in Neo4j, you need to have a Neo4j instance running and update the connection details in the code before running this script)
- `scripts/generateYswsDelta.ts && mergeReadmes.ts` (Scripts made to automate a few updating tasks, these dont serve much purpose)
- `scripts/getAllYsws.ts` (Uses ysws_entries.json to find every ysws there)

## Contributing
If you have a nice logo then please dm me on slack hackclub/@TheUtkarsh8939, I am not a designer and I want to make sure that the logo aligns with the overall vision for the project.

**For Code:**
Just don't or dm me on slack hackclub/@TheUtkarsh8939 what you want, only make a pull request before talking to me or it won't be merged, I have a lot of plans for this project and I want to make sure that any contributions align with the overall vision for the project.

