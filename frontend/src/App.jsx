import { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE = "http://localhost:8000";

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hintCount, setHintCount] = useState(0);
  const [resolved, setResolved] = useState(false);
  const [latestSources, setLatestSources] = useState([]);
  const [indexReady, setIndexReady] = useState(null);
  const [expandedSources, setExpandedSources] = useState({});

  const chatEndRef = useRef(null);

  // Check health and start session on load
  useEffect(() => {
    checkHealth();
    startNewSession();
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      const data = await res.json();
      setIndexReady(data.index_ready);
    } catch {
      setIndexReady(false);
    }
  };

  const startNewSession = async () => {
    try {
      const res = await fetch(`${API_BASE}/session/new`, { method: 'POST' });
      const data = await res.json();
      setSessionId(data.session_id);
      setMessages([]);
      setHintCount(0);
      setResolved(false);
      setLatestSources([]);
    } catch (err) {
      console.error("Failed to initialize session:", err);
    }
  };

  const handleSend = async (messageText = input) => {
    const textToSend = messageText.trim();
    if (!textToSend || loading) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: textToSend,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (messageText === input) setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          message: textToSend,
        }),
      });

      if (!res.ok) throw new Error("API server returned error");

      const data = await res.json();

      const tutorMsg = {
        id: Date.now() + 1,
        sender: 'tutor',
        text: data.reply,
        sources: data.sources || [],
        hintCount: data.hint_count,
        resolved: data.resolved,
        status: data.status,
      };

      setMessages((prev) => [...prev, tutorMsg]);
      setSessionId(data.session_id);
      setHintCount(data.hint_count);
      setResolved(data.resolved);
      if (data.sources && data.sources.length > 0) {
        setLatestSources(data.sources);
      }
    } catch (err) {
      console.error("Failed to fetch response:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'tutor',
          text: "⚠️ Connection error: Make sure the FastAPI backend is running at http://localhost:8000.",
          status: 'error',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleSources = (msgId) => {
    setExpandedSources((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const starterPrompts = [
    { title: "Socratic Method 🧠", prompt: "Explain how Socratic tutoring works and test me on a fundamental concept." },
    { title: "Machine Learning 📊", prompt: "Can you explain overfitting and how we detect it?" },
    { title: "Neural Networks ⚡", prompt: "Why do we need activation functions in deep learning?" },
    { title: "RAG & Grounding 🔍", prompt: "How does vector retrieval ensure grounded answers?" },
  ];

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="logo-badge">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 className="brand-title">
              Edu-RAG Tutor
            </h1>
            <p className="brand-subtitle">Gemini 2.5 Flash • Context Grounded • Interactive Learning</p>
          </div>
        </div>

        <div className="header-actions">
          {indexReady !== null && (
            <div className={`status-pill ${indexReady ? '' : 'offline'}`}>
              <span className="status-dot"></span>
              {indexReady ? 'RAG Index Active' : 'Vector DB Disconnected'}
            </div>
          )}

          <button className="btn-secondary" onClick={startNewSession} title="Start fresh session">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            Reset Session
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="main-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          {/* Session Progress Card */}
          <div className="panel-card fade-in">
            <div className="panel-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              Session State
            </div>

            <div className="hint-meter">
              <div className="hint-dots">
                {[1, 2, 3, 4].map((step) => {
                  const isFilled = step <= hintCount;
                  return (
                    <div
                      key={step}
                      className={`hint-dot ${resolved ? 'resolved' : isFilled ? 'active' : ''}`}
                    />
                  );
                })}
              </div>

              <div className="hint-status-text">
                <span>Hints Used: <strong>{hintCount} / 4</strong></span>
                {resolved ? (
                  <span className="badge badge-green">🎉 Resolved</span>
                ) : hintCount > 0 ? (
                  <span className="badge badge-purple">Guiding</span>
                ) : (
                  <span className="badge badge-amber">New Question</span>
                )}
              </div>
            </div>
          </div>

          {/* RAG Grounding Sources Panel */}
          <div className="panel-card fade-in">
            <div className="panel-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              Course Material Cited
            </div>

            {latestSources.length > 0 ? (
              <div className="sources-list">
                {latestSources.map((sourceStr, idx) => (
                  <div key={idx} className="source-item">
                    <div className="source-title">📄 {sourceStr}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-sources">
                Ask a question to see retrieved course context from Chroma DB.
              </p>
            )}
          </div>

          {/* Socratic Principles Card */}
          <div className="panel-card fade-in">
            <div className="panel-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
                <path d="M9 21h6" />
              </svg>
              How It Works
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              The tutor will <strong>never give you direct answers upfront</strong>. Instead, it asks targeted questions grounded in course material to help you discover the answer yourself!
            </p>
          </div>
        </aside>

        {/* Main Chat Workspace */}
        <main className="chat-section">
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="empty-state fade-in">
                <div className="empty-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h2 className="empty-title">Ready to Learn Socratically?</h2>
                <p className="empty-subtitle">
                  Select a starter topic below or type any question from your course notes.
                </p>

                <div className="prompts-grid">
                  {starterPrompts.map((item, idx) => (
                    <button
                      key={idx}
                      className="prompt-card"
                      onClick={() => handleSend(item.prompt)}
                    >
                      <strong style={{ display: 'block', marginBottom: '4px' }}>{item.title}</strong>
                      {item.prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`message-wrapper ${msg.sender} fade-in`}>
                  <div className={`avatar ${msg.sender}`}>
                    {msg.sender === 'user' ? 'You' : 'AI'}
                  </div>

                  <div className="bubble">
                    {msg.sender === 'tutor' && (
                      <div className="bubble-meta">
                        {msg.resolved ? (
                          <span className="badge badge-green">🎯 Concept Solved</span>
                        ) : msg.status === 'stuck' ? (
                          <span className="badge badge-amber">🤔 Simplifying Hint</span>
                        ) : (
                          <span className="badge badge-purple">💡 Hint #{msg.hintCount || 1}</span>
                        )}
                      </div>
                    )}

                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>

                    {msg.sender === 'tutor' && msg.sources && msg.sources.length > 0 && (
                      <div className="message-sources">
                        <button
                          className="sources-toggle"
                          onClick={() => toggleSources(msg.id)}
                        >
                          {expandedSources[msg.id] ? '▼ Hide Grounds' : `▶ View Grounding Sources (${msg.sources.length})`}
                        </button>

                        {expandedSources[msg.id] && (
                          <div className="sources-list" style={{ marginTop: '8px' }}>
                            {msg.sources.map((s, i) => (
                              <div key={i} className="source-item">
                                📌 {s}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="message-wrapper tutor fade-in">
                <div className="avatar tutor">AI</div>
                <div className="typing-indicator">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                    Consulting course context & formulating question...
                  </span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Floating Input Container */}
          <div className="input-container">
            <div className="input-row">
              <textarea
                className="chat-input"
                rows={1}
                placeholder="Answer the tutor's question or ask about a concept..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />

              <button
                className="btn-send"
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                title="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>

            <div className="input-footer-hints">
              <span>Press <strong>Enter</strong> to send • <strong>Shift+Enter</strong> for newline</span>
              {messages.length > 0 && !resolved && (
                <button
                  className="btn-quick-stuck"
                  onClick={() => handleSend("I'm not sure, could you give me a smaller hint or simpler example?")}
                >
                  Need a simpler hint?
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
