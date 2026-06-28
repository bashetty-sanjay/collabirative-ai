import { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import SettingsModal from './components/SettingsModal';
import AuthPage from './components/AuthPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { api, setTokenGetter } from './api';
import './App.css';

// ── Inner app (requires auth) ─────────────────────────────────────────────────

function AppInner() {
  const { currentUser, userSettings, getIdToken, signOut, refreshSettings } = useAuth();

  const [conversations, setConversations]             = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading]                     = useState(false);
  const [isSettingsOpen, setIsSettingsOpen]           = useState(false);
  const skipNextLoadRef = useRef(false);

  // Derive config from Firestore settings (loaded by AuthContext)
  const [appConfig, setAppConfig] = useState(null);

  // Inject token getter into api module
  useEffect(() => {
    setTokenGetter(getIdToken);
  }, [getIdToken]);

  // Sync config from userSettings when they load
  useEffect(() => {
    if (userSettings) {
      if (userSettings.council_models?.length > 0 && userSettings.master_model) {
        setAppConfig(userSettings);
      } else {
        // First time user — open settings
        setIsSettingsOpen(true);
      }
    }
  }, [userSettings]);

  // Load conversations for this user on mount
  useEffect(() => {
    if (currentUser) loadConversations();
  }, [currentUser]);

  // Load conversation details when selected
  useEffect(() => {
    if (currentConversationId) {
      if (skipNextLoadRef.current) { skipNextLoadRef.current = false; return; }
      loadConversation(currentConversationId);
    }
  }, [currentConversationId]);

  const hasValidConfig = appConfig?.council_models?.length > 0 && appConfig?.master_model;

  const loadConversations = async () => {
    try { setConversations(await api.listConversations()); }
    catch (e) { console.error('Failed to load conversations:', e); }
  };

  const loadConversation = async (id) => {
    try { setCurrentConversation(await api.getConversation(id)); }
    catch (e) { console.error('Failed to load conversation:', e); }
  };

  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setCurrentConversation(null);
  };

  const handleSelectConversation = (id) => setCurrentConversationId(id);

  const handleDeleteConversation = async (id) => {
    try {
      await api.deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setCurrentConversation(null);
      }
    } catch (e) { console.error('Failed to delete conversation:', e); }
  };

  const handleSaveSettings = async (config) => {
    setAppConfig(config);
    try {
      await api.saveUserSettings(config);
      await refreshSettings();
    } catch (e) {
      console.error('Failed to save settings to cloud:', e);
    }
  };

  const handleSendMessage = async (content) => {
    if (!hasValidConfig) return;
    setIsLoading(true);
    try {
      let convId = currentConversationId;
      if (!convId) {
        const newConv = await api.createConversation();
        convId = newConv.id;
        setConversations(prev => [{ id: newConv.id, created_at: newConv.created_at, message_count: 0 }, ...prev]);
        skipNextLoadRef.current = true;
        setCurrentConversationId(convId);
        setCurrentConversation({ ...newConv, messages: [] });
      }

      const userMessage = { role: 'user', content };
      setCurrentConversation(prev => ({ ...prev, messages: [...prev.messages, userMessage] }));

      const assistantMessage = {
        role: 'assistant', stage1: null, stage2: null, stage3: null, metadata: null,
        loading: { stage1: false, stage2: false, stage3: false },
      };
      setCurrentConversation(prev => ({ ...prev, messages: [...prev.messages, assistantMessage] }));

      await api.sendMessageStream(convId, content, appConfig, (eventType, event) => {
        const update = (updater) => setCurrentConversation(prev => {
          const messages = [...prev.messages];
          messages[messages.length - 1] = updater({ ...messages[messages.length - 1] });
          return { ...prev, messages };
        });

        switch (eventType) {
          case 'stage1_start':    update(m => ({ ...m, loading: { ...m.loading, stage1: true } })); break;
          case 'stage1_complete': update(m => ({ ...m, stage1: event.data, loading: { ...m.loading, stage1: false } })); break;
          case 'stage2_start':    update(m => ({ ...m, loading: { ...m.loading, stage2: true } })); break;
          case 'stage2_complete': update(m => ({ ...m, stage2: event.data, metadata: event.metadata, loading: { ...m.loading, stage2: false } })); break;
          case 'stage3_start':    update(m => ({ ...m, loading: { ...m.loading, stage3: true } })); break;
          case 'stage3_complete': update(m => ({ ...m, stage3: event.data, loading: { ...m.loading, stage3: false } })); break;
          case 'title_complete':  loadConversations(); break;
          case 'complete':        loadConversations(); setIsLoading(false); break;
          case 'error':           console.error('Stream error:', event.message); setIsLoading(false); break;
          default: break;
        }
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setCurrentConversation(prev => ({ ...prev, messages: prev.messages.slice(0, -2) }));
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onOpenSettings={() => setIsSettingsOpen(true)}
        currentUser={currentUser}
        onSignOut={signOut}
      />
      <ChatInterface
        conversation={currentConversation}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
      />
      {!hasValidConfig && (
        <div className="chat-interface-placeholder" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#a0a0b0', background: 'var(--bg-primary, #0f0f17)', zIndex: 10 }}>
          <h2>Configuration Required</h2>
          <p>Please open settings and configure your API keys and models.</p>
          <button style={{ marginTop: '20px', padding: '10px 20px', background: '#22d3ee', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={() => setIsSettingsOpen(true)}>Open Settings</button>
        </div>
      )}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialConfig={appConfig}
        onSave={handleSaveSettings}
      />
    </div>
  );
}

// ── Root with auth routing ────────────────────────────────────────────────────

function AppRoot() {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a14' }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🤝</div>
          <div style={{ fontSize: 14 }}>Loading...</div>
        </div>
      </div>
    );
  }

  return currentUser ? <AppInner /> : <AuthPage />;
}

// ── Export wrapped with AuthProvider ─────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <AppRoot />
    </AuthProvider>
  );
}
