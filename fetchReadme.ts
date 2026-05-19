// Fetch README files for each project
//Clean that Readme eg:- Removing emojis, markdown syntax, newlines, commas, and generic words like "project", "demo", "description", "code", "url", "github" etc. to make it more suitable for training the model.
//Also remove english boilerplate words eg:- Modal verbs, Pronouns, Articles, Prepositions, Conjunctions, Interjections, Auxiliary verbs, Determiners, Quantifiers, etc. to make it more concise and focused on the actual content of the README files.
import * as fs from 'fs'
const TO_REMOVE: string[] = [
    //Markdown Syntax & Common Punctuation
  "#", "##", "###", "####", "#####", "######", "*", "-", "_", "`", "~", ">", "+", "=", "|",
  ".", ",", "!", "?", ";", ":", "(", ")", "[", "]", "{", "}", "\"", "'", "\\", "/",
  
  // Pronouns & Modals (As requested)
  "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", 
  "he", "him", "his", "she", "her", "it", "its", "they", "them", "their", "can", 
  "could", "will", "would", "shall", "should", "may", "might", "must",

  // Articles & Determiners
  "a", "an", "the", "this", "that", "these", "those", "each", "every", "some", 
  "any", "another", "both", "either", "neither", "each", "every",

  // Prepositions
  "in", "on", "at", "by", "with", "for", "about", "against", "between", "into", 
  "through", "during", "before", "after", "above", "below", "to", "from", "up", 
  "down", "of", "off", "over", "under", "again", "further", "then", "once",

  // Conjunctions & Logic
  "and", "but", "or", "nor", "for", "yet", "so", "although", "because", "since", 
  "unless", "until", "while", "as", "if", "while", "lest",

  // Auxiliary / Be Verbs
  "am", "is", "are", "was", "were", "be", "being", "been", "have", "has", "had", 
  "do", "does", "did", "done", "get", "got", "going",

  // GitHub / Documentation Boilerplate
  "readme", "github", "project", "repository", "repo", "install", "installation",
  "usage", "getting", "started", "how", "to", "run", "setup", "example", "demo", 
  "documentation", "docs", "link", "url", "click", "here", "below", "above", 
  "following", "license", "mit", "apache", "copyright", "author", "contributors", 
  "contributing", "support", "issues", "pull", "request", "pr", "branch", "master", 
  "main", "stable", "latest", "version", "v1", "v2", "fix", "fixed", "bug", "issue",

  // Adverbs & Qualifiers
  "very", "quite", "rather", "somewhat", "extremely", "almost", "nearly", "too", 
  "enough", "just", "hardly", "simply", "basically", "actually", "specifically",
  "really", "very", "often", "always", "never", "perhaps"
];

/**
 * Optimized lookup function
 */
const stripHtmlTags = (text: string): string => text.replace(/<[^>]*>/g, ' ')

const removeBoilerplate = (text: string): string[] => {
    const stopWordsSet = new Set(TO_REMOVE);
  
    return text
        .split(/\s+/) // Split by whitespace
        .map(word => word.replace(/[.,!?;:()]/g, "").toLowerCase()) // Clean punctuation
        .filter(word => word.length > 0 && !stopWordsSet.has(word));
};
const buildReadmeUrls = (githubUrl: string): string[] => {
    const urlParts = githubUrl.split('/')
    const user = urlParts[3]
    const repo = urlParts[4]
    return [
        `https://raw.githubusercontent.com/${user}/${repo}/main/README.md`,
        `https://raw.githubusercontent.com/${user}/${repo}/master/README.md`
    ]
}

const isValidGithubRepoUrl = (githubUrl: string | null | undefined): githubUrl is string => {
    return Boolean(githubUrl && githubUrl.startsWith('https://github.com/'))
}

const READMES_PATH = 'readmes.json'
const PROGRESS_PATH = 'readmes.progress.json'

const loadExistingReadmes = async (): Promise<Map<string, string>> => {
    try {
        const raw = await fs.promises.readFile(READMES_PATH, 'utf-8')
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) {
            return new Map()
        }
        const readmeMap = new Map<string, string>()
        for (const entry of parsed as Array<{ id: string; readme?: string[] | string }>) {
            if (!entry?.id) {
                continue
            }
            const readmeText = Array.isArray(entry.readme)
                ? entry.readme.join(' ')
                : (entry.readme ?? '')
            if (readmeText.trim().length === 0) {
                continue
            }
            readmeMap.set(entry.id, readmeText)
        }
        return readmeMap
    } catch {
        return new Map()
    }
}

const loadProgress = async (): Promise<number> => {
    try {
        const raw = await fs.promises.readFile(PROGRESS_PATH, 'utf-8')
        const parsed = JSON.parse(raw)
        if (typeof parsed?.nextIndex === 'number') {
            return parsed.nextIndex
        }
        return 0
    } catch {
        return 0
    }
}

const buildAggregated = (
    jsonData: Array<{ id: string; description?: string | null }> ,
    readmeMap: Map<string, string>
): Array<{ id: string; description: string; readme: string }> => {
    const aggregated: Array<{ id: string; description: string; readme: string }> = []
    for (const project of jsonData) {
        if (!project?.id) {
            continue
        }
        const readme = readmeMap.get(project.id) ?? ''
        const description = typeof project.description === 'string' ? project.description : ''
        aggregated.push({ id: project.id, description, readme })
    }
    return aggregated
}

const saveState = async (
    jsonData: Array<{ id: string }>,
    readmeMap: Map<string, string>,
    nextIndex: number
): Promise<void> => {
    const aggregated = buildAggregated(jsonData, readmeMap)
    await fs.promises.writeFile(READMES_PATH, JSON.stringify(aggregated, null, 2), 'utf-8')
    await fs.promises.writeFile(
        PROGRESS_PATH,
        JSON.stringify({ nextIndex, total: jsonData.length }, null, 2),
        'utf-8'
    )
}
const main = async () => {
    // Open the ysws_entries.json file and read the code_url for each project, then fetch README files.
    const data = fs.readFileSync('ysws_entries.json', 'utf-8')
    const jsonData = JSON.parse(data)
    const readmeMap = await loadExistingReadmes()
    let nextIndex = await loadProgress()
    if (nextIndex < 0 || nextIndex > jsonData.length) {
        nextIndex = 0
    }

    let isStopping = false
    const handleStop = async () => {
        if (isStopping) {
            return
        }
        isStopping = true
        await saveState(jsonData, readmeMap, nextIndex)
        console.log('Saved progress. Exiting...')
        process.exit(0)
    }

    process.on('SIGINT', handleStop)
    process.on('SIGTERM', handleStop)

    for (let index = nextIndex; index < jsonData.length; index += 1) {
        const project = jsonData[index]
        if (!project?.id) {
            nextIndex = index + 1
            continue
        }

        const existingReadme = readmeMap.get(project.id)
        if (existingReadme && existingReadme.trim().length > 0) {
            nextIndex = index + 1
            continue
        }

        if (!isValidGithubRepoUrl(project.code_url)) {
            console.warn(`Skipping project with invalid GitHub URL: ${project.id}`)
            nextIndex = index + 1
            await saveState(jsonData, readmeMap, nextIndex)
            continue
        }

        const readmeUrls = buildReadmeUrls(project.code_url)
        let readmeText = ''

        for (const readmeUrl of readmeUrls) {
            const response = await fetch(readmeUrl)
            if (response.ok) {
                readmeText = await response.text()
                break
            }else{
                console.warn(`Failed to fetch README from ${readmeUrl} for project: ${project.id}. Status: ${response.status}`)
            }
        }

        if (readmeText) {
            const cleanedReadme = removeBoilerplate(stripHtmlTags(readmeText))
            readmeMap.set(project.id, cleanedReadme.join(' '))
            console.log(`Processed README for project: ${project.id}`)
        } else {
            console.warn(`Failed to fetch README for project: ${project.id}`)
        }

        nextIndex = index + 1
        await saveState(jsonData, readmeMap, nextIndex)
    }

    await saveState(jsonData, readmeMap, nextIndex)
}

main()
    .then(() => console.log('README fetching and processing complete.'))
    .catch((error) => console.error('Error in main function:', error))