import readline from "readline/promises";
import process from "process";
import {loadLocalEnvFiles} from "./env.mjs";
import {RulesBotService} from "./service.mjs";

const _COMMANDS_EXIT = new Set([
	"exit",
	"quit",
	"q",
]);

async function pMain () {
	loadLocalEnvFiles();

	const service = new RulesBotService();
	await service.pInit();

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	let sessionId;

	console.log(`[rules-bot] Interactive chat ready.`);
	console.log(`[rules-bot] Type "exit" to quit.`);

	while (true) {
		const question = (await rl.question("\nYou > ")).trim();
		if (!question) continue;

		if (_COMMANDS_EXIT.has(question.toLowerCase())) break;

		try {
			const out = await service.pAsk({
				question,
				sessionId,
			});

			sessionId = out.sessionId;

			console.log(`\nBot > ${out.answer}\n`);
			if (out.citations.length) {
				console.log("Sources:");
				out.citations.forEach(citation => {
					const ptPage = citation.page == null ? "" : ` p.${citation.page}`;
					const ptUrl = citation.url ? ` ${citation.url}` : "";
					console.log(`[${citation.id}] ${citation.name} (${citation.source}${ptPage})${ptUrl}`);
				});
			} else {
				console.log("Sources: none retrieved.");
			}
		} catch (e) {
			console.error(`\nError > ${e.message}`);
		}
	}

	await rl.close();
	console.log(`[rules-bot] Closed.`);
}

pMain().catch(e => {
	console.error(`[rules-bot] Fatal: ${e.stack || e.message}`);
	process.exit(1);
});
