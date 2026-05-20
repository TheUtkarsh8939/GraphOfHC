import { promises as fs } from "fs";
import path from "path";

const TO_REMOVE: string[] = [
	"#",
	"##",
	"###",
	"####",
	"#####",
	"######",
	"*",
	"-",
	"_",
	"`",
	"~",
	">",
	"+",
	"=",
	"|",
	".",
	",",
	"!",
	"?",
	";",
	":",
	"(",
	")",
	"[",
	"]",
	"{",
	"}",
	"\"",
	"'",
	"\\",
	"/",
	"i",
	"me",
	"my",
	"myself",
	"we",
	"our",
	"ours",
	"ourselves",
	"you",
	"your",
	"yours",
	"he",
	"him",
	"his",
	"she",
	"her",
	"it",
	"its",
	"they",
	"them",
	"their",
	"can",
	"could",
	"will",
	"would",
	"shall",
	"should",
	"may",
	"might",
	"must",
	"a",
	"an",
	"the",
	"this",
	"that",
	"these",
	"those",
	"each",
	"every",
	"some",
	"any",
	"another",
	"both",
	"either",
	"neither",
	"in",
	"on",
	"at",
	"by",
	"with",
	"for",
	"about",
	"against",
	"between",
	"into",
	"through",
	"during",
	"before",
	"after",
	"above",
	"below",
	"to",
	"from",
	"up",
	"down",
	"of",
	"off",
	"over",
	"under",
	"again",
	"further",
	"then",
	"once",
	"and",
	"but",
	"or",
	"nor",
	"yet",
	"so",
	"although",
	"because",
	"since",
	"unless",
	"until",
	"while",
	"as",
	"if",
	"lest",
	"am",
	"is",
	"are",
	"was",
	"were",
	"be",
	"being",
	"been",
	"have",
	"has",
	"had",
	"do",
	"does",
	"did",
	"done",
	"get",
	"got",
	"going",
	"readme",
	"github",
	"project",
	"repository",
	"repo",
	"install",
	"installation",
	"usage",
	"getting",
	"started",
	"how",
	"run",
	"setup",
	"example",
	"demo",
	"documentation",
	"docs",
	"link",
	"url",
	"click",
	"here",
	"below",
	"above",
	"following",
	"license",
	"mit",
	"apache",
	"copyright",
	"author",
	"contributors",
	"contributing",
	"support",
	"issues",
	"pull",
	"request",
	"pr",
	"branch",
	"master",
	"main",
	"stable",
	"latest",
	"version",
	"v1",
	"v2",
	"fix",
	"fixed",
	"bug",
	"issue",
	"very",
	"quite",
	"rather",
	"somewhat",
	"extremely",
	"almost",
	"nearly",
	"too",
	"enough",
	"just",
	"hardly",
	"simply",
	"basically",
	"actually",
	"specifically",
	"really",
	"often",
	"always",
	"never",
	"perhaps",
];

const STOP_WORDS = new Set(TO_REMOVE);

type DeltaEntry = {
	id?: string;
	code_url?: string | null;
	description?: string | null;
};

type OutputEntry = {
	id: string;
	description: string;
	readme: string;
};

const DEFAULT_DELTA_PATH = path.join(process.cwd(), "generated", "ysws_entries_delta.json");
const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "generated", "readmes_delta.json");

const stripHtmlTags = (text: string): string => text.replace(/<[^>]*>/g, " ");

const removeBoilerplate = (text: string): string[] =>
	text
		.split(/\s+/)
		.map((word) => word.replace(/[.,!?;:()]/g, "").toLowerCase())
		.filter((word) => word.length > 0 && !STOP_WORDS.has(word));

const buildReadmeUrls = (githubUrl: string): string[] => {
	const urlParts = githubUrl.split("/");
	const user = urlParts[3];
	const repo = urlParts[4];
	return [
		`https://raw.githubusercontent.com/${user}/${repo}/main/README.md`,
		`https://raw.githubusercontent.com/${user}/${repo}/master/README.md`,
	];
};

const isValidGithubRepoUrl = (githubUrl: string | null | undefined): githubUrl is string =>
	Boolean(githubUrl && githubUrl.startsWith("https://github.com/"));

const countWords = (text: string): number =>
	text
		.trim()
		.split(/\s+/)
		.filter((word) => word.length > 0).length;

const readJsonArray = async (filePath: string): Promise<DeltaEntry[]> => {
	const raw = await fs.readFile(filePath, "utf8");
	const parsed = JSON.parse(raw);
	return Array.isArray(parsed) ? (parsed as DeltaEntry[]) : [];
};

const writeJson = async (filePath: string, data: OutputEntry[]): Promise<void> => {
	const payload = `${JSON.stringify(data, null, 2)}\n`;
	await fs.writeFile(filePath, payload, "utf8");
};

const fetchReadme = async (githubUrl: string, projectId: string): Promise<string> => {
	const readmeUrls = buildReadmeUrls(githubUrl);

	for (const readmeUrl of readmeUrls) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 15000);
		const response = await fetch(readmeUrl, { signal: controller.signal });
		clearTimeout(timeoutId);
		if (response.ok) {
			const readmeText = await response.text();
			const cleanedReadme = removeBoilerplate(stripHtmlTags(readmeText));
			return cleanedReadme.join(" ");
		}

		// console.warn(
		// 	`Failed to fetch README from ${readmeUrl} for project: ${projectId}. Status: ${response.status}`
		// );
	}

	return "";
};

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

const resolvePaths = () => {
	const [deltaPathArg, outputPathArg] = process.argv.slice(2);

	return {
		deltaPath: deltaPathArg ?? DEFAULT_DELTA_PATH,
		outputPath: outputPathArg ?? DEFAULT_OUTPUT_PATH,
	};
};

const main = async () => {
	const { deltaPath, outputPath } = resolvePaths();
	const deltaEntries = await readJsonArray(deltaPath);
	const concurrency = Number(process.env.README_CONCURRENCY ?? 8);
	let completed = 0;

	const processed = await runWithConcurrency(deltaEntries.length, concurrency, async (i) => {
		const entry = deltaEntries[i];
		completed += 1;
		console.log(`Processed ${completed} of ${deltaEntries.length} entries.`);

		if (!entry?.id) {
			return null;
		}

		const description = typeof entry.description === "string" ? entry.description : "";
		let readme = "";

		if (countWords(description) < 20 && isValidGithubRepoUrl(entry.code_url)) {
			readme = await fetchReadme(entry.code_url, entry.id);
			if (readme.length > 0) {
				// console.log(`Fetched README for project: ${entry.id}`);
			} else {
				// console.warn(`Failed to fetch README for project: ${entry.id}`);
			}
		}

		return { id: entry.id, description, readme } as OutputEntry;
	});

	const output = processed.filter((entry): entry is OutputEntry => Boolean(entry));
	await writeJson(outputPath, output);
	console.log(`Readme delta generated: ${output.length} entries -> ${outputPath}`);
};

main().catch((error) => {
	console.error("Error generating readme delta:", error);
	process.exitCode = 1;
});
