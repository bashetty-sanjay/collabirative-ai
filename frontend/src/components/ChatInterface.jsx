import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Stage1 from './Stage1';
import Stage2 from './Stage2';
import Stage3 from './Stage3';
import './ChatInterface.css';

const SUGGESTIONS = [
  'Compare quantum computing approaches',
  'Explain the trolley problem',
  'Best practices for REST APIs',
  'Pros and cons of microservices',
];

export default function ChatInterface({ conversation, onSendMessage, isLoading }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }
  };

  const handleSuggestion = (text) => {
    if (!isLoading) onSendMessage(text);
  };

  if (!conversation) {
    return (
      <div className="chat-interface">
        <div className="messages-container">
          <div className="empty-state">
            <div className="empty-state-logo">🤝</div>
            <h2>Collaborative AI</h2>
            <p>A council of AI models that debate and synthesize the best answer — together.</p>
            <div className="empty-suggestions">
              {SUGGESTIONS.map(s => (
                <button key={s} className="suggestion-chip" onClick={() => handleSuggestion(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="input-area">
          <form className="input-form" onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              className="message-input"
              placeholder="Create a new conversation first..."
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={1}
            />
            <button type="submit" className="send-button" disabled={!input.trim() || isLoading}>Send</button>
          </form>
          <p className="input-hint">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      <div className="messages-container">
        <div className="messages-inner">
          {conversation.messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-logo">🏛</div>
              <h2>Council is ready</h2>
              <p>Ask anything — multiple AI models will answer, debate, and synthesize the best response.</p>
              <div className="empty-suggestions">
                {SUGGESTIONS.map(s => (
                  <button key={s} className="suggestion-chip" onClick={() => handleSuggestion(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            conversation.messages.map((msg, index) => (
              <div key={index} className="message-group">
                {msg.role === 'user' ? (
                  <div className="user-message">
                    <span className="message-label">You</span>
                    <div className="user-bubble">
                      <div className="markdown-content"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                    </div>
                  </div>
                ) : (
                  <div className="assistant-message">
                    <div className="assistant-label">
                      <span className="assistant-avatar">🤝</span>
                      Collaborative AI
                    </div>

                    {/* Stage 1 */}
                    {msg.loading?.stage1 && (
                      <div className="stage-loading">
                        <span className="stage-spinner" />
                        Collecting individual responses…
                      </div>
                    )}
                    {msg.stage1 && <Stage1 responses={msg.stage1} />}

                    {/* Stage 2 */}
                    {msg.loading?.stage2 && (
                      <div className="stage-loading">
                        <span className="stage-spinner" />
                        Running peer rankings…
                      </div>
                    )}
                    {msg.stage2 && (
                      <Stage2
                        rankings={msg.stage2}
                        labelToModel={msg.metadata?.label_to_model}
                        aggregateRankings={msg.metadata?.aggregate_rankings}
                      />
                    )}

                    {/* Stage 3 */}
                    {msg.loading?.stage3 && (
                      <div className="stage-loading">
                        <span className="stage-spinner" />
                        Synthesizing final answer…
                      </div>
                    )}
                    {msg.stage3 && <Stage3 finalResponse={msg.stage3} />}
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="stage-loading" style={{ marginTop: 8 }}>
              <span className="stage-spinner" />
              Consulting the council…
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="input-area">
        <form className="input-form" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            className="message-input"
            placeholder="Ask your question…"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
          />
          <button type="submit" className="send-button" disabled={!input.trim() || isLoading}>
            Send ↑
          </button>
        </form>
        <p className="input-hint">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
