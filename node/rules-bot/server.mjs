import http from "http";
import {loadLocalEnvFiles} from "./env.mjs";
import {RulesBotService} from "./service.mjs";

const _MAX_BODY_CHARS = 200_000;
let _service = null;
let _serviceInitPromise = null;

const _sendJson = (res, statusCode, body) => {
	res.writeHead(statusCode, {
		"Content-Type": "application/json; charset=utf-8",
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Headers": "Content-Type",
		"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
	});
	res.end(JSON.stringify(body));
};

const _pReadJsonBody = async (req) => {
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
	if (_service) return _service;
	if (_serviceInitPromise) return _serviceInitPromise;

	_serviceInitPromise = (async () => {
		const service = new RulesBotService();
		await service.pInit();
		_service = service;
		return service;
	})();

	try {
		return await _serviceInitPromise;
	} catch (e) {
		_serviceInitPromise = null;
		throw e;
	}
};

async function pMain () {
	loadLocalEnvFiles();
	const port = Number(process.env.RULES_BOT_PORT || 4516);

	const server = http.createServer(async (req, res) => {
		try {
			if (req.method === "OPTIONS") {
				_sendJson(res, 204, {});
				return;
			}

			if (req.method === "GET" && req.url === "/health") {
				const service = await _pGetService();
				_sendJson(res, 200, {ok: true, stats: service.getStats()});
				return;
			}

			if (req.method === "POST" && req.url === "/api/chat") {
				const body = await _pReadJsonBody(req);
				const question = `${body?.question || ""}`.trim();
				const sessionId = body?.sessionId ? `${body.sessionId}` : undefined;

				if (!question) {
					_sendJson(res, 400, {ok: false, error: `Missing "question".`});
					return;
				}

				const service = await _pGetService();
				const out = await service.pAsk({question, sessionId});
				_sendJson(res, 200, {ok: true, ...out});
				return;
			}

			_sendJson(res, 404, {ok: false, error: "Not found."});
		} catch (e) {
			_sendJson(res, 500, {
				ok: false,
				error: e?.message || "Unexpected error.",
			});
		}
	});

	server.listen(port, () => {
		console.log(`[rules-bot] Listening on http://localhost:${port}`);
		console.log(`[rules-bot] POST /api/chat | GET /health`);
		_pGetService()
			.then(() => console.log(`[rules-bot] Service initialized.`))
			.catch(e => console.error(`[rules-bot] Service init failed: ${e?.stack || e?.message || e}`));
	});
}

pMain().catch(e => {
	console.error(`[rules-bot] Fatal: ${e.stack || e.message}`);
	process.exit(1);
});
