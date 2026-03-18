import fs from "fs";
import path from "path";

const _RE_ENV_LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/;

const _parseValue = (rawValue) => {
	if (!rawValue) return "";

	let out = rawValue.trim();

	if (out.startsWith(`"`)) {
		const match = out.match(/^"((?:\\.|[^"])*)"/);
		if (!match) return out.slice(1);
		return match[1]
			.replace(/\\n/g, "\n")
			.replace(/\\"/g, `"`)
			.replace(/\\\\/g, "\\");
	}

	if (out.startsWith(`'`)) {
		const match = out.match(/^'((?:\\.|[^'])*)'/);
		if (!match) return out.slice(1);
		return match[1]
			.replace(/\\n/g, "\n")
			.replace(/\\'/g, `'`)
			.replace(/\\\\/g, "\\");
	}

	const hashIx = out.indexOf("#");
	if (hashIx >= 0) out = out.slice(0, hashIx).trim();

	return out;
};

const _loadEnvFile = (filePath) => {
	if (!fs.existsSync(filePath)) return;

	const lines = fs.readFileSync(filePath, "utf8")
		.replace(/^\uFEFF/, "")
		.split(/\r?\n/g);

	lines.forEach(line => {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) return;

		const match = line.match(_RE_ENV_LINE);
		if (!match) return;

		const [, key, rawValue] = match;
		if (process.env[key] !== undefined) return;
		process.env[key] = _parseValue(rawValue);
	});
};

export const loadLocalEnvFiles = ({rootDir = process.cwd()} = {}) => {
	_loadEnvFile(path.join(rootDir, ".env"));
	_loadEnvFile(path.join(rootDir, ".env.local"));
};
