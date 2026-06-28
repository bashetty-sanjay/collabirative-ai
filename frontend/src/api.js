/**
 * API client for the LLM Council backend.
 * All requests include a Firebase ID token in the Authorization header.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';

// Token getter injected by AuthContext
let _getToken = null;
export function setTokenGetter(fn) { _getToken = fn; }

async function authHeaders() {
  const token = _getToken ? await _getToken() : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const api = {

  // ── User Settings ──────────────────────────────────────────────────────────

  async getUserSettings(token) {
    const response = await fetch(`${API_BASE}/api/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return { keys: {}, council_models: [], master_model: null };
    return response.json();
  },

  async saveUserSettings(settings) {
    const response = await fetch(`${API_BASE}/api/settings`, {
      method: 'PUT',
      headers: await authHeaders(),
      body: JSON.stringify(settings),
    });
    if (!response.ok) throw new Error('Failed to save settings');
    return response.json();
  },

  // ── Conversations ──────────────────────────────────────────────────────────

  async listConversations() {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      headers: await authHeaders(),
    });
    if (!response.ok) throw new Error('Failed to list conversations');
    return response.json();
  },

  async createConversation() {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({}),
    });
    if (!response.ok) throw new Error('Failed to create conversation');
    return response.json();
  },

  async getConversation(conversationId) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
      headers: await authHeaders(),
    });
    if (!response.ok) throw new Error('Failed to get conversation');
    return response.json();
  },

  async deleteConversation(conversationId) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete conversation');
    return response.json();
  },

  // ── Streaming message ──────────────────────────────────────────────────────

  async sendMessageStream(conversationId, content, config, onEvent) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message/stream`,
      {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ content, config }),
      }
    );

    if (!response.ok) throw new Error('Failed to send message');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            onEvent(event.type, event);
          } catch (e) {
            console.error('Failed to parse SSE event:', e);
          }
        }
      }
    }
  },

  // ── Memory ─────────────────────────────────────────────────────────────────

  async getMemory() {
    const response = await fetch(`${API_BASE}/api/memory`, {
      headers: await authHeaders(),
    });
    if (!response.ok) throw new Error('Failed to get memory');
    return response.json();
  },

  async clearMemory() {
    const response = await fetch(`${API_BASE}/api/memory`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    if (!response.ok) throw new Error('Failed to clear memory');
    return response.json();
  },
};
