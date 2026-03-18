"use strict";

class AiRulesChatPage {
	static _STORAGE_KEY_ENDPOINT = "aiRulesChat.endpoint";
	static _STORAGE_KEY_SESSION = "aiRulesChat.sessionId";

	static _isPending = false;
	static _sessionId = null;
	static _endpoint = null;

	static _eles = {
		iptEndpoint: null,
		btnNewSession: null,
		wrpStatus: null,
		wrpMessages: null,
		iptQuestion: null,
		btnSend: null,
	};

	static pInit () {
		this._eles.iptEndpoint = document.getElementById("ai-chat-endpoint");
		this._eles.btnNewSession = document.getElementById("ai-chat-new-session");
		this._eles.wrpStatus = document.getElementById("ai-chat-status");
		this._eles.wrpMessages = document.getElementById("ai-chat-messages");
		this._eles.iptQuestion = document.getElementById("ai-chat-input");
		this._eles.btnSend = document.getElementById("ai-chat-send");

		this._sessionId = this._storageGet(this._STORAGE_KEY_SESSION) || null;
		this._endpoint = this._storageGet(this._STORAGE_KEY_ENDPOINT) || this._getDefaultEndpoint();

		if (this._eles.iptEndpoint) this._eles.iptEndpoint.value = this._endpoint;

		this._bindUi();
		this._addSystemMessage(`This page calls your local Rules Bot API and displays source citations for every answer.`);
		this._setStatus(this._sessionId ? `Session resumed.` : `Ready.`);
		window.dispatchEvent(new Event("toolsLoaded"));
	}

	static _bindUi () {
		if (this._eles.iptEndpoint) this._eles.iptEndpoint.addEventListener("change", () => this._handleEndpointChange());
		this._eles.btnNewSession.addEventListener("click", () => this._handleNewSession());
		this._eles.btnSend.addEventListener("click", () => this._pHandleSend().then(null));
		this._eles.iptQuestion.addEventListener("keydown", evt => {
			if (evt.key !== "Enter" || evt.shiftKey) return;
			evt.preventDefault();
			this._pHandleSend().then(null);
		});
	}

	static _getDefaultEndpoint () {
		const host = location.hostname || "localhost";
		const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
		if (!isLocal) return "/api/chat";
		const protocol = location.protocol === "https:" ? "https:" : "http:";
		return `${protocol}//${host}:4516/api/chat`;
	}

	static _handleEndpointChange () {
		if (!this._eles.iptEndpoint) return;
		const endpoint = this._eles.iptEndpoint.value.trim();
		this._endpoint = endpoint;
		this._storageSet(this._STORAGE_KEY_ENDPOINT, endpoint);
		this._setStatus(`Endpoint saved.`);
	}

	static _handleNewSession () {
		this._sessionId = null;
		this._storageRemove(this._STORAGE_KEY_SESSION);
		this._addSystemMessage(`New session started.`);
		this._setStatus(`Session reset.`);
	}

	static async _pHandleSend () {
		if (this._isPending) return;

		const question = this._eles.iptQuestion.value.trim();
		if (!question) return;

		const endpoint = this._eles.iptEndpoint?.value.trim() || this._endpoint || this._getDefaultEndpoint();
		if (!endpoint) {
			this._setStatus(`Set a valid API endpoint first.`, true);
			return;
		}

		this._isPending = true;
		this._eles.btnSend.disabled = true;
		this._eles.btnSend.textContent = "Sending...";

		this._eles.iptQuestion.value = "";
		this._addMessage({
			role: "user",
			text: question,
		});
		this._setStatus("Waiting for response...");

		try {
			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					question,
					sessionId: this._sessionId || undefined,
				}),
			});

			const payload = await this._pGetResponsePayload(response);

			if (!response.ok || !payload?.ok) {
				throw new Error(payload?.error || `Request failed with status ${response.status}.`);
			}

			this._sessionId = payload.sessionId || this._sessionId;
			if (this._sessionId) this._storageSet(this._STORAGE_KEY_SESSION, this._sessionId);

			this._addMessage({
				role: "assistant",
				text: payload.answer || "",
				citations: payload.citations || [],
			});
			this._setStatus(`Response ready.`);
		} catch (e) {
			this._addSystemMessage(`Error: ${e.message}`);
			this._setStatus(`Request failed.`, true);
		} finally {
			this._isPending = false;
			this._eles.btnSend.disabled = false;
			this._eles.btnSend.textContent = "Send";
			this._eles.iptQuestion.focus();
		}
	}

	static async _pGetResponsePayload (response) {
		const raw = await response.text();
		if (!raw.trim()) {
			return {
				ok: false,
				error: `Empty response from API (HTTP ${response.status}) at "${response.url}".`,
			};
		}

		try {
			return JSON.parse(raw);
		} catch (_e) {
			const contentType = response.headers.get("content-type") || "unknown";
			const rawPreview = raw.replace(/\s+/g, " ").trim().slice(0, 160);
			const gatewayHint = response.status >= 502 && response.status <= 504
				? " Upstream chat service is unavailable or returned a proxy error."
				: "";
			return {
				ok: false,
				error: `Invalid JSON response from API (HTTP ${response.status}) at "${response.url}".${gatewayHint} Response content-type: ${contentType}.${rawPreview ? ` Response starts: ${JSON.stringify(rawPreview)}.` : ""}`,
			};
		}
	}

	static _setStatus (text, isError = false) {
		this._eles.wrpStatus.textContent = text;
		this._eles.wrpStatus.classList.toggle("ve-text-danger", !!isError);
	}

	static _storageGet (key) {
		try {
			return localStorage.getItem(key);
		} catch (_e) {
			return null;
		}
	}

	static _storageSet (key, value) {
		try {
			localStorage.setItem(key, value);
		} catch (_e) {
			// Ignore storage errors.
		}
	}

	static _storageRemove (key) {
		try {
			localStorage.removeItem(key);
		} catch (_e) {
			// Ignore storage errors.
		}
	}

	static _addSystemMessage (text) {
		this._addMessage({
			role: "system",
			text,
		});
	}

	static _addMessage ({role, text, citations = null}) {
		const row = document.createElement("div");
		row.className = `pg-ai-chat__msg pg-ai-chat__msg--${role}`;

		const bubble = document.createElement("div");
		bubble.className = "pg-ai-chat__bubble";
		bubble.textContent = text;
		row.appendChild(bubble);

		if (citations?.length) {
			bubble.appendChild(this._getCitationBlock(citations));
		}

		this._eles.wrpMessages.appendChild(row);
		this._eles.wrpMessages.scrollTop = this._eles.wrpMessages.scrollHeight;
	}

	static _getCitationBlock (citations) {
		const wrp = document.createElement("div");
		wrp.className = "pg-ai-chat__citations";

		const title = document.createElement("div");
		title.className = "pg-ai-chat__citations-title";
		title.textContent = "Sources";
		wrp.appendChild(title);

		const ul = document.createElement("ul");
		citations.forEach(citation => {
			const li = document.createElement("li");

			const link = document.createElement("a");
			link.textContent = `[${citation.id}] ${citation.name} (${citation.source}${citation.page != null ? ` p.${citation.page}` : ""})`;
			link.href = citation.url || "#";
			link.target = "_blank";
			link.rel = "noopener noreferrer";

			li.appendChild(link);
			ul.appendChild(li);
		});

		wrp.appendChild(ul);
		return wrp;
	}
}

window.addEventListener("load", () => {
	AiRulesChatPage.pInit();
});
