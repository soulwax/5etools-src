import crypto from "crypto";
import {RulesBotCorpus} from "./corpus.mjs";
import {RulesBotDb} from "./db.mjs";
import {pGetBlackboxAnswer} from "./blackbox.mjs";
import {pGetOpenAiAnswer} from "./openai.mjs";

export class RulesBotService {
	constructor ({
		blackboxApiKey = process.env.BLACKBOX_API_KEY,
		blackboxModel = process.env.BLACKBOX_MODEL || "gpt-4.1-mini",
		openAiApiKey = process.env.OPENAI_API_KEY,
		openAiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini",
		rootDir = process.cwd(),
	} = {}) {
		this._blackboxApiKey = blackboxApiKey;
		this._blackboxModel = blackboxModel;
		this._openAiApiKey = openAiApiKey;
		this._openAiModel = openAiModel;
		this._rootDir = rootDir;

		this._corpus = null;
		this._db = new RulesBotDb();
	}

	async pInit () {
		if (!this._blackboxApiKey && !this._openAiApiKey) {
			throw new Error(`Missing AI provider key. Set BLACKBOX_API_KEY or OPENAI_API_KEY.`);
		}

		this._corpus = await RulesBotCorpus.pCreate({rootDir: this._rootDir});
		await this._db.pInit();
	}

	getStats () {
		const provider = this._blackboxApiKey ? "blackbox" : "openai";
		const model = this._blackboxApiKey ? this._blackboxModel : this._openAiModel;
		return {
			provider,
			model,
			databaseEnabled: this._db.isEnabled,
			...this._corpus.getStats(),
		};
	}

	async _pGetCompletion ({question, contexts, history}) {
		let blackboxError = null;

		if (this._blackboxApiKey) {
			try {
				return await pGetBlackboxAnswer({
					apiKey: this._blackboxApiKey,
					model: this._blackboxModel,
					question,
					contexts,
					history,
				});
			} catch (e) {
				blackboxError = e;
				if (!this._openAiApiKey) throw e;
				console.warn(`[rules-bot] Blackbox failed, falling back to OpenAI: ${e?.message || e}`);
			}
		}

		if (this._openAiApiKey) {
			try {
				return await pGetOpenAiAnswer({
					apiKey: this._openAiApiKey,
					model: this._openAiModel,
					question,
					contexts,
					history,
				});
			} catch (e) {
				if (blackboxError) {
					throw new Error(`Blackbox failed: ${blackboxError?.message || blackboxError}; OpenAI fallback failed: ${e?.message || e}`);
				}
				throw e;
			}
		}

		throw blackboxError || new Error(`Missing AI provider key. Set BLACKBOX_API_KEY or OPENAI_API_KEY.`);
	}

	_getLocalFallbackAnswer ({contexts}) {
		const intro = `AI generation is temporarily unavailable, so this answer is a local source fallback.`;
		if (!contexts.length) return `${intro} No strong local rules match was found for this question.`;

		const excerptBlocks = contexts
			.slice(0, 3)
			.map(ctx => {
				const pagePart = ctx.page == null ? "" : ` p.${ctx.page}`;
				const snippet = `${ctx.snippet || ""}`.trim();
				return `[${ctx.id}] ${ctx.name} (${ctx.source}${pagePart})\n${snippet}`;
			});

		return [
			intro,
			`Most relevant 5etools sources:`,
			...excerptBlocks,
		].join("\n\n");
	}

	async pAsk ({question, sessionId}) {
		const questionClean = `${question || ""}`.trim();
		if (!questionClean) throw new Error(`Question must be non-empty.`);

		const finalSessionId = sessionId || crypto.randomUUID();

		await this._db.pEnsureSession({sessionId: finalSessionId});

		const contexts = await this._corpus.pGetContexts(questionClean);
		const contextsForLog = contexts.map(({id, name, source, sourceAbv, page, category, url, hash}) => ({
			id,
			name,
			source,
			sourceAbv,
			page,
			category,
			url,
			hash,
		}));

		await this._db.pInsertQueryLog({
			sessionId: finalSessionId,
			question: questionClean,
			contexts: contextsForLog,
		});

		const history = await this._db.pGetRecentMessages({
			sessionId: finalSessionId,
			limit: 6,
		});

		let completion;
		try {
			completion = await this._pGetCompletion({
				question: questionClean,
				contexts,
				history,
			});
		} catch (e) {
			console.warn(`[rules-bot] AI completion unavailable, using local fallback: ${e?.message || e}`);
			completion = {
				text: this._getLocalFallbackAnswer({contexts}),
				model: "local-retrieval-fallback",
			};
		}

		await this._db.pInsertMessage({
			sessionId: finalSessionId,
			role: "user",
			content: questionClean,
		});

		await this._db.pInsertMessage({
			sessionId: finalSessionId,
			role: "assistant",
			content: completion.text,
			citations: contexts.map(({id, name, source, page, category, url, hash}) => ({
				id,
				name,
				source,
				page,
				category,
				url,
				hash,
			})),
		});

		return {
			sessionId: finalSessionId,
			answer: completion.text,
			model: completion.model,
			citations: contexts,
		};
	}
}
