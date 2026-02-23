import type { PlayerState } from '@engine/types';
import { ALL_RESOURCES } from '@engine/types';
import { PLAYER_COLORS } from '@engine/constants';
import { calculateVP } from '@engine/rules/victory';
import type { GameState } from '@engine/types';

interface PlayerPanelProps {
  player: PlayerState;
  isCurrentPlayer: boolean;
  state: GameState;
}

export function PlayerPanel({ player, isCurrentPlayer, state }: PlayerPanelProps) {
  const color = PLAYER_COLORS[player.id];
  const vp = calculateVP(state, player.id);
  const totalCards = ALL_RESOURCES.reduce((s, r) => s + player.resources[r], 0);

  return (
    <div
      style={{
        border: `3px solid ${isCurrentPlayer ? color : '#ddd'}`,
        borderRadius: 8,
        padding: '8px 12px',
        marginBottom: 8,
        backgroundColor: isCurrentPlayer ? `${color}15` : '#fff',
        opacity: isCurrentPlayer ? 1 : 0.8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <strong style={{ color }}>{player.name}</strong>
        <span style={{ fontSize: 14, fontWeight: 'bold' }}>{vp} VP</span>
      </div>

      {isCurrentPlayer ? (
        <div style={{ fontSize: 13 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ALL_RESOURCES.map((r) => (
              <span key={r} style={{ whiteSpace: 'nowrap' }}>
                <ResourceIcon resource={r} /> {player.resources[r]}
              </span>
            ))}
          </div>
          {player.devCards.length + player.newDevCards.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 12, color: '#666' }}>
              Dev cards: {player.devCards.length + player.newDevCards.length}
              {player.devCards.length > 0 && (
                <span> ({player.devCards.join(', ')})</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: '#666' }}>
          {totalCards} cards | {player.knightsPlayed} knights
        </div>
      )}
    </div>
  );
}

function ResourceIcon({ resource }: { resource: string }) {
  const icons: Record<string, string> = {
    lumber: '\u{1F332}',
    brick: '\u{1F9F1}',
    wool: '\u{1F411}',
    grain: '\u{1F33E}',
    ore: '\u{26F0}\uFE0F',
  };
  return <span title={resource}>{icons[resource] ?? resource}</span>;
}
