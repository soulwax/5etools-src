/**
 * Machine-translate 5etools data files using OpenAI.
 *
 * Usage:
 *   node node/translate-data.js --lang de --file data/spells/spells-phb.json
 *   node node/translate-data.js --lang de
 *
 * Options:
 *   --lang <code>   Target language code: de, fr, es, it, pt  (default: de)
 *   --file <path>   Translate a single file (relative to project root)
 *   --dir  <path>   Root data directory to scan               (default: data)
 *   --dry-run       Print what would be translated without calling the API
 */

import {readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync} from "fs";
import {resolve, dirname, join, relative, basename} from "path";
import {fileURLToPath} from "url";
import {Command} from "commander";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// ── Environment ──────────────────────────────────────────────────────────────

function loadEnv () {
	try {
		const out = {};
		for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
			const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
			if (m) out[m[1].trim()] = m[2].trim();
		}
		return out;
	} catch { return {}; }
}

const ENV = loadEnv();
const API_KEY = ENV.OPENAI_API_KEY || process.env.OPENAI_API_KEY;

// ── Constants ────────────────────────────────────────────────────────────────

const LANG_NAMES = {
	"de": "German",
	"fr": "French",
	"es": "Spanish",
	"it": "Italian",
	"pt": "Portuguese",
};

const BATCH_SIZE = 40; // strings per API call

// Fields whose values are metadata/codes — never translate
const SKIP_FIELDS = new Set([
	"source", "page", "srd", "basicRules", "edition", "otherSources",
	"referenceSources", "reprintedAs", "hasFluff", "hasFluffImages",
	"type", "school", "unit", "href", "path", "url", "hash", "id",
	"tag", "filterType", "renderer",
	"damageInflict", "savingThrow", "miscTags", "traitTags", "creatureTypes",
	"spellcastingTags", "conditionInflict", "conditionInflictSpell",
	"ability", "feats", "skillProficiencies", "toolProficiencies",
	"languageProficiencies", "weaponProficiencies", "armorProficiencies",
	"startingEquipment", "startingEquipmentOr", "additionalSpells",
	"optionalfeatureProgression", "speed", "ac", "hp",
	"str", "dex", "con", "int", "wis", "cha", "cr", "xp",
	"alignment", "size", "immune", "resist", "vulnerable",
	"conditionImmune", "spellcasting", "reactions", "legendaryActions",
	"senses", "languages", "images", "width", "height",
]);

// ── String helpers ───────────────────────────────────────────────────────────

// Returns true if a string is a code/reference that should not be translated
function isUntranslatable (str) {
	if (typeof str !== "string" || str.trim() === "") return true;
	if (str.includes("|")) return true; // source reference e.g. "Fireball|PHB"
	if (/^\d+d\d+/.test(str)) return true; // dice notation
	if (/^[A-Z_]{1,8}$/.test(str)) return true; // short all-caps code
	return false;
}

// Replace {@tag ...} with numbered placeholders so the AI doesn't mangle them
const TAG_RE = /\{@[^}]+\}/g;

function extractTags (str) {
	const tags = [];
	const cleaned = str.replace(TAG_RE, match => {
		const idx = tags.length;
		tags.push(match);
		return `§${idx}§`;
	});
	return {cleaned, tags};
}

function restoreTags (str, tags) {
	return str.replace(/§(\d+)§/g, (_, i) => tags[+i] ?? `§${i}§`);
}

// ── JSON walker ──────────────────────────────────────────────────────────────

/**
 * Recursively collect all translatable strings from a content-entry tree.
 * Returns [{path, text}] where path is an array of keys/indices.
 */
function collectStrings (obj, path = [], results = []) {
	if (typeof obj === "string") {
		if (!isUntranslatable(obj)) results.push({path: [...path], text: obj});
	} else if (Array.isArray(obj)) {
		obj.forEach((item, i) => collectStrings(item, [...path, i], results));
	} else if (obj && typeof obj === "object") {
		for (const [key, val] of Object.entries(obj)) {
			if (SKIP_FIELDS.has(key)) continue;

			if (key === "name" || key === "entry" || key === "caption") {
				if (typeof val === "string" && !isUntranslatable(val)) {
					results.push({path: [...path, key], text: val});
				}
			} else if (key === "entries" || key === "colLabels") {
				collectStrings(val, [...path, key], results);
			} else if (key === "items" && Array.isArray(val)) {
				// List items — recurse
				val.forEach((item, i) => collectStrings(item, [...path, key, i], results));
			} else if (key === "rows" && Array.isArray(val)) {
				val.forEach((row, ri) => {
					if (!Array.isArray(row)) return;
					row.forEach((cell, ci) => {
						collectStrings(cell, [...path, key, ri, ci], results);
					});
				});
			}
		}
	}
	return results;
}

function setAtPath (obj, path, value) {
	let cur = obj;
	for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
	cur[path[path.length - 1]] = value;
}

// ── OpenAI API ───────────────────────────────────────────────────────────────

async function callOpenAI (messages) {
	for (let attempt = 0; attempt < 5; attempt++) {
		const res = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${API_KEY}`,
			},
			body: JSON.stringify({
				model: "gpt-4o-mini",
				messages,
				temperature: 0.1,
				max_tokens: 4096,
			}),
		});

		if (res.status === 429) {
			const wait = Math.pow(2, attempt + 1) * 2000;
			console.warn(`    Rate limited — waiting ${wait / 1000}s...`);
			await new Promise(r => setTimeout(r, wait));
			continue;
		}

		if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
		const data = await res.json();
		return data.choices[0].message.content;
	}
	throw new Error("Exceeded retry limit");
}

async function translateBatch (strings, langName) {
	const numbered = strings.map((s, i) => `${i + 1}. ${s}`).join("\n");

	const content = await callOpenAI([
		{
			role: "system",
			content: `You are a professional translator for Dungeons & Dragons 5th Edition. Translate from English to ${langName}.
RULES:
- §0§ §1§ §2§ etc. are internal placeholders — copy them EXACTLY, do not translate or move them
- Use official ${langName} D&D 5e terminology from published sourcebooks where it exists
- Return ONLY the numbered list in "N. translated text" format — no explanations`,
		},
		{role: "user", content: numbered},
	]);

	const result = new Array(strings.length).fill(null);
	for (const line of content.split("\n")) {
		const m = line.match(/^(\d+)\.\s+([\s\S]+)/);
		if (m) {
			const idx = parseInt(m[1]) - 1;
			if (idx >= 0 && idx < strings.length) result[idx] = m[2].trim();
		}
	}
	// Fall back to original for anything the model missed
	for (let i = 0; i < strings.length; i++) {
		if (result[i] === null) result[i] = strings[i];
	}
	return result;
}

// ── Per-item translation ─────────────────────────────────────────────────────

async function translateItem (item, langName, dryRun) {
	const clone = JSON.parse(JSON.stringify(item));

	const toTranslate = [];

	// Top-level name
	if (typeof clone.name === "string" && !isUntranslatable(clone.name)) {
		toTranslate.push({path: ["name"], text: clone.name});
	}

	// Content fields
	for (const field of ["entries", "additionalEntries", "entriesHigherLevel", "entryData"]) {
		if (clone[field] !== undefined) {
			collectStrings(clone[field], [field], toTranslate);
		}
	}

	if (toTranslate.length === 0) return clone;
	if (dryRun) {
		console.log(`    [dry-run] Would translate ${toTranslate.length} strings`);
		return clone;
	}

	// Extract tags, translate, restore
	const tagMaps = toTranslate.map(({text}) => extractTags(text));
	const cleaned = tagMaps.map(t => t.cleaned);

	const translations = [];
	for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
		const batchResult = await translateBatch(cleaned.slice(i, i + BATCH_SIZE), langName);
		translations.push(...batchResult);
	}

	for (let i = 0; i < translations.length; i++) {
		setAtPath(clone, toTranslate[i].path, restoreTags(translations[i], tagMaps[i].tags));
	}
	return clone;
}

// ── File processing ──────────────────────────────────────────────────────────

function getJsonFiles (dir) {
	const files = [];
	const skipDirs = new Set(["generated", "lang"]);
	const skipPrefixes = ["fluff-", "foundry-"];

	const walk = d => {
		for (const entry of readdirSync(d)) {
			const full = join(d, entry);
			if (statSync(full).isDirectory()) {
				if (!skipDirs.has(entry)) walk(full);
			} else if (
				entry.endsWith(".json")
				&& !skipPrefixes.some(p => entry.startsWith(p))
			) {
				files.push(full);
			}
		}
	};
	walk(dir);
	return files;
}

async function translateFile (inputPath, outputPath, langName, dryRun) {
	if (!dryRun && existsSync(outputPath)) {
		console.log(`  Skipping (exists): ${relative(ROOT, outputPath)}`);
		return;
	}

	let data;
	try {
		data = JSON.parse(readFileSync(inputPath, "utf8"));
	} catch {
		console.warn(`  Skipping (bad JSON): ${relative(ROOT, inputPath)}`);
		return;
	}

	const contentKeys = Object.keys(data).filter(k => !k.startsWith("_") && Array.isArray(data[k]));
	if (contentKeys.length === 0) {
		console.log(`  Skipping (no content): ${relative(ROOT, inputPath)}`);
		return;
	}

	const result = JSON.parse(JSON.stringify(data));

	for (const key of contentKeys) {
		const items = data[key];
		console.log(`  [${key}] ${items.length} items`);

		const translated = [];
		for (let i = 0; i < items.length; i++) {
			if ((i + 1) % 20 === 0 || i === items.length - 1) {
				process.stdout.write(`    ${i + 1}/${items.length}\r`);
			}
			translated.push(await translateItem(items[i], langName, dryRun));
		}
		console.log();
		result[key] = translated;
	}

	if (!dryRun) {
		mkdirSync(dirname(outputPath), {recursive: true});
		writeFileSync(outputPath, JSON.stringify(result, null, "\t"));
		console.log(`  Written: ${relative(ROOT, outputPath)}\n`);
	}
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command()
	.option("--lang <code>", "Target language (de, fr, es, it, pt)", "de")
	.option("--file <path>", "Single file to translate (relative to project root)")
	.option("--dir <path>", "Data directory to scan", "data")
	.option("--dry-run", "Print what would happen without calling the API");

program.parse(process.argv);
const opts = program.opts();

const langCode = opts.lang;
const langName = LANG_NAMES[langCode];
if (!langName) {
	console.error(`Unknown language "${langCode}". Supported: ${Object.keys(LANG_NAMES).join(", ")}`);
	process.exit(1);
}

if (!API_KEY && !opts.dryRun) {
	console.error("OPENAI_API_KEY not found in .env or environment");
	process.exit(1);
}

const dataDir = join(ROOT, "data");
const outputDir = join(dataDir, "lang", langCode);

console.log(`Language : ${langName} (${langCode})`);
console.log(`Output   : ${relative(ROOT, outputDir)}`);
if (opts.dryRun) console.log("Dry run  : yes\n");
else console.log();

if (opts.file) {
	const inputPath = resolve(ROOT, opts.file);
	const outputPath = join(outputDir, relative(dataDir, inputPath));
	console.log(`File: ${relative(ROOT, inputPath)}`);
	await translateFile(inputPath, outputPath, langName, opts.dryRun);
} else {
	const files = getJsonFiles(join(ROOT, opts.dir));
	console.log(`Found ${files.length} files\n`);
	for (const file of files) {
		console.log(`\n── ${relative(ROOT, file)}`);
		await translateFile(file, join(outputDir, relative(dataDir, file)), langName, opts.dryRun);
	}
}

console.log("\nDone.");
