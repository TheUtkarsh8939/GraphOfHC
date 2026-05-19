# Embeddings Generator for Hack Club Projects

This script reads `readmes.json`, concatenates the readme and description for each record, and generates embeddings using Hack Club AI's text-embedding-small model.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Get your API key:**
   - Visit [Hack Club AI Authentication](https://docs.ai.hackclub.com/guide/authentication.html)
   - Get your API key from your Hack Club account

3. **Set up environment variable:**
   ```bash
   # Copy and edit the example
   cp .env.example .env
   
   # Edit .env and add your API key
   export HACKCLUB_API_KEY=your_api_key_here
   ```

## Usage

### Option 1: Run directly with ts-node (development)
```bash
npm run generate-embeddings
```

### Option 2: Compile to JavaScript and run
```bash
npm run build
npm start
```

## How it works

- Reads all records from `readmes.json`
- For each record, concatenates the `readme` and `description` fields
- Sends batches of 1024 records to Hack Club AI's embeddings API
- Stores results in `embeddings.json` with format: `{ id: string, embedding: number[] }`

## Output

The script generates `embeddings.json` containing:
```json
[
  {
    "id": "recIbOxgu6WIRrcI4",
    "embedding": [0.0023, -0.0134, 0.0421, ...]
  },
  ...
]
```

## API Details

- **Model:** text-embedding-small
- **Endpoint:** https://ai.hackclub.com/proxy/v1/embeddings
- **Batch Size:** 1024 records per request
- **Documentation:** https://docs.ai.hackclub.com/api/embeddings.html
