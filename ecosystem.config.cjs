module.exports = {
	apps: [
		{
			name: "5etools",
			script: "serve.mjs",
			interpreter: "node",
			env_file: ".env",
			env: {
				PORT: "4515",
			},
			watch: false,
		},
		{
			name: "rules-bot",
			script: "node/rules-bot/server.mjs",
			interpreter: "node",
			env_file: ".env",
			env: {
				RULES_BOT_PORT: "4516",
			},
			watch: false,
		},
	],
};
