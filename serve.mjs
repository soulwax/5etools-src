/**
 * Unified production server.
 * Serves static files and handles POST /api/chat via the rules-bot.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import chatHandler from "./api/chat.js";

const require = createRequire(import.meta.url);
const mime = require("mime");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4515);

const _setcors = (res) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
};

const _serveStatic = (req, res) => {
	const urlPath = req.url.split("?")[0].split("#")[0];
	const decoded = decodeURIComponent(urlPath);
	const filePath = path.normalize(path.join(ROOT, decoded));

	// Prevent path traversal
	if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
		res.writeHead(403);
		res.end("Forbidden");
		return;
	}

	let resolved = filePath;
	try {
		const stat = fs.statSync(resolved);
		if (stat.isDirectory()) resolved = path.join(resolved, "index.html");
	} catch {
		res.writeHead(404);
		res.end("Not Found");
		return;
	}

	if (!fs.existsSync(resolved)) {
		res.writeHead(404);
		res.end("Not Found");
		return;
	}

	const contentType = mime.lookup(resolved) || "application/octet-stream";
	_setcors(res);
	res.writeHead(200, {"Content-Type": contentType});
	fs.createReadStream(resolved).pipe(res);
};

const server = http.createServer(async (req, res) => {
	if (req.method === "OPTIONS") {
		_setcors(res);
		res.writeHead(204);
		res.end();
		return;
	}

	const urlPath = (req.url || "/").split("?")[0];

	if (urlPath === "/api/chat") {
		try {
			await chatHandler(req, res);
		} catch (e) {
			res.setHeader("Content-Type", "application/json; charset=utf-8");
			_setcors(res);
			res.writeHead(500);
			res.end(JSON.stringify({ok: false, error: e?.message || "Unexpected error."}));
		}
		return;
	}

	_serveStatic(req, res);
});

server.listen(PORT, () => {
	process.stdout.write(`[5etools] Serving on http://localhost:${PORT}\n`);
	process.stdout.write(`[5etools] POST /api/chat → rules-bot (BLACKBOX_API_KEY: ${process.env.BLACKBOX_API_KEY ? "set" : "missing"})\n`);
});
