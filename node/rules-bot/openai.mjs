const _DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const _SYSTEM_PROMPT = `
You are a D&D 5e rules assistant.
Use only the provided context snippets to answer.
If the context is insufficient or conflicting, say so clearly.
Do not invent rules, numbers, or source claims.
Include source citations inline using [n] matching the provided context IDs.
`;

const _getOutputText = (payload) => {
	if (payload?.output_text?.trim?.()) return payload.output_text.trim();

	const chunks = [];
	(payload?.output || []).forEach(item => {
		(item?.content || []).forEach(part => {
			if (part?.type === "output_text" && part?.text) chunks.push(part.text);
		});
	});

	return chunks.join("\n").trim();
};

export const pGetOpenAiAnswer = async (
	{
		apiKey,
		question,
		contexts,
		history = [],
		model = _DEFAULT_MODEL,
	},
) => {
	if (!apiKey) throw new Error(`Missing OPENAI_API_KEY.`);

	const contextText = contexts.length
		? contexts
			.map(ctx => {
				const ptPage = ctx.page == null ? "" : ` p.${ctx.page}`;
				return `[${ctx.id}] ${ctx.name} (${ctx.source}${ptPage})
${ctx.snippet}`;
			})
			.join("\n\n")
		: "[0] No matching local context was found.";

	const userPrompt = `
Question:
${question.trim()}

Context snippets:
${contextText}

Answer requirements:
- Use only the context.
- Be explicit about uncertainty.
- Cite statements with [n].
- Keep answer concise and practical.
`.trim();

	const input = [
		{
			role: "system",
			content: [
				{
					type: "input_text",
					text: _SYSTEM_PROMPT.trim(),
				},
			],
		},
		...history.map(msg => ({
			role: msg.role === "assistant" ? "assistant" : "user",
			content: [
				{
					type: "input_text",
					text: msg.content,
				},
			],
		})),
		{
			role: "user",
			content: [
				{
					type: "input_text",
					text: userPrompt,
				},
			],
		},
	];

	const response = await fetch("https://api.openai.com/v1/responses", {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model,
			temperature: 0.1,
			max_output_tokens: 900,
			input,
		}),
	});

	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(payload?.error?.message || `OpenAI request failed with status ${response.status}.`);
	}

	const text = _getOutputText(payload);
	if (!text) throw new Error(`OpenAI returned an empty response.`);

	return {
		text,
		model: payload?.model || model,
	};
};
