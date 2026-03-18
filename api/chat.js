import {loadLocalEnvFiles} from "../node/rules-bot/env.mjs";
import {RulesBotService} from "../node/rules-bot/service.mjs";

const _MAX_BODY_CHARS = 200_000;

const _writeJson = (res, statusCode, body) => {
	res.statusCode = statusCode;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
	res.end(JSON.stringify(body));
};

const _pReadBody = async (req) => {
	if (req.body && typeof req.body === "object") return req.body;

	if (typeof req.body === "string") {
		const trimmed = req.body.trim();
		return trimmed ? JSON.parse(trimmed) : {};
	}

	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > _MAX_BODY_CHARS) throw new Error(`Request body too large.`);
		chunks.push(chunk);
	}

	if (!chunks.length) return {};
	const raw = Buffer.concat(chunks).toString("utf8");
	if (!raw.trim()) return {};
	return JSON.parse(raw);
};

const _pGetService = async () => {
	loadLocalEnvFiles();

	const g = globalThis;
	if (g.__rulesBotService) return g.__rulesBotService;
	if (g.__rulesBotServiceInitPromise) return g.__rulesBotServiceInitPromise;

	g.__rulesBotServiceInitPromise = (async () => {
		const service = new RulesBotService();
		await service.pInit();
		g.__rulesBotService = service;
		return service;
	})();

	return g.__rulesBotServiceInitPromise;
};

export default async function handler (req, res) {
	try {
		if (req.method === "OPTIONS") {
			_writeJson(res, 204, {});
			return;
		}

		if (req.method === "GET") {
			const service = await _pGetService();
			_writeJson(res, 200, {
				ok: true,
				stats: service.getStats(),
			});
			return;
		}

		if (req.method !== "POST") {
			_writeJson(res, 405, {ok: false, error: "Method not allowed."});
			return;
		}

		const body = await _pReadBody(req);
		const question = `${body?.question || ""}`.trim();
		const sessionId = body?.sessionId ? `${body.sessionId}` : undefined;

		if (!question) {
			_writeJson(res, 400, {ok: false, error: `Missing "question".`});
			return;
		}

		const service = await _pGetService();
		const out = await service.pAsk({question, sessionId});
		_writeJson(res, 200, {ok: true, ...out});
	} catch (e) {
		_writeJson(res, 500, {
			ok: false,
			error: e?.message || "Unexpected error.",
		});
	}
}
