import { useState } from 'react';
import { ALL_RESOURCES } from '@engine/types';
import type { ResourceType, GameState } from '@engine/types';
import { RESOURCE_LABELS } from '@engine/constants';
import { useIsMobile } from '../../hooks/useIsMobile';

interface YearOfPlentyDialogProps {
  state: GameState;
  onPick: (r1: ResourceType, r2: ResourceType) => void;
}

export function YearOfPlentyDialog({ state, onPick }: YearOfPlentyDialogProps) {
  const isMobile = useIsMobile();
  const [resource1, setResource1] = useState<ResourceType | null>(null);
  const [resource2, setResource2] = useState<ResourceType | null>(null);

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
      }}>
        <h3 style={{ margin: '0 0 12px' }}>Year of Plenty: Pick 2 resources</h3>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>First resource:</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ALL_RESOURCES.map((r) => (
              <button
                key={r}
                onClick={() => setResource1(r)}
                disabled={state.bank[r] <= 0}
                style={{
                  padding: isMobile ? '10px 14px' : '6px 12px', fontSize: 12,
                  backgroundColor: resource1 === r ? '#27ae60' : '#ecf0f1',
                  color: resource1 === r ? 'white' : '#2c3e50',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                }}
              >
                {RESOURCE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Second resource:</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ALL_RESOURCES.map((r) => {
              const available = state.bank[r] - (resource1 === r ? 1 : 0);
              return (
                <button
                  key={r}
                  onClick={() => setResource2(r)}
                  disabled={available <= 0}
                  style={{
                    padding: isMobile ? '10px 14px' : '6px 12px', fontSize: 12,
                    backgroundColor: resource2 === r ? '#27ae60' : '#ecf0f1',
                    color: resource2 === r ? 'white' : '#2c3e50',
                    border: 'none', borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  {RESOURCE_LABELS[r]}
                </button>
              );
            })}
          </div>
        </div>
        <button
          onClick={() => resource1 && resource2 && onPick(resource1, resource2)}
          disabled={!resource1 || !resource2}
          style={{
            padding: '8px 24px', fontSize: 14,
            backgroundColor: resource1 && resource2 ? '#27ae60' : '#bdc3c7',
            color: 'white', border: 'none', borderRadius: 6,
            cursor: resource1 && resource2 ? 'pointer' : 'default',
          }}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
