import process from "node:process";
import fs from "node:fs";
import path from "node:path";

interface YswsEntry {
    id: string;
    ysws: string;
    code_url: string;
    description: string;
    demo_url: string;
    hours: number;
    name: string;
}
async function main() {
    console.log("Getting all ysws...");
    //Open ysws_entries.json and read it as JSON
    const yswsEntriesPath = path.join(__dirname, "..", "generated", "ysws_entries.json");
    const yswsEntriesContent = fs.readFileSync(yswsEntriesPath, "utf-8");
    const yswsEntries: YswsEntry[] = JSON.parse(yswsEntriesContent);
    console.log(`Got ${yswsEntries.length} ysws entries`);
    let ysws = new Set<string>();
    for (const entry of yswsEntries) {
        ysws.add(entry.ysws);
    }
    const map: Record<string, string> = {};
    console.log(`Got ${ysws.size} unique ysws`);
    for (const ysw of ysws) {
        map[ysw] = "#000000";
    }
    // Save the ysws to a file called all_ysws.json
    const outputPath = path.join(__dirname, "..", "generated", "all_ysws.json");
    fs.writeFileSync(outputPath, JSON.stringify(map), "utf-8");
    console.log(`Saved all ysws to ${outputPath}`);
}
main()
