import { useState } from 'react';
import type { PlayerId, ResourceCount, ResourceType } from '@engine/types';
import { ALL_RESOURCES } from '@engine/types';
import { RESOURCE_LABELS } from '@engine/constants';
import { getDiscardCount } from '@engine/rules/dice';
import type { GameState } from '@engine/types';
import { useIsMobile } from '../../hooks/useIsMobile';

interface DiscardDialogProps {
  state: GameState;
  player: PlayerId;
  onDiscard: (resources: ResourceCount) => void;
}

export function DiscardDialog({ state, player, onDiscard }: DiscardDialogProps) {
  const isMobile = useIsMobile();
  const required = getDiscardCount(state, player);
  const [discard, setDiscard] = useState<ResourceCount>({
    lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0,
  });

  const total = ALL_RESOURCES.reduce((s, r) => s + discard[r], 0);

  const adjust = (resource: ResourceType, delta: number) => {
    const newVal = discard[resource] + delta;
    if (newVal < 0 || newVal > state.players[player].resources[resource]) return;
    setDiscard({ ...discard, [resource]: newVal });
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: 'white', borderRadius: 12, padding: isMobile ? 16 : 24,
        width: isMobile ? 'calc(100vw - 32px)' : undefined,
        maxWidth: 400, minWidth: isMobile ? undefined : 300,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}>
        <h3 style={{ margin: '0 0 12px' }}>
          {state.players[player].name}: Discard {required} cards
        </h3>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
          Selected: {total} / {required}
        </div>
        {ALL_RESOURCES.map((r) => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 60, fontSize: 13 }}>{RESOURCE_LABELS[r]}</span>
            <span style={{ fontSize: 12, color: '#999', width: 20 }}>
              ({state.players[player].resources[r]})
            </span>
            <button onClick={() => adjust(r, -1)} disabled={discard[r] <= 0}
              style={{ width: isMobile ? 40 : 28, height: isMobile ? 40 : 28 }}>-</button>
            <span style={{ width: 20, textAlign: 'center' }}>{discard[r]}</span>
            <button onClick={() => adjust(r, 1)}
              disabled={discard[r] >= state.players[player].resources[r] || total >= required}
              style={{ width: isMobile ? 40 : 28, height: isMobile ? 40 : 28 }}>+</button>
          </div>
        ))}
        <button
          onClick={() => onDiscard(discard)}
          disabled={total !== required}
          style={{
            marginTop: 12, padding: '8px 24px', fontSize: 14,
            backgroundColor: total === required ? '#27ae60' : '#bdc3c7',
            color: 'white', border: 'none', borderRadius: 6, cursor: total === required ? 'pointer' : 'default',
          }}
        >
          Confirm Discard
        </button>
      </div>
    </div>
  );
}
