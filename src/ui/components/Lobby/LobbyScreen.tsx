import { useState } from 'react';
import type { RoomInfo } from '@shared/multiplayer-types';
import { PLAYER_COLORS } from '@engine/constants';
import { useIsMobile } from '../../hooks/useIsMobile';

interface LobbyScreenProps {
  roomId: string;
  roomInfo: RoomInfo;
  mySeat: number;
  isConnected: boolean;
  onStartGame: () => void;
  onEndRoom: () => void;
  onBack: () => void;
  title?: string;
  subtitle?: string;
  shareUrl?: string;
}

export function LobbyScreen({
  roomId,
  roomInfo,
  mySeat,
  isConnected,
  onStartGame,
  onEndRoom,
  onBack,
  title,
  subtitle,
  shareUrl: shareUrlProp,
}: LobbyScreenProps) {
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);

  const shareUrl = shareUrlProp ?? `${window.location.origin}${window.location.pathname}?room=${roomId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const allRemoteSeatsJoined = roomInfo.seats.every(
    (s) => s.config.type !== 'human-remote' || s.playerName !== null
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', padding: isMobile ? 12 : 20,
      background: 'linear-gradient(135deg, #1a5276 0%, #2980b9 100%)',
    }}>
      <div style={{
        background: 'white', borderRadius: 16, padding: isMobile ? 16 : 32,
        boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxWidth: 480, width: '100%',
      }}>
        <h1 style={{ textAlign: 'center', margin: '0 0 4px', color: '#2c3e50', fontSize: 24 }}>
          {title ?? 'Online Game Lobby'}
        </h1>
        <p style={{ textAlign: 'center', color: '#7f8c8d', marginBottom: 20, fontSize: 14 }}>
          {subtitle ?? <>Room: <strong>{roomId}</strong></>}
          {!isConnected && <span style={{ color: '#e74c3c', marginLeft: 8 }}>Disconnected</span>}
        </p>

        {/* Share link */}
        <div style={{
          marginBottom: 20, padding: 12, backgroundColor: '#f0f7ff',
          borderRadius: 8, border: '1px solid #d0e0f0',
        }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Share this link:</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              readOnly
              value={shareUrl}
              style={{
                flex: 1, padding: '8px 10px', fontSize: 13,
                border: '1px solid #ccc', borderRadius: 4,
                backgroundColor: 'white', fontFamily: 'monospace',
              }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopy}
              style={{
                padding: '8px 14px', fontSize: 13,
                backgroundColor: copied ? '#27ae60' : '#3498db',
                color: 'white', border: 'none', borderRadius: 4,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Seat list */}
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#7f8c8d', textTransform: 'uppercase' }}>
            Players
          </h3>
          {roomInfo.seats.map((seat, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', marginBottom: 6,
              backgroundColor: i === mySeat ? '#f0f7ff' : '#f9f9f9',
              borderRadius: 8,
              border: i === mySeat ? '2px solid #3498db' : '1px solid #eee',
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                backgroundColor: PLAYER_COLORS[i] ?? '#999',
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: 14, color: '#2c3e50' }}>
                  {seat.playerName ?? (seat.config.type === 'human-remote' ? 'Waiting for player...' : 'AI')}
                  {i === mySeat && <span style={{ color: '#3498db', fontWeight: 'normal', fontSize: 12 }}> (you)</span>}
                </div>
                <div style={{ fontSize: 11, color: '#999' }}>
                  {seat.config.type === 'ai' && `AI - ${seat.config.strategyType ?? 'heuristic'} (${seat.config.difficulty ?? 'medium'})`}
                  {seat.config.type === 'human-local' && 'Host'}
                  {seat.config.type === 'human-remote' && 'Remote player'}
                </div>
              </div>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                backgroundColor: seat.connected ? '#27ae60' : '#e74c3c',
              }} title={seat.connected ? 'Connected' : 'Not connected'} />
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={onStartGame}
            disabled={!allRemoteSeatsJoined}
            style={{
              width: '100%', padding: '14px', fontSize: 18,
              backgroundColor: allRemoteSeatsJoined ? '#27ae60' : '#95a5a6',
              color: 'white', border: 'none', borderRadius: 8,
              cursor: allRemoteSeatsJoined ? 'pointer' : 'default',
              fontWeight: 'bold',
            }}
          >
            {allRemoteSeatsJoined ? 'Start Game' : 'Waiting for players...'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onBack}
              style={{
                flex: 1, padding: '10px', fontSize: 14,
                backgroundColor: '#ecf0f1', color: '#666',
                border: 'none', borderRadius: 6, cursor: 'pointer',
              }}
            >
              Back
            </button>
            <button
              onClick={onEndRoom}
              style={{
                flex: 1, padding: '10px', fontSize: 14,
                backgroundColor: '#e74c3c', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer',
              }}
            >
              End Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
