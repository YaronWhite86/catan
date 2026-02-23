import type { GameState } from '@engine/types';
import { PLAYER_COLORS } from '@engine/constants';
import { calculateVP } from '@engine/rules/victory';

interface WinnerDialogProps {
  state: GameState;
  onNewGame: () => void;
}

export function WinnerDialog({ state, onNewGame }: WinnerDialogProps) {
  const winner = state.players[state.currentPlayer];
  const vp = calculateVP(state, state.currentPlayer);
  const color = PLAYER_COLORS[state.currentPlayer];

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: 'white', borderRadius: 16, padding: 32,
        textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>&#x1F3C6;</div>
        <h2 style={{ color, margin: '0 0 8px' }}>
          {winner.name} Wins!
        </h2>
        <p style={{ fontSize: 18, color: '#555' }}>
          {vp} Victory Points
        </p>
        <button
          onClick={onNewGame}
          style={{
            marginTop: 16, padding: '12px 32px', fontSize: 16,
            backgroundColor: '#3498db', color: 'white',
            border: 'none', borderRadius: 8, cursor: 'pointer',
          }}
        >
          New Game
        </button>
      </div>
    </div>
  );
}
