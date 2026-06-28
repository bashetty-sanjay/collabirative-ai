import React, { useState, useEffect } from 'react';
import './SettingsModal.css';

const PROVIDERS = [
  {
    key: 'groq',
    label: 'Groq',
    placeholder: 'gsk_...',
    description: 'Ultra-fast inference. Best free tier.',
    icon: '⚡',
    docsUrl: 'https://console.groq.com/keys',
    models: [
      { id: 'llama-3.1-8b-instant',                      name: 'Llama 3.1 8B Instant',    tier: 'Free', context: '128K' },
      { id: 'llama-3.3-70b-versatile',                   name: 'Llama 3.3 70B Versatile', tier: 'Free', context: '128K' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B',       tier: 'Free', context: '128K' },
      { id: 'qwen/qwen3-32b',                            name: 'Qwen 3 32B',              tier: 'Free', context: '128K' },
      { id: 'openai/gpt-oss-20b',                        name: 'GPT-OSS 20B',             tier: 'Free', context: '32K'  },
      { id: 'openai/gpt-oss-120b',                       name: 'GPT-OSS 120B',            tier: 'Free', context: '32K'  },
      { id: 'groq/compound-mini',                        name: 'Groq Compound Mini',      tier: 'Free', context: '128K' },
      { id: 'groq/compound',                             name: 'Groq Compound',           tier: 'Free', context: '128K' },
    ]
  },
  {
    key: 'gemini',
    label: 'Google Gemini',
    placeholder: 'AIza...',
    description: 'Multimodal intelligence from Google.',
    icon: '✨',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', tier: 'Free', context: '1M' },
      { id: 'gemini-2.5-flash',      name: 'Gemini 2.5 Flash',      tier: 'Free', context: '1M' },
    ]
  },
  {
    key: 'cerebras',
    label: 'Cerebras',
    placeholder: 'csk_...',
    description: 'Blazing fast inference on WSE-3 chips.',
    icon: '🧠',
    docsUrl: 'https://cloud.cerebras.ai/',
    models: [
      { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', tier: 'Free', context: '32K' },
      { id: 'zai-glm-4.7',  name: 'ZAI GLM 4.7',  tier: 'Free', context: '32K' },
    ]
  },
  {
    key: 'openrouter',
    label: 'OpenRouter',
    placeholder: 'sk-or-...',
    description: 'Access hundreds of models via one API.',
    icon: '🔀',
    docsUrl: 'https://openrouter.ai/keys',
    models: [
      { id: 'nvidia/nemotron-nano-9b-v2:free',                  name: 'Nemotron Nano 9B V2',    tier: 'Free', context: '128K' },
      { id: 'nvidia/nemotron-nano-12b-v2-vl:free',              name: 'Nemotron Nano 12B VL',   tier: 'Free', context: '128K' },
      { id: 'nvidia/nemotron-3-nano-30b-a3b:free',              name: 'Nemotron 3 Nano 30B',    tier: 'Free', context: '256K' },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free',           name: 'Nemotron 3 Super 120B',  tier: 'Free', context: '1M'   },
      { id: 'nvidia/nemotron-3-ultra-550b-a55b:free',           name: 'Nemotron 3 Ultra 550B',  tier: 'Free', context: '1M'   },
      { id: 'openai/gpt-oss-20b:free',                          name: 'GPT-OSS 20B',            tier: 'Free', context: '131K' },
      { id: 'openai/gpt-oss-120b:free',                         name: 'GPT-OSS 120B',           tier: 'Free', context: '131K' },
      { id: 'qwen/qwen3-next-80b-a3b-instruct:free',            name: 'Qwen3 Next 80B A3B',     tier: 'Free', context: '256K' },
      { id: 'nex-agi/nex-n2-pro:free',                          name: 'Nex-N2-Pro',             tier: 'Free', context: '256K' },
      { id: 'poolside/laguna-m.1:free',                         name: 'Laguna M.1',             tier: 'Free', context: '256K' },
      { id: 'poolside/laguna-xs.2:free',                        name: 'Laguna XS.2',            tier: 'Free', context: '256K' },
    ]
  }
];

// Flat lookup map: modelId -> { ...modelInfo, providerKey, providerLabel }
const MODEL_LOOKUP = {};
PROVIDERS.forEach(p => p.models.forEach(m => { MODEL_LOOKUP[m.id] = { ...m, providerKey: p.key, providerLabel: p.label }; }));

// Set of all valid model IDs in the current PROVIDERS list
const VALID_MODEL_IDS = new Set(Object.keys(MODEL_LOOKUP));

export default function SettingsModal({ isOpen, onClose, onSave, initialConfig }) {
  const [activeTab, setActiveTab] = useState('keys');
  const [keys, setKeys] = useState({ groq: '', gemini: '', cerebras: '', openrouter: '' });
  const [showKeys, setShowKeys] = useState({ groq: false, gemini: false, cerebras: false, openrouter: false });
  const [selectedModels, setSelectedModels] = useState([]);
  const [masterModel, setMasterModel] = useState(null);

  useEffect(() => {
    if (isOpen && initialConfig) {
      setKeys(initialConfig.keys || { groq: '', gemini: '', cerebras: '', openrouter: '' });
      // Filter out any stale model IDs that no longer exist in the current PROVIDERS list.
      // This prevents old localStorage data (from previous app versions with different models)
      // from silently inflating the council and sending invalid model IDs to the backend.
      const validCouncilModels = (initialConfig.council_models || []).filter(
        m => VALID_MODEL_IDS.has(m.id)
      );
      setSelectedModels(validCouncilModels);
      // Also validate the master model
      const savedMaster = initialConfig.master_model;
      setMasterModel(savedMaster && VALID_MODEL_IDS.has(savedMaster.id) ? savedMaster : null);
    }
  }, [isOpen, initialConfig]);

  if (!isOpen) return null;

  const handleKeyChange = (provider, value) => setKeys(prev => ({ ...prev, [provider]: value }));
  const toggleShowKey = (provider) => setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));

  const handleModelToggle = (provider, modelId) => {
    const isSelected = selectedModels.some(m => m.id === modelId);
    if (isSelected) {
      setSelectedModels(selectedModels.filter(m => m.id !== modelId));
      if (masterModel?.id === modelId) setMasterModel(null);
    } else {
      setSelectedModels([...selectedModels, { id: modelId, provider }]);
    }
  };

  const handleSave = () => {
    onSave({ keys, council_models: selectedModels, master_model: masterModel });
    onClose();
  };

  const canSave = selectedModels.length > 0 && masterModel;

  return (
    <div className="sm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sm-modal">

        {/* Header */}
        <div className="sm-header">
          <div className="sm-header-left">
            <div className="sm-header-icon">⚙</div>
            <div>
              <h2 className="sm-title">Configuration</h2>
              <p className="sm-subtitle">Set up your AI council</p>
            </div>
          </div>
          <button className="sm-close" onClick={onClose}>✕</button>
        </div>

        {/* Tab Navigation */}
        <div className="sm-tabs">
          <button className={`sm-tab ${activeTab === 'keys' ? 'active' : ''}`} onClick={() => setActiveTab('keys')}>
            <span className="sm-tab-icon">🔑</span> API Keys
          </button>
          <button className={`sm-tab ${activeTab === 'council' ? 'active' : ''}`} onClick={() => setActiveTab('council')}>
            <span className="sm-tab-icon">🏛</span> Council
          </button>
          <button className={`sm-tab ${activeTab === 'master' ? 'active' : ''}`} onClick={() => setActiveTab('master')}>
            <span className="sm-tab-icon">👑</span> Master
          </button>
        </div>

        {/* Content */}
        <div className="sm-content">

          {/* Tab: API Keys */}
          {activeTab === 'keys' && (
            <div className="sm-panel">
              <p className="sm-panel-desc">Enter API keys for each provider you want to use. They are stored only in your browser and never sent to our servers.</p>
              <div className="sm-providers-list">
                {PROVIDERS.map(provider => (
                  <div key={provider.key} className={`sm-provider-card ${keys[provider.key] ? 'has-key' : ''}`}>
                    <div className="sm-provider-card-header">
                      <span className="sm-provider-icon">{provider.icon}</span>
                      <div className="sm-provider-info">
                        <span className="sm-provider-name">{provider.label}</span>
                        <span className="sm-provider-desc">{provider.description}</span>
                      </div>
                      {keys[provider.key] && <span className="sm-connected-badge">● Connected</span>}
                    </div>
                    <div className="sm-key-input-row">
                      <div className="sm-key-input-wrap">
                        <input
                          type={showKeys[provider.key] ? 'text' : 'password'}
                          value={keys[provider.key]}
                          onChange={e => handleKeyChange(provider.key, e.target.value)}
                          placeholder={provider.placeholder}
                          className="sm-key-input"
                        />
                        <button
                          type="button"
                          className="sm-eye-btn"
                          onClick={() => toggleShowKey(provider.key)}
                          title={showKeys[provider.key] ? 'Hide' : 'Show'}
                        >
                          {showKeys[provider.key] ? (
                            // Eye-off (hide)
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                              <line x1="1" y1="1" x2="23" y2="23"/>
                            </svg>
                          ) : (
                            // Eye (show)
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                          )}
                        </button>
                      </div>
                      <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="sm-get-key-link">
                        Get key ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab: Council Models */}
          {activeTab === 'council' && (
            <div className="sm-panel">
              <p className="sm-panel-desc">Pick which models form the council. They will each independently answer your query before debating.</p>
              {selectedModels.length > 0 && (
                <div className="sm-selected-summary">
                  <span>{selectedModels.length} model{selectedModels.length > 1 ? 's' : ''} selected</span>
                  <button className="sm-clear-btn" onClick={() => { setSelectedModels([]); setMasterModel(null); }}>Clear all</button>
                </div>
              )}
              {PROVIDERS.map(provider => {
                const hasKey = keys[provider.key]?.trim();
                return (
                  <div key={provider.key} className={`sm-model-section ${!hasKey ? 'locked' : ''}`}>
                    <div className="sm-model-section-header">
                      <span className="sm-model-section-icon">{provider.icon}</span>
                      <span className="sm-model-section-label">{provider.label}</span>
                      {!hasKey && <span className="sm-lock-badge">🔒 Add key to unlock</span>}
                    </div>
                    <div className="sm-model-grid">
                      {provider.models.map(model => {
                        const isChecked = selectedModels.some(m => m.id === model.id);
                        return (
                          <label
                            key={model.id}
                            className={`sm-model-card ${isChecked ? 'selected' : ''} ${!hasKey ? 'disabled' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={!hasKey}
                              onChange={() => handleModelToggle(provider.key, model.id)}
                              className="sm-model-checkbox"
                            />
                            <div className="sm-model-card-body">
                              <span className="sm-model-card-name">{model.name}</span>
                              <div className="sm-model-card-meta">
                                <span className={`sm-tier-badge tier-${model.tier.toLowerCase()}`}>{model.tier}</span>
                                <span className="sm-context-badge">{model.context}</span>
                              </div>
                            </div>
                            {isChecked && <span className="sm-check-icon">✓</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab: Master Model */}
          {activeTab === 'master' && (
            <div className="sm-panel">
              <p className="sm-panel-desc">The Master model reads all council responses and synthesizes the final answer. It should be the most capable model.</p>
              {selectedModels.length === 0 ? (
                <div className="sm-empty-state">
                  <div className="sm-empty-icon">🏛</div>
                  <p>You haven't selected any council models yet.</p>
                  <button className="sm-goto-btn" onClick={() => setActiveTab('council')}>→ Go to Council tab</button>
                </div>
              ) : (
                <div className="sm-master-grid">
                  {selectedModels.map(m => {
                    const info = MODEL_LOOKUP[m.id];
                    if (!info) return null;
                    const providerInfo = PROVIDERS.find(p => p.key === m.provider);
                    const isMaster = masterModel?.id === m.id;
                    return (
                      <div
                        key={m.id}
                        className={`sm-master-card ${isMaster ? 'selected' : ''}`}
                        onClick={() => setMasterModel(isMaster ? null : m)}
                      >
                        <div className="sm-master-card-icon">{providerInfo?.icon}</div>
                        <div className="sm-master-card-body">
                          <span className="sm-master-card-name">{info.name}</span>
                          <span className="sm-master-card-provider">{providerInfo?.label}</span>
                        </div>
                        {isMaster && <span className="sm-crown">👑</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sm-footer">
          <div className="sm-footer-status">
            {canSave
              ? <span className="sm-status-ok">✓ {selectedModels.length} council models · Master: {MODEL_LOOKUP[masterModel?.id]?.name}</span>
              : <span className="sm-status-warn">Select council models and a master model to save</span>
            }
          </div>
          <div className="sm-footer-actions">
            <button className="sm-cancel-btn" onClick={onClose}>Cancel</button>
            <button className="sm-save-btn" onClick={handleSave} disabled={!canSave}>
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
