

import { promises as fs } from "fs";
import path from "path";

const DEFAULT_OLD_PATH = path.join(process.cwd(), "generated", "ysws_entries_old.json");
const DEFAULT_ENTRIES_PATH = path.join(process.cwd(), "generated", "ysws_entries.json");
const DEFAULT_DELTA_PATH = path.join(process.cwd(), "generated", "ysws_entries_delta.json");

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const asArray = (value: JsonValue): JsonValue[] => (Array.isArray(value) ? value : []);

const getEntryKey = (entry: JsonValue): string => {
	if (entry && typeof entry === "object" && !Array.isArray(entry)) {
		const maybeId = (entry as { id?: JsonValue }).id;
		if (typeof maybeId === "string" && maybeId.length > 0) {
			return `id:${maybeId}`;
		}
	}

	return `json:${JSON.stringify(entry)}`;
};

const readJson = async (filePath: string): Promise<JsonValue> => {
	const raw = await fs.readFile(filePath, "utf8");
	return JSON.parse(raw) as JsonValue;
};

const writeJson = async (filePath: string, data: JsonValue): Promise<void> => {
	const payload = `${JSON.stringify(data, null, 2)}\n`;
	await fs.writeFile(filePath, payload, "utf8");
};

const buildDelta = (entries: JsonValue[], oldEntries: JsonValue[]): JsonValue[] => {
	const oldKeys = new Set(oldEntries.map(getEntryKey));
	return entries.filter((entry) => !oldKeys.has(getEntryKey(entry)));
};

const resolvePaths = () => {
	const [oldPathArg, entriesPathArg, deltaPathArg] = process.argv.slice(2);

	return {
		oldPath: oldPathArg ?? DEFAULT_OLD_PATH,
		entriesPath: entriesPathArg ?? DEFAULT_ENTRIES_PATH,
		deltaPath: deltaPathArg ?? DEFAULT_DELTA_PATH,
	};
};

const run = async () => {
	const { oldPath, entriesPath, deltaPath } = resolvePaths();

	const [oldJson, entriesJson] = await Promise.all([
		readJson(oldPath),
		readJson(entriesPath),
	]);

	const oldEntries = asArray(oldJson);
	const entries = asArray(entriesJson);
	const delta = buildDelta(entries, oldEntries);

	await writeJson(deltaPath, delta);

	console.log(
		`Delta generated: ${delta.length} new entr${delta.length === 1 ? "y" : "ies"} -> ${deltaPath}`
	);
};

run().catch((error) => {
	console.error("Failed to generate ysws delta:", error);
	process.exitCode = 1;
});

