import { useState } from 'react';
import type { RoomInfo } from '@shared/multiplayer-types';
import { PLAYER_COLORS } from '@engine/constants';
import { useIsMobile } from '../../hooks/useIsMobile';

interface JoinScreenProps {
  roomId: string;
  roomInfo: RoomInfo | null;
  error: string | null;
  isConnected: boolean;
  onJoin: (roomId: string, name: string) => void;
  onBack: () => void;
}

export function JoinScreen({
  roomId,
  roomInfo,
  error,
  isConnected,
  onJoin,
  onBack,
}: JoinScreenProps) {
  const isMobile = useIsMobile();
  const [name, setName] = useState('');

  const handleJoin = () => {
    const playerName = name.trim() || 'Player';
    onJoin(roomId, playerName);
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
        <h1 style={{ textAlign: 'center', margin: '0 0 4px', color: '#2c3e50', fontSize: 24 }}>
          Join Game
        </h1>
        <p style={{ textAlign: 'center', color: '#7f8c8d', marginBottom: 20, fontSize: 14 }}>
          Room: <strong>{roomId}</strong>
          {!isConnected && <span style={{ color: '#e74c3c', marginLeft: 8 }}>Connecting...</span>}
        </p>

        {error && (
          <div style={{
            padding: '10px 14px', backgroundColor: '#fdedec',
            border: '1px solid #e74c3c', borderRadius: 6, marginBottom: 16,
            color: '#c0392b', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Room info preview */}
        {roomInfo && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#7f8c8d', textTransform: 'uppercase' }}>
              Players in Room
            </h3>
            {roomInfo.seats.map((seat, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', marginBottom: 4,
                backgroundColor: '#f9f9f9', borderRadius: 6,
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  backgroundColor: PLAYER_COLORS[i] ?? '#999',
                }} />
                <div style={{ flex: 1, fontSize: 13, color: '#2c3e50' }}>
                  {seat.playerName ?? (seat.config.type === 'human-remote' ? 'Open seat' : 'AI')}
                </div>
                {seat.config.type === 'human-remote' && !seat.playerName && (
                  <span style={{ fontSize: 11, color: '#27ae60' }}>Available</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Name input + Join */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 'bold', color: '#2c3e50', fontSize: 14 }}>
            Your Name:
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              border: '2px solid #3498db40', borderRadius: 6,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          onClick={handleJoin}
          style={{
            width: '100%', padding: '14px', fontSize: 18,
            backgroundColor: '#27ae60', color: 'white',
            border: 'none', borderRadius: 8, cursor: 'pointer',
            fontWeight: 'bold', marginBottom: 8,
          }}
        >
          Join Game
        </button>

        <button
          onClick={onBack}
          style={{
            width: '100%', padding: '10px', fontSize: 14,
            backgroundColor: '#ecf0f1', color: '#666',
            border: 'none', borderRadius: 6, cursor: 'pointer',
          }}
        >
          Back
        </button>
      </div>
    </div>
  );
}
