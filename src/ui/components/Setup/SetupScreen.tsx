import { useState } from 'react';
import { PLAYER_COLORS } from '@engine/constants';

interface SetupScreenProps {
  onStart: (names: string[], playerCount: number) => void;
}

export function SetupScreen({ onStart }: SetupScreenProps) {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState(['', '', '', '']);

  const handleNameChange = (idx: number, name: string) => {
    const newNames = [...names];
    newNames[idx] = name;
    setNames(newNames);
  };

  const handleStart = () => {
    const finalNames = names
      .slice(0, playerCount)
      .map((n, i) => n.trim() || `Player ${i + 1}`);
    onStart(finalNames, playerCount);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', padding: 20,
      background: 'linear-gradient(135deg, #1a5276 0%, #2980b9 100%)',
    }}>
      <div style={{
        background: 'white', borderRadius: 16, padding: 32,
        boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxWidth: 400, width: '100%',
      }}>
        <h1 style={{ textAlign: 'center', margin: '0 0 8px', color: '#2c3e50' }}>
          Settlers of Catan
        </h1>
        <p style={{ textAlign: 'center', color: '#7f8c8d', marginBottom: 24 }}>
          Local hot-seat multiplayer
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
          <div key={i} style={{ marginBottom: 12 }}>
            <label style={{
              display: 'block', marginBottom: 4, fontSize: 13,
              color: PLAYER_COLORS[i], fontWeight: 'bold',
            }}>
              Player {i + 1}:
            </label>
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
          Start Game
        </button>
      </div>
    </div>
  );
}
