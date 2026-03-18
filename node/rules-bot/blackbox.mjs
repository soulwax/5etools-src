const _DEFAULT_MODEL = process.env.BLACKBOX_MODEL || "gpt-4.1-mini";

const _SYSTEM_PROMPT = `
You are a D&D 5e rules assistant.
Use only the provided context snippets to answer.
If the context is insufficient or conflicting, say so clearly.
Do not invent rules, numbers, or source claims.
Include source citations inline using [n] matching the provided context IDs.
`.trim();

export const pGetBlackboxAnswer = async (
	{
		apiKey,
		question,
		contexts,
		history = [],
		model = _DEFAULT_MODEL,
	},
) => {
	if (!apiKey) throw new Error(`Missing BLACKBOX_API_KEY.`);

	const contextText = contexts.length
		? contexts
			.map(ctx => {
				const ptPage = ctx.page == null ? "" : ` p.${ctx.page}`;
				return `[${ctx.id}] ${ctx.name} (${ctx.source}${ptPage})\n${ctx.snippet}`;
			})
			.join("\n\n")
		: "[0] No matching local context was found.";

	const userPrompt = `Question:\n${question.trim()}\n\nContext snippets:\n${contextText}\n\nAnswer requirements:\n- Use only the context.\n- Be explicit about uncertainty.\n- Cite statements with [n].\n- Keep answer concise and practical.`;

	const messages = [
		{role: "system", content: _SYSTEM_PROMPT},
		...history.map(msg => ({
			role: msg.role === "assistant" ? "assistant" : "user",
			content: msg.content,
		})),
		{role: "user", content: userPrompt},
	];

	const response = await fetch("https://api.blackbox.ai/chat/completions", {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model,
			messages,
			temperature: 0.1,
			max_tokens: 900,
			stream: false,
		}),
	});

	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(payload?.error?.message || `Blackbox request failed with status ${response.status}.`);
	}

	const text = payload?.choices?.[0]?.message?.content?.trim();
	if (!text) throw new Error(`Blackbox returned an empty response.`);

	return {
		text,
		model: payload?.model || model,
	};
};
