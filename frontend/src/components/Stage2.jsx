import { useState } from 'react';
import './Stage2.css';

function shortName(model) {
  const base = model.split('/').pop().replace(/:free$/, '');
  return base
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .trim();
}

export default function Stage2({ rankings, labelToModel, aggregateRankings }) {
  const [activeTab, setActiveTab] = useState(0);

  if (!rankings || rankings.length === 0) return null;

  const active = rankings[activeTab];

  return (
    <div className="stage stage2">
      <h3 className="stage-title">Stage 2: Peer Rankings</h3>

      {/* Judge tabs */}
      <div className="s2-tabs">
        {rankings.map((r, i) => (
          <button
            key={i}
            className={`s2-tab ${activeTab === i ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}
            title={r.model}
          >
            {shortName(r.model)}
          </button>
        ))}
      </div>

      {/* Extracted ranking only — no full description */}
      {active.parsed_ranking && active.parsed_ranking.length > 0 && (
        <div className="s2-panel">
          <div className="s2-rank-list">
            {active.parsed_ranking.map((label, i) => {
              const name = labelToModel?.[label]
                ? shortName(labelToModel[label])
                : label;
              return (
                <div key={i} className={`s2-rank-row ${i === 0 ? 'top' : ''}`}>
                  <span className="s2-rank-num">#{i + 1}</span>
                  <span className="s2-rank-name">{name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Aggregate leaderboard */}
      {aggregateRankings && aggregateRankings.length > 0 && (
        <div className="s2-leaderboard">
          <div className="s2-lb-title">Overall Ranking</div>
          <div className="s2-lb-list">
            {aggregateRankings.map((agg, i) => (
              <div key={i} className={`s2-lb-row ${i === 0 ? 'winner' : ''}`}>
                <span className="s2-lb-pos">#{i + 1}</span>
                <span className="s2-lb-name">{shortName(agg.model)}</span>
                <span className="s2-lb-score">avg {agg.average_rank.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
