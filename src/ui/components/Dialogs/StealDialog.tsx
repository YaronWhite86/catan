import type { PlayerId } from '@engine/types';
import type { GameState } from '@engine/types';
import { getStealTargets } from '@engine/rules/robber';
import { PLAYER_COLORS } from '@engine/constants';

interface StealDialogProps {
  state: GameState;
  onSteal: (victim: PlayerId | null) => void;
}

export function StealDialog({ state, onSteal }: StealDialogProps) {
  const targets = getStealTargets(state, state.robberHex, state.currentPlayer);

  if (targets.length === 0) {
    // Auto-skip if no targets
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}>
        <div style={{ background: 'white', borderRadius: 12, padding: 24 }}>
          <h3>No one to steal from!</h3>
          <button
            onClick={() => onSteal(null)}
            style={{
              padding: '8px 24px', backgroundColor: '#3498db',
              color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer',
            }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, minWidth: 250 }}>
        <h3 style={{ margin: '0 0 12px' }}>Steal from whom?</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {targets.map((pid) => (
            <button
              key={pid}
              onClick={() => onSteal(pid)}
              style={{
                padding: '10px 20px', fontSize: 14,
                backgroundColor: PLAYER_COLORS[pid],
                color: 'white', border: 'none', borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {state.players[pid].name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
