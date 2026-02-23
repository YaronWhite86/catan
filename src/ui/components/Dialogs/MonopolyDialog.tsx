import { ALL_RESOURCES } from '@engine/types';
import type { ResourceType } from '@engine/types';
import { RESOURCE_LABELS } from '@engine/constants';

interface MonopolyDialogProps {
  onPick: (resource: ResourceType) => void;
}

export function MonopolyDialog({ onPick }: MonopolyDialogProps) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 24, minWidth: 250 }}>
        <h3 style={{ margin: '0 0 12px' }}>Monopoly: Choose a resource</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ALL_RESOURCES.map((r) => (
            <button
              key={r}
              onClick={() => onPick(r)}
              style={{
                padding: '10px 20px', fontSize: 14,
                backgroundColor: '#8e44ad', color: 'white',
                border: 'none', borderRadius: 6, cursor: 'pointer',
              }}
            >
              {RESOURCE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
