import ReactMarkdown from 'react-markdown';
import './Stage3.css';

export default function Stage3({ finalResponse }) {
  if (!finalResponse) return null;

  const modelName = finalResponse.model?.split('/').pop() || finalResponse.model;

  return (
    <div className="stage stage3">
      <h3 className="stage-title">⭐ Stage 3: Final Council Answer</h3>
      <div className="chairman-label">Chairman · {modelName}</div>
      <div className="final-text markdown-content">
        <ReactMarkdown>{finalResponse.response}</ReactMarkdown>
      </div>
    </div>
  );
}
