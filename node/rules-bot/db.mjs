import {spawn} from "child_process";

const _SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ai_rules_bot_sessions (
	id TEXT PRIMARY KEY,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_rules_bot_messages (
	id BIGSERIAL PRIMARY KEY,
	session_id TEXT NOT NULL REFERENCES ai_rules_bot_sessions(id) ON DELETE CASCADE,
	role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
	content TEXT NOT NULL,
	citations JSONB,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_rules_bot_messages__session_id_created_at
	ON ai_rules_bot_messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS ai_rules_bot_query_logs (
	id BIGSERIAL PRIMARY KEY,
	session_id TEXT REFERENCES ai_rules_bot_sessions(id) ON DELETE SET NULL,
	question TEXT NOT NULL,
	contexts JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_rules_bot_query_logs__session_id_created_at
	ON ai_rules_bot_query_logs(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_rules_bot_query_logs__created_at
	ON ai_rules_bot_query_logs(created_at);
`;

const _sqlQuote = (value) => {
	if (value == null) return "NULL";
	return `'${`${value}`.replace(/'/g, "''")}'`;
};

const _sqlJson = (value) => {
	if (value == null) return "NULL";
	return `${_sqlQuote(JSON.stringify(value))}::jsonb`;
};

const _pRunPsql = ({connectionString, sql, isRead = false}) => {
	return new Promise((resolve, reject) => {
		const args = [
			"-X",
			"-v", "ON_ERROR_STOP=1",
		];

		if (isRead) args.unshift("-A", "-t", "-F", "\t");
		args.push(connectionString);

		const proc = spawn("psql", args, {
			env: process.env,
		});

		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", chunk => stdout += `${chunk}`);
		proc.stderr.on("data", chunk => stderr += `${chunk}`);

		proc.on("error", reject);
		proc.on("close", code => {
			if (code !== 0) {
				const msg = stderr.trim() || stdout.trim() || `psql exited with code ${code}`;
				reject(new Error(msg));
				return;
			}

			resolve(stdout.trim());
		});

		proc.stdin.write(`${sql}\n`);
		proc.stdin.end();
	});
};

export const pRunSchemaMigration = async ({connectionString}) => {
	if (!connectionString) throw new Error(`Missing connection string for migration.`);
	await _pRunPsql({
		connectionString,
		sql: _SCHEMA_SQL,
	});
};

export class RulesBotDb {
	constructor ({connectionString = process.env.DATABASE_URL} = {}) {
		this._connectionString = connectionString;
		this._isEnabled = !!connectionString;
	}

	get isEnabled () {
		return this._isEnabled;
	}

	async pInit () {
		if (!this._isEnabled) return;

		try {
			await pRunSchemaMigration({connectionString: this._connectionString});
		} catch (e) {
			this._isEnabled = false;
			console.warn(`[rules-bot] Database disabled: ${e.message}`);
		}
	}

	async pEnsureSession ({sessionId}) {
		if (!this._isEnabled) return;
		await this._pWrite(`
INSERT INTO ai_rules_bot_sessions (id, updated_at)
VALUES (${_sqlQuote(sessionId)}, NOW())
ON CONFLICT (id)
DO UPDATE SET updated_at = EXCLUDED.updated_at;
`);
	}

	async pInsertMessage ({sessionId, role, content, citations = null}) {
		if (!this._isEnabled) return;
		await this._pWrite(`
INSERT INTO ai_rules_bot_messages (session_id, role, content, citations)
VALUES (
	${_sqlQuote(sessionId)},
	${_sqlQuote(role)},
	${_sqlQuote(content)},
	${_sqlJson(citations)}
);
UPDATE ai_rules_bot_sessions
SET updated_at = NOW()
WHERE id = ${_sqlQuote(sessionId)};
`);
	}

	async pInsertQueryLog ({sessionId, question, contexts}) {
		if (!this._isEnabled) return;
		await this._pWrite(`
INSERT INTO ai_rules_bot_query_logs (session_id, question, contexts)
VALUES (
	${_sqlQuote(sessionId)},
	${_sqlQuote(question)},
	${_sqlJson(contexts || [])}
);
`);
	}

	async pGetRecentMessages ({sessionId, limit = 6}) {
		if (!this._isEnabled) return [];

		const safeLimit = Math.max(0, Math.min(20, Number(limit) || 0));
		if (!safeLimit) return [];

		const raw = await this._pRead(`
SELECT
	role,
	encode(convert_to(content, 'UTF8'), 'base64') AS content_b64
FROM ai_rules_bot_messages
WHERE session_id = ${_sqlQuote(sessionId)}
ORDER BY id DESC
LIMIT ${safeLimit};
`);

		if (!raw) return [];

		return raw
			.split("\n")
			.filter(Boolean)
			.map(line => {
				const [role, contentB64] = line.split("\t");
				if (!role || !contentB64) return null;
				return {
					role: role.trim(),
					content: Buffer.from(contentB64.trim(), "base64").toString("utf8"),
				};
			})
			.filter(Boolean)
			.reverse();
	}

	async _pRead (sql) {
		if (!this._isEnabled) return "";
		return _pRunPsql({
			connectionString: this._connectionString,
			sql,
			isRead: true,
		});
	}

	async _pWrite (sql) {
		if (!this._isEnabled) return;
		await _pRunPsql({
			connectionString: this._connectionString,
			sql,
			isRead: false,
		});
	}
}
