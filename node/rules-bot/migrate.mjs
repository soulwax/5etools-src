import {loadLocalEnvFiles} from "./env.mjs";
import {pRunSchemaMigration} from "./db.mjs";

async function pMain () {
	loadLocalEnvFiles();

	const connectionString = process.env.DATABASE_URL_UNPOOLED;
	if (!connectionString) throw new Error(`Missing DATABASE_URL_UNPOOLED.`);

	await pRunSchemaMigration({connectionString});
	console.log(`[rules-bot] Migration complete.`);
}

pMain().catch(e => {
	console.error(`[rules-bot] Migration failed: ${e.stack || e.message}`);
	process.exit(1);
});
