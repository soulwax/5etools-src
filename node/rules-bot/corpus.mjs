import fs from "fs";
import path from "path";
import "../../js/parser.js";
import "../../js/utils.js";
import "../../js/utils-dataloader.js";
import "../../js/render.js";
import "../../js/render-dice.js";
import "../../js/omnidexer.js";

const _MAX_SEARCH_RESULTS = 64;
const _MAX_CONTEXTS_DEFAULT = 8;
const _MAX_SNIPPET_CHARS = 1800;

const _SEO_DIR_BY_CATEGORY = new Map([
	[Parser.CAT_ID_SPELL, "spells"],
	[Parser.CAT_ID_CREATURE, "bestiary"],
	[Parser.CAT_ID_ITEM, "items"],
]);

const _ENTITY_TEXT_KEYS = [
	"entries",
	"entry",
	"entriesHigherLevel",
	"headerEntries",
	"footerEntries",
	"trait",
	"action",
	"bonus",
	"reaction",
	"legendary",
	"mythic",
	"spellcasting",
	"table",
	"description",
	"text",
	"fluff",
	"rows",
];

const _STOPWORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"by",
	"can",
	"could",
	"did",
	"do",
	"does",
	"for",
	"from",
	"get",
	"give",
	"how",
	"i",
	"in",
	"is",
	"it",
	"its",
	"me",
	"my",
	"of",
	"on",
	"or",
	"our",
	"should",
	"show",
	"that",
	"the",
	"their",
	"them",
	"there",
	"these",
	"they",
	"this",
	"to",
	"up",
	"use",
	"was",
	"we",
	"what",
	"when",
	"where",
	"which",
	"who",
	"why",
	"with",
	"work",
	"would",
	"you",
	"your",
]);

const _CATEGORY_BASE_WEIGHTS = new Map([
	[Parser.CAT_ID_VARIANT_OPTIONAL_RULE, 28],
	[Parser.CAT_ID_SPELL, 22],
	[Parser.CAT_ID_ACTION, 16],
	[Parser.CAT_ID_CONDITION, 15],
	[Parser.CAT_ID_STATUS, 15],
	[Parser.CAT_ID_CLASS_FEATURE, 13],
	[Parser.CAT_ID_SUBCLASS_FEATURE, 13],
	[Parser.CAT_ID_FEAT, 11],
	[Parser.CAT_ID_OPTIONAL_FEATURE_OTHER, 10],
	[Parser.CAT_ID_ELDRITCH_INVOCATION, 10],
	[Parser.CAT_ID_METAMAGIC, 10],
	[Parser.CAT_ID_MANEUVER_BATTLE_MASTER, 10],
	[Parser.CAT_ID_MANEUVER_CAVALIER, 10],
	[Parser.CAT_ID_ARCANE_SHOT, 10],
	[Parser.CAT_ID_FIGHTING_STYLE, 10],
	[Parser.CAT_ID_PACT_BOON, 10],
	[Parser.CAT_ID_ELEMENTAL_DISCIPLINE, 10],
	[Parser.CAT_ID_ARTIFICER_INFUSION, 10],
	[Parser.CAT_ID_ONOMANCY_RESONANT, 10],
	[Parser.CAT_ID_RUNE_KNIGHT_RUNE, 10],
	[Parser.CAT_ID_ALCHEMICAL_FORMULA, 10],
	[Parser.CAT_ID_MANEUVER, 10],
	[Parser.CAT_ID_CLASS, 7],
	[Parser.CAT_ID_SUBCLASS, 7],
	[Parser.CAT_ID_ITEM, 4],
	[Parser.CAT_ID_CREATURE, -4],
]);

const _SOURCE_BASE_WEIGHTS = new Map([
	[Parser.SRC_XPHB, 24],
	[Parser.SRC_XDMG, 18],
	[Parser.SRC_XMM, 10],
	[Parser.SRC_PHB, 14],
	[Parser.SRC_DMG, 9],
	[Parser.SRC_MM, 4],
]);

const _RULE_INTENT_TERMS = new Set([
	"action",
	"attack",
	"bonus",
	"cast",
	"casting",
	"check",
	"concentration",
	"damage",
	"disadvantage",
	"duration",
	"effect",
	"hit",
	"level",
	"range",
	"reaction",
	"rest",
	"roll",
	"save",
	"saving",
	"slot",
	"spell",
	"trigger",
	"turn",
]);

const _GENERIC_QUERY_TERMS = new Set([
	"action",
	"attunement",
	"attack",
	"bonus",
	"cast",
	"class",
	"condition",
	"damage",
	"effect",
	"feature",
	"level",
	"monster",
	"option",
	"optional",
	"race",
	"reaction",
	"rule",
	"rules",
	"save",
	"slot",
	"spell",
	"status",
	"subclass",
]);

const _RULE_FOCUSED_CATEGORIES = new Set([
	Parser.CAT_ID_VARIANT_OPTIONAL_RULE,
	Parser.CAT_ID_SPELL,
	Parser.CAT_ID_ACTION,
	Parser.CAT_ID_CONDITION,
	Parser.CAT_ID_STATUS,
	Parser.CAT_ID_CLASS_FEATURE,
	Parser.CAT_ID_SUBCLASS_FEATURE,
	Parser.CAT_ID_FEAT,
	Parser.CAT_ID_OPTIONAL_FEATURE_OTHER,
	Parser.CAT_ID_ELDRITCH_INVOCATION,
	Parser.CAT_ID_METAMAGIC,
	Parser.CAT_ID_MANEUVER_BATTLE_MASTER,
	Parser.CAT_ID_MANEUVER_CAVALIER,
	Parser.CAT_ID_ARCANE_SHOT,
	Parser.CAT_ID_FIGHTING_STYLE,
	Parser.CAT_ID_PACT_BOON,
	Parser.CAT_ID_ELEMENTAL_DISCIPLINE,
	Parser.CAT_ID_ARTIFICER_INFUSION,
	Parser.CAT_ID_ONOMANCY_RESONANT,
	Parser.CAT_ID_RUNE_KNIGHT_RUNE,
	Parser.CAT_ID_ALCHEMICAL_FORMULA,
	Parser.CAT_ID_MANEUVER,
]);

const _FLAVOR_HEAVY_CATEGORIES = new Set([
	Parser.CAT_ID_CREATURE,
	Parser.CAT_ID_ADVENTURE,
	Parser.CAT_ID_BOOK,
	Parser.CAT_ID_RECIPES,
]);

const _INTENT_CATEGORY_HINTS = [
	{
		tokens: ["spell", "slot", "cantrip", "concentration", "ritual"],
		categories: [Parser.CAT_ID_SPELL],
		boost: 42,
	},
	{
		tokens: ["condition", "grappled", "prone", "blinded", "restrained", "invisible"],
		categories: [Parser.CAT_ID_CONDITION, Parser.CAT_ID_STATUS],
		boost: 36,
	},
	{
		tokens: ["class", "subclass", "feature", "level", "multiclass"],
		categories: [Parser.CAT_ID_CLASS, Parser.CAT_ID_SUBCLASS, Parser.CAT_ID_CLASS_FEATURE, Parser.CAT_ID_SUBCLASS_FEATURE],
		boost: 28,
	},
	{
		tokens: ["feat", "feats"],
		categories: [Parser.CAT_ID_FEAT],
		boost: 34,
	},
	{
		tokens: ["item", "attunement", "weapon", "armor", "potion"],
		categories: [Parser.CAT_ID_ITEM],
		boost: 26,
	},
	{
		tokens: ["monster", "creature", "bestiary", "statblock", "cr"],
		categories: [Parser.CAT_ID_CREATURE],
		boost: 24,
	},
	{
		tokens: ["rule", "rules", "glossary", "optional", "variant"],
		categories: [Parser.CAT_ID_VARIANT_OPTIONAL_RULE],
		boost: 42,
	},
	{
		tokens: ["action", "bonus", "reaction", "ready", "grapple", "shove"],
		categories: [Parser.CAT_ID_ACTION],
		boost: 32,
	},
];

const _WALKER = MiscUtil.getWalker({
	isNoModification: true,
	keyBlocklist: MiscUtil.GENERIC_WALKER_ENTRIES_KEY_BLOCKLIST,
});

const _DUMMY_INDEXER = {
	getMetaId: (_k, v) => v,
};

const _getByPath = (obj, pathWithDots) => {
	if (!obj || !pathWithDots) return null;
	return pathWithDots
		.split(".")
		.reduce((acc, prop) => (acc == null ? null : acc[prop]), obj);
};

const _isIndexableByMeta = (meta, ent) => {
	if (meta.include && !meta.include(ent)) return false;
	if (meta.filter && meta.filter(ent)) return false;
	return true;
};

const _normalizeCleanText = (str) => {
	if (!str) return "";
	return Renderer.stripTags(`${str}`)
		.replace(/\s+/g, " ")
		.trim();
};

const _sqlTokenize = (query) => {
	return (query.toLowerCase().match(/[a-z0-9]+/g) || [])
		.filter(token => token.length > 1 || /^\d+$/.test(token))
		.filter(token => !_STOPWORDS.has(token));
};

const _hasAnyToken = (tokensSet, tokens) => tokens.some(token => tokensSet.has(token));

export class RulesBotCorpus {
	constructor ({rootDir = process.cwd()} = {}) {
		this._rootDir = rootDir;

		this._indexDocs = [];
		this._metasByCategory = new Map();

		this._jsonCache = new Map();
		this._entityMapCache = new Map();
		this._seoSnippetCache = new Map();
	}

	static async pCreate (opts = {}) {
		const out = new this(opts);
		await out.pInit();
		return out;
	}

	async pInit () {
		const indexPath = path.join(this._rootDir, "search", "index.json");
		const indexRaw = JSON.parse(fs.readFileSync(indexPath, "utf8"));

		this._indexDocs = Omnidexer.decompressIndex(indexRaw)
			.filter(doc => doc?.n && doc?.u && doc?.c != null)
			.map(doc => ({
				...doc,
				nLower: doc.n.toLowerCase(),
				sA: doc.sA || (doc.s ? Parser.sourceJsonToAbv(doc.s) : ""),
				sLower: (doc.s || "").toLowerCase(),
				sALower: (doc.sA || (doc.s ? Parser.sourceJsonToAbv(doc.s) : "") || "").toLowerCase(),
			}));

		this._metasByCategory = this._getMetasByCategory();
	}

	getStats () {
		return {
			indexDocuments: this._indexDocs.length,
			categoriesIndexed: this._metasByCategory.size,
		};
	}

	async pGetContexts (query, {maxContexts = _MAX_CONTEXTS_DEFAULT} = {}) {
		const hits = this._search(query, {maxResults: _MAX_SEARCH_RESULTS});
		const out = [];
		const dedupe = new Set();

		for (const doc of hits) {
			const key = `${doc.c}|${doc.u}`.toLowerCase();
			if (dedupe.has(key)) continue;
			dedupe.add(key);

			const snippet = await this._pGetSnippetForDoc(doc);
			if (!snippet) continue;

			const url = this._getUrlForDoc(doc);
			out.push({
				id: out.length + 1,
				name: doc.n,
				source: doc.s || "Unknown Source",
				sourceAbv: doc.sA || "",
				page: doc.p ?? null,
				category: Parser.pageCategoryToFull(doc.c),
				url,
				hash: doc.u,
				snippet,
			});

			if (out.length >= maxContexts) break;
		}

		return out;
	}

	_search (query, {maxResults = _MAX_SEARCH_RESULTS} = {}) {
		const queryClean = (query || "").trim().toLowerCase();
		if (!queryClean) return [];

		const tokens = _sqlTokenize(queryClean);
		if (!tokens.length) return [];
		const queryMeta = this._getQueryMeta({tokens});

		const scored = [];

		for (const doc of this._indexDocs) {
			const score = this._getScoreForDoc({doc, queryClean, tokens, queryMeta});
			if (score <= 0) continue;
			scored.push({doc, score});
		}

		const deduped = new Map();
		scored.forEach(({doc, score}) => {
			const key = `${doc.c}|${doc.u}`.toLowerCase();
			const existing = deduped.get(key);
			if (!existing || score > existing.score) deduped.set(key, {doc, score});
		});

		return [...deduped.values()]
			.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				if ((a.doc.n || "").length !== (b.doc.n || "").length) return (a.doc.n || "").length - (b.doc.n || "").length;
				return SortUtil.ascSortLower(a.doc.n, b.doc.n);
			})
			.slice(0, maxResults)
			.map(({doc}) => doc);
	}

	_getQueryMeta ({tokens}) {
		const categoryBoost = new Map();
		_INTENT_CATEGORY_HINTS.forEach(({tokens: metaTokens, categories, boost}) => {
			if (!metaTokens.some(token => tokens.includes(token))) return;
			categories.forEach(categoryId => categoryBoost.set(categoryId, (categoryBoost.get(categoryId) || 0) + boost));
		});

		return {
			isRulesIntent: _hasAnyToken(_RULE_INTENT_TERMS, tokens),
			categoryBoost,
			anchorTokens: tokens.filter(token => !_GENERIC_QUERY_TERMS.has(token)),
		};
	}

	_getScoreForDoc ({doc, queryClean, tokens, queryMeta}) {
		let score = 0;
		let lexicalScore = 0;
		const name = doc.nLower;
		let tokenHits = 0;
		let anchorTokenHits = 0;
		const anchorTokenSet = new Set(queryMeta.anchorTokens);

		if (name === queryClean) lexicalScore += 1000;
		if (name.startsWith(queryClean)) lexicalScore += 320;
		if (name.includes(queryClean)) lexicalScore += 180;

		for (const token of tokens) {
			const isAnchorToken = anchorTokenSet.has(token);

			if (name === token) {
				lexicalScore += 150;
				tokenHits++;
				if (isAnchorToken) {
					lexicalScore += 96;
					anchorTokenHits++;
				}
				continue;
			}

			if (
				name.startsWith(`${token} `)
				|| name.includes(` ${token} `)
				|| name.endsWith(` ${token}`)
			) {
				lexicalScore += 72;
				tokenHits++;
				if (isAnchorToken) {
					lexicalScore += 96;
					anchorTokenHits++;
				}
				continue;
			}

			if (name.includes(token)) {
				lexicalScore += 36;
				tokenHits++;
				if (isAnchorToken) {
					lexicalScore += 96;
					anchorTokenHits++;
				}
			}

			if (doc.sLower && doc.sLower === token) lexicalScore += 8;
			if (doc.sALower && doc.sALower === token) lexicalScore += 8;
		}

		if (!lexicalScore || (!tokenHits && !name.includes(queryClean))) return 0;
		if (queryMeta.anchorTokens.length && !anchorTokenHits) return 0;

		score += lexicalScore;

		const coverage = tokenHits / Math.max(tokens.length, 1);
		score += Math.round(coverage * 140);
		if (tokenHits === tokens.length && tokens.length > 1) score += 60;
		if (tokens.length >= 3 && tokenHits <= 1) score -= 22;
		if (queryMeta.anchorTokens.length) {
			if (anchorTokenHits === queryMeta.anchorTokens.length) score += 70;
			else score -= (queryMeta.anchorTokens.length - anchorTokenHits) * 12;
		}

		score += _CATEGORY_BASE_WEIGHTS.get(doc.c) || 0;
		score += _SOURCE_BASE_WEIGHTS.get(doc.s) || 0;

		if (queryMeta.isRulesIntent) {
			if (_RULE_FOCUSED_CATEGORIES.has(doc.c)) score += 18;
			if (_FLAVOR_HEAVY_CATEGORIES.has(doc.c)) score -= 22;
		}

		score += queryMeta.categoryBoost.get(doc.c) || 0;

		if (Parser.SOURCES_VANILLA.has(doc.s)) score += 8;
		if (doc.dR) score -= 10;
		if (doc.s && SourceUtil.isNonstandardSource(doc.s)) score -= 28;

		return score;
	}

	async _pGetSnippetForDoc (doc) {
		const key = `${doc.c}|${doc.u}`.toLowerCase();

		if (this._seoSnippetCache.has(key)) return this._seoSnippetCache.get(key);

		const fromSeo = this._getSnippetFromSeo(doc);
		if (fromSeo) {
			this._seoSnippetCache.set(key, fromSeo);
			return fromSeo;
		}

		const fromRaw = await this._pGetRawSnippet(doc);
		this._seoSnippetCache.set(key, fromRaw || null);
		return fromRaw || null;
	}

	_getSnippetFromSeo (doc) {
		const dir = _SEO_DIR_BY_CATEGORY.get(doc.c);
		if (!dir) return null;

		const slug = UrlUtil.getSluggedHash(doc.u);
		const filePath = path.join(this._rootDir, dir, `${slug}.html`);
		if (!fs.existsSync(filePath)) return null;

		const raw = fs.readFileSync(filePath, "utf8");
		const match = raw.match(/<meta\s+name="og:description"\s+content="([^"]+)">/i)
			|| raw.match(/<meta\s+property="og:description"\s+content="([^"]+)">/i);
		if (!match) return null;

		return _normalizeCleanText(match[1].unescapeQuotes());
	}

	async _pGetRawSnippet (doc) {
		const metas = this._metasByCategory.get(doc.c);
		if (!metas?.length) return null;

		for (const meta of metas) {
			const entityMap = await this._pGetEntityMapForMeta({meta, source: doc.s});
			const hit = entityMap.get(doc.u.toLowerCase());
			if (hit) return hit;
		}

		return null;
	}

	async _pGetEntityMapForMeta ({meta, source}) {
		const cacheKey = `${meta.category}|${meta.dir || meta.file}|${meta.listProp}|${source || "*"}`.toLowerCase();
		if (this._entityMapCache.has(cacheKey)) return this._entityMapCache.get(cacheKey);

		const out = new Map();
		const datasets = this._getDataSetsForMeta({meta, source});

		for (const data of datasets) {
			const dataMut = this._getDataWithPostLoad({meta, data});
			const entities = _getByPath(dataMut, meta.listProp);
			if (!(entities instanceof Array)) continue;

			const hashBuilder = meta.hashBuilder || UrlUtil.URL_TO_HASH_BUILDER[meta.listProp];
			if (!hashBuilder && !meta.pGetDeepIndex) continue;

			for (let ix = 0; ix < entities.length; ++ix) {
				const ent = entities[ix];
				if (!_isIndexableByMeta(meta, ent)) continue;
				if (source && SourceUtil.getEntitySource(ent)?.toLowerCase() !== source.toLowerCase()) continue;

				const snippet = this._getEntitySnippet(ent);
				if (!snippet) continue;

				if (hashBuilder) {
					const hash = hashBuilder(ent, ix);
					if (hash) this._setSnippet(out, hash, snippet);
				}

				try {
					const deep = await meta.pGetDeepIndex?.(_DUMMY_INDEXER, {parentName: ent.name || ""}, ent, {name: ent.name});
					if (deep?.length) {
						deep.forEach(deepDoc => {
							if (!deepDoc?.u) return;
							this._setSnippet(out, deepDoc.u, snippet);
						});
					}
				} catch (_e) {
					// Ignore failed deep-index generation in retrieval mode.
				}
			}
		}

		this._entityMapCache.set(cacheKey, out);
		return out;
	}

	_getDataSetsForMeta ({meta, source}) {
		if (meta.dir) {
			if (!source) return [];

			const indexPath = path.join(this._rootDir, "data", meta.dir, "index.json");
			const indexJson = this._getJsonCached(indexPath);

			const filename = indexJson[source]
				|| indexJson[source.toUpperCase()]
				|| Object.entries(indexJson).find(([k]) => k.toLowerCase() === source.toLowerCase())?.[1];

			if (!filename) {
				if (meta.dir !== "class") return [];

				return Object.values(indexJson)
					.map(file => path.join(this._rootDir, "data", meta.dir, file))
					.map(filePath => this._getJsonCached(filePath));
			}

			const dataPath = path.join(this._rootDir, "data", meta.dir, filename);
			return [this._getJsonCached(dataPath)];
		}

		if (!meta.file) return [];
		const filePath = path.join(this._rootDir, "data", meta.file);
		return [this._getJsonCached(filePath)];
	}

	_getDataWithPostLoad ({meta, data}) {
		if (!meta.postLoad) return data;
		try {
			return meta.postLoad(MiscUtil.copyFast(data));
		} catch (_e) {
			return data;
		}
	}

	_getJsonCached (filePath) {
		const absPath = path.resolve(filePath);
		if (this._jsonCache.has(absPath)) return this._jsonCache.get(absPath);

		const out = JSON.parse(fs.readFileSync(absPath, "utf8").replace(/^\uFEFF/, ""));
		this._jsonCache.set(absPath, out);
		return out;
	}

	_setSnippet (map, hash, snippet) {
		const key = `${hash}`.toLowerCase();
		const existing = map.get(key);
		if (!existing || existing.length < snippet.length) map.set(key, snippet);
	}

	_getEntitySnippet (ent) {
		const roots = _ENTITY_TEXT_KEYS
			.map(key => ent[key])
			.filter(Boolean);
		if (!roots.length) roots.push(ent.entries || ent.entry || ent);

		const seen = new Set();
		const parts = [];

		roots.forEach(root => {
			_WALKER.walk(root, {
				string: (str) => {
					const clean = _normalizeCleanText(str);
					if (!clean || clean.length < 3) return;

					const cleanLower = clean.toLowerCase();
					if (seen.has(cleanLower)) return;
					seen.add(cleanLower);
					parts.push(clean);
				},
			});
		});

		if (!parts.length) return null;

		const merged = parts.join(" ").replace(/\s+/g, " ").trim();
		if (!merged) return null;
		if (merged.length <= _MAX_SNIPPET_CHARS) return merged;
		return `${merged.slice(0, _MAX_SNIPPET_CHARS).trimEnd()}...`;
	}

	_getUrlForDoc (doc) {
		const page = UrlUtil.categoryToPage(doc.c);
		if (!page) return null;
		return `${page}#${doc.u}`;
	}

	_getMetasByCategory () {
		const out = new Map();
		const all = [...Omnidexer.TO_INDEX__FROM_INDEX_JSON, ...Omnidexer.TO_INDEX];

		all.forEach(meta => {
			if (meta.category == null) return;
			if (!meta.listProp) return;

			const existing = out.get(meta.category) || [];
			existing.push(meta);
			out.set(meta.category, existing);
		});

		return out;
	}
}
