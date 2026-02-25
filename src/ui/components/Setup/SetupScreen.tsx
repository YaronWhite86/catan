import { useState } from 'react';
import { PLAYER_COLORS } from '@engine/constants';
import type { PlayerConfig, AIDifficulty, StrategyType } from '@ai/types';
import { useIsMobile } from '../../hooks/useIsMobile';

interface SetupScreenProps {
  onStart: (names: string[], playerCount: number, playerConfigs: PlayerConfig[]) => void;
  onCreateP2P?: (playerCount: number, configs: PlayerConfig[], names: string[]) => void;
}

const DEFAULT_CONFIG: PlayerConfig = { isAI: false, difficulty: 'medium', strategyType: 'heuristic' };

export function SetupScreen({ onStart, onCreateP2P }: SetupScreenProps) {
  const isMobile = useIsMobile();
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState(['', '', '', '']);
  const [configs, setConfigs] = useState<PlayerConfig[]>([
    { ...DEFAULT_CONFIG },
    { ...DEFAULT_CONFIG, isAI: true },
    { ...DEFAULT_CONFIG, isAI: true },
    { ...DEFAULT_CONFIG, isAI: true },
  ]);

  const handleNameChange = (idx: number, name: string) => {
    const newNames = [...names];
    newNames[idx] = name;
    setNames(newNames);
  };

  const handleToggleAI = (idx: number) => {
    const newConfigs = [...configs];
    newConfigs[idx] = { ...newConfigs[idx], isAI: !newConfigs[idx].isAI };
    setConfigs(newConfigs);
  };

  const handleDifficultyChange = (idx: number, difficulty: AIDifficulty) => {
    const newConfigs = [...configs];
    newConfigs[idx] = { ...newConfigs[idx], difficulty };
    setConfigs(newConfigs);
  };

  const handleStrategyChange = (idx: number, strategyType: StrategyType) => {
    const newConfigs = [...configs];
    newConfigs[idx] = { ...newConfigs[idx], strategyType };
    setConfigs(newConfigs);
  };

  const handleStart = () => {
    const finalNames = names
      .slice(0, playerCount)
      .map((n, i) => {
        if (configs[i].isAI) {
          const diffLabel = configs[i].difficulty.charAt(0).toUpperCase() + configs[i].difficulty.slice(1);
          const stratLabel = configs[i].strategyType === 'neural' ? 'Neural' : '';
          return n.trim() || `AI ${stratLabel}${diffLabel} ${i + 1}`.replace(/\s+/g, ' ').trim();
        }
        return n.trim() || `Player ${i + 1}`;
      });
    onStart(finalNames, playerCount, configs.slice(0, playerCount));
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', padding: isMobile ? 12 : 20,
      background: 'linear-gradient(135deg, #1a5276 0%, #2980b9 100%)',
    }}>
      <div style={{
        background: 'white', borderRadius: 16, padding: isMobile ? 16 : 32,
        boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxWidth: 440, width: '100%',
      }}>
        <h1 style={{ textAlign: 'center', margin: '0 0 8px', color: '#2c3e50' }}>
          Settlers of Catan
        </h1>
        <p style={{ textAlign: 'center', color: '#7f8c8d', marginBottom: 24 }}>
          Play against AI or friends
        </p>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 'bold', color: '#2c3e50' }}>
            Number of players:
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setPlayerCount(n)}
                style={{
                  flex: 1, padding: '10px', fontSize: 16,
                  backgroundColor: playerCount === n ? '#3498db' : '#ecf0f1',
                  color: playerCount === n ? 'white' : '#2c3e50',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                {n} Players
              </button>
            ))}
          </div>
        </div>

        {Array.from({ length: playerCount }, (_, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <label style={{
                fontSize: 13, color: PLAYER_COLORS[i], fontWeight: 'bold', flex: 1,
              }}>
                Player {i + 1}:
              </label>
              <button
                onClick={() => handleToggleAI(i)}
                style={{
                  padding: isMobile ? '8px 12px' : '3px 10px', fontSize: 11, fontWeight: 'bold',
                  backgroundColor: configs[i].isAI ? '#8e44ad' : '#ecf0f1',
                  color: configs[i].isAI ? 'white' : '#666',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                }}
              >
                {configs[i].isAI ? 'AI' : 'Human'}
              </button>
            </div>

            {configs[i].isAI ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Strategy type */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['heuristic', 'neural'] as StrategyType[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStrategyChange(i, s)}
                      style={{
                        flex: 1, padding: isMobile ? '10px 8px' : '5px 4px', fontSize: 10,
                        backgroundColor: configs[i].strategyType === s ? '#2980b9' : '#f5f5f5',
                        color: configs[i].strategyType === s ? 'white' : '#666',
                        border: configs[i].strategyType === s ? 'none' : '1px solid #ddd',
                        borderRadius: 4, cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {/* Difficulty (only for heuristic) */}
                {configs[i].strategyType === 'heuristic' && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['easy', 'medium', 'hard'] as AIDifficulty[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => handleDifficultyChange(i, d)}
                        style={{
                          flex: 1, padding: isMobile ? '10px 8px' : '6px 4px', fontSize: 11,
                          backgroundColor: configs[i].difficulty === d ? '#8e44ad' : '#f5f5f5',
                          color: configs[i].difficulty === d ? 'white' : '#666',
                          border: configs[i].difficulty === d ? 'none' : '1px solid #ddd',
                          borderRadius: 4, cursor: 'pointer',
                          textTransform: 'capitalize',
                        }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <input
                type="text"
                value={names[i]}
                onChange={(e) => handleNameChange(i, e.target.value)}
                placeholder={`Player ${i + 1}`}
                style={{
                  width: '100%', padding: '8px 12px', fontSize: 14,
                  border: `2px solid ${PLAYER_COLORS[i]}40`,
                  borderRadius: 6, outline: 'none', boxSizing: 'border-box',
                }}
              />
            )}
          </div>
        ))}

        <button
          onClick={handleStart}
          style={{
            width: '100%', padding: '14px', fontSize: 18,
            backgroundColor: '#27ae60', color: 'white',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontWeight: 'bold', marginTop: 12,
          }}
        >
          Start Local Game
        </button>

        {onCreateP2P && (
          <button
            onClick={() => onCreateP2P(playerCount, configs.slice(0, playerCount), names.slice(0, playerCount))}
            style={{
              width: '100%', padding: '14px', fontSize: 16,
              backgroundColor: '#8e44ad', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              fontWeight: 'bold', marginTop: 8,
            }}
          >
            Host P2P Game (No Server)
          </button>
        )}
      </div>
    </div>
  );
}
