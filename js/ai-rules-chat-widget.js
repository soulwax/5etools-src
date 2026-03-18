"use strict";

class AiChatWidget {
	static _STORAGE_KEY_ENDPOINT = "aiRulesChat.endpoint";
	static _STORAGE_KEY_SESSION = "aiRulesChat.sessionId";
	static _STORAGE_KEY_OPEN = "aiRulesChat.widgetOpen";

	static _isPending = false;
	static _sessionId = null;
	static _endpoint = null;

	static _eles = {
		widget: null,
		toggle: null,
		panel: null,
		status: null,
		messages: null,
		input: null,
		send: null,
		newSession: null,
		close: null,
	};

	static _STYLE_ID_FORCE_LARGE = "ai-chat-widget-force-large-style";

	static init () {
		this._endpoint = this._storageGet(this._STORAGE_KEY_ENDPOINT) || this._getDefaultEndpoint();
		this._sessionId = this._storageGet(this._STORAGE_KEY_SESSION) || null;

		this._injectForceLargeStyles();
		this._render();
		this._bindUi();
		this._addSystemMessage("Ask any D&D 5e rules question.");

		if (this._storageGet(this._STORAGE_KEY_OPEN) === "1") this._openPanel();
	}

	static _getDefaultEndpoint () {
		const host = location.hostname || "localhost";
		const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
		if (!isLocal) return "/api/chat";
		const protocol = location.protocol === "https:" ? "https:" : "http:";
		return `${protocol}//${host}:4516/api/chat`;
	}

	static _render () {
		const widget = document.createElement("div");
		widget.className = "ai-chat-widget";
		widget.innerHTML = `
			<div class="ai-chat-widget__panel" id="ai-chat-widget-panel" hidden>
				<div class="ai-chat-widget__header">
					<span>AI Rules Chat</span>
					<div class="ai-chat-widget__header-actions">
						<a href="ai-rules-chat.html" title="Open full chat page" target="_blank" rel="noopener noreferrer">&#8599;</a>
						<button class="ai-chat-widget__new-session" id="ai-chat-widget-new-session" title="New session">&#8635;</button>
						<button class="ai-chat-widget__close" id="ai-chat-widget-close" title="Close">&times;</button>
					</div>
				</div>
				<div class="ai-chat-widget__status" id="ai-chat-widget-status">Ready.</div>
				<div class="ai-chat-widget__messages" id="ai-chat-widget-messages" aria-live="polite"></div>
				<div class="ai-chat-widget__composer">
					<label class="sr-only" for="ai-chat-widget-input">Ask a rules question</label>
					<textarea class="ai-chat-widget__input" id="ai-chat-widget-input" rows="2" placeholder="Ask a rules question..."></textarea>
					<button class="ve-btn ve-btn-primary ve-btn-sm ai-chat-widget__send" id="ai-chat-widget-send">Send</button>
				</div>
			</div>
			<button class="ai-chat-widget__toggle" id="ai-chat-widget-toggle" title="AI Rules Chat (D&D 5e)" aria-label="Open AI Rules Chat">
				<span class="fal fa-comments"></span>
			</button>
		`;

		document.body.appendChild(widget);

		this._eles.widget = widget;
		this._eles.toggle = widget.querySelector("#ai-chat-widget-toggle");
		this._eles.panel = widget.querySelector("#ai-chat-widget-panel");
		this._eles.status = widget.querySelector("#ai-chat-widget-status");
		this._eles.messages = widget.querySelector("#ai-chat-widget-messages");
		this._eles.input = widget.querySelector("#ai-chat-widget-input");
		this._eles.send = widget.querySelector("#ai-chat-widget-send");
		this._eles.newSession = widget.querySelector("#ai-chat-widget-new-session");
		this._eles.close = widget.querySelector("#ai-chat-widget-close");
	}

	static _injectForceLargeStyles () {
		if (document.getElementById(this._STYLE_ID_FORCE_LARGE)) return;

		const eleStyle = document.createElement("style");
		eleStyle.id = this._STYLE_ID_FORCE_LARGE;
		eleStyle.textContent = `
			.ai-chat-widget__panel {
				width: 28.6rem !important;
				height: 33.8rem !important;
			}

			.ai-chat-widget__header {
				font-size: 1.425rem !important;
			}

			.ai-chat-widget__header a {
				font-size: 1.2rem !important;
			}

			.ai-chat-widget__new-session,
			.ai-chat-widget__close {
				font-size: 1.5rem !important;
			}

			.ai-chat-widget__status {
				font-size: 1.17rem !important;
			}

			.ai-chat-widget__input,
			.ai-chat-widget__bubble {
				font-size: 1.3125rem !important;
			}

			.ai-chat-widget__msg--system .ai-chat-widget__bubble,
			.ai-chat-widget__citations {
				font-size: 1.17rem !important;
			}

			@media (max-width: 480px) {
				.ai-chat-widget__panel {
					height: 28.6rem !important;
				}
			}
		`;

		document.head.appendChild(eleStyle);
	}

	static _bindUi () {
		this._eles.toggle.addEventListener("click", () => this._togglePanel());
		this._eles.close.addEventListener("click", () => this._closePanel());
		this._eles.newSession.addEventListener("click", () => this._handleNewSession());
		this._eles.send.addEventListener("click", () => this._pHandleSend().then(null));
		this._eles.input.addEventListener("keydown", evt => {
			if (evt.key !== "Enter" || evt.shiftKey) return;
			evt.preventDefault();
			this._pHandleSend().then(null);
		});
	}

	static _togglePanel () {
		if (this._eles.panel.hidden) this._openPanel();
		else this._closePanel();
	}

	static _openPanel () {
		this._eles.panel.hidden = false;
		this._eles.toggle.setAttribute("aria-expanded", "true");
		this._storageSet(this._STORAGE_KEY_OPEN, "1");
		this._eles.input.focus();
	}

	static _closePanel () {
		this._eles.panel.hidden = true;
		this._eles.toggle.setAttribute("aria-expanded", "false");
		this._storageRemove(this._STORAGE_KEY_OPEN);
	}

	static _handleNewSession () {
		this._sessionId = null;
		this._storageRemove(this._STORAGE_KEY_SESSION);
		this._eles.messages.innerHTML = "";
		this._addSystemMessage("New session started.");
		this._setStatus("Session reset.");
	}

	static async _pHandleSend () {
		if (this._isPending) return;

		const question = this._eles.input.value.trim();
		if (!question) return;

		this._isPending = true;
		this._eles.send.disabled = true;
		this._eles.send.textContent = "...";
		this._eles.input.value = "";

		this._addMessage({role: "user", text: question});
		this._setStatus("Waiting for response...");

		try {
			const response = await fetch(this._endpoint, {
				method: "POST",
				headers: {"Content-Type": "application/json"},
				body: JSON.stringify({
					question,
					sessionId: this._sessionId || undefined,
				}),
			});

			const payload = await this._pGetResponsePayload(response);

			if (!response.ok || !payload?.ok) {
				throw new Error(payload?.error || `Request failed (${response.status}).`);
			}

			this._sessionId = payload.sessionId || this._sessionId;
			if (this._sessionId) this._storageSet(this._STORAGE_KEY_SESSION, this._sessionId);

			this._addMessage({
				role: "assistant",
				text: payload.answer || "",
				citations: payload.citations || [],
			});
			this._setStatus("Response ready.");
		} catch (e) {
			this._addSystemMessage(`Error: ${e.message}`);
			this._setStatus("Request failed.", true);
		} finally {
			this._isPending = false;
			this._eles.send.disabled = false;
			this._eles.send.textContent = "Send";
			this._eles.input.focus();
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
		this._eles.status.textContent = text;
		this._eles.status.classList.toggle("ai-chat-widget__status--error", !!isError);
	}

	static _addSystemMessage (text) {
		this._addMessage({role: "system", text});
	}

	static _addMessage ({role, text, citations = null}) {
		const row = document.createElement("div");
		row.className = `ai-chat-widget__msg ai-chat-widget__msg--${role}`;

		const bubble = document.createElement("div");
		bubble.className = "ai-chat-widget__bubble";
		bubble.textContent = text;

		if (citations?.length) {
			const cBlock = document.createElement("div");
			cBlock.className = "ai-chat-widget__citations";

			const cTitle = document.createElement("div");
			cTitle.className = "ai-chat-widget__citations-title";
			cTitle.textContent = "Sources";
			cBlock.appendChild(cTitle);

			const ul = document.createElement("ul");
			citations.forEach(c => {
				const li = document.createElement("li");
				const a = document.createElement("a");
				a.textContent = `[${c.id}] ${c.name} (${c.source}${c.page != null ? ` p.${c.page}` : ""})`;
				a.href = c.url || "#";
				a.target = "_blank";
				a.rel = "noopener noreferrer";
				li.appendChild(a);
				ul.appendChild(li);
			});
			cBlock.appendChild(ul);
			bubble.appendChild(cBlock);
		}

		row.appendChild(bubble);
		this._eles.messages.appendChild(row);
		this._eles.messages.scrollTop = this._eles.messages.scrollHeight;
	}

	static _storageGet (key) {
		try { return localStorage.getItem(key); } catch (_e) { return null; }
	}

	static _storageSet (key, value) {
		try { localStorage.setItem(key, value); } catch (_e) { /* ignore */ }
	}

	static _storageRemove (key) {
		try { localStorage.removeItem(key); } catch (_e) { /* ignore */ }
	}
}

if (document.readyState === "complete") AiChatWidget.init();
else window.addEventListener("load", () => AiChatWidget.init());
