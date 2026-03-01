import { useState, useEffect } from 'react';
import type { GameState, PlayerId, ResourceType, ResourceCount } from '@engine/types';
import { ALL_RESOURCES } from '@engine/types';
import { RESOURCE_LABELS } from '@engine/constants';
import { getPlayerTradeRatio } from '@engine/rules/trading';
import { emptyResources, hasResources } from '@engine/utils/resource-utils';
import type { PlayerConfig } from '@ai/types';
import { useIsMobile } from '../../hooks/useIsMobile';

interface TradePanelProps {
  state: GameState;
  playerConfigs?: PlayerConfig[];
  mySeat?: number | null;
  isOnline?: boolean;
  onMaritimeTrade: (give: ResourceType, receive: ResourceType) => void;
  onProposeTrade: (offering: ResourceCount, requesting: ResourceCount) => void;
  onAcceptTrade: (player: PlayerId) => void;
  onRejectTrade: (player: PlayerId) => void;
}

export function TradePanel({
  state,
  playerConfigs,
  mySeat,
  isOnline,
  onMaritimeTrade,
  onProposeTrade,
  onAcceptTrade,
  onRejectTrade,
}: TradePanelProps) {
  const isMobile = useIsMobile();
  const [tradeMode, setTradeMode] = useState<'maritime' | 'domestic' | null>(null);

  return (
    <div style={{ marginTop: 8 }}>
      {/* Pending trade offer */}
      {state.pendingTrade && (() => {
        const pendingTrade = state.pendingTrade;
        if (!pendingTrade) return null;
        return (
        <div style={{
          padding: 12, border: '2px solid #f39c12', borderRadius: 8,
          backgroundColor: '#fef9e7', marginBottom: 8,
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>
            {state.players[pendingTrade.from].name} offers a trade:
          </div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            <div>Offering: {formatResources(pendingTrade.offering)}</div>
            <div>Requesting: {formatResources(pendingTrade.requesting)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isOnline && mySeat != null ? (
              // Online mode
              pendingTrade.from === mySeat ? (
                // I am the proposer — show waiting + cancel
                <>
                  <span style={{ fontSize: 13, color: '#666', alignSelf: 'center' }}>
                    Waiting for responses...
                  </span>
                  <button
                    onClick={() => onRejectTrade(mySeat as PlayerId)}
                    style={{
                      padding: isMobile ? '10px 14px' : '6px 12px', fontSize: 12,
                      backgroundColor: '#e74c3c', color: 'white',
                      border: 'none', borderRadius: 4, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                // I am NOT the proposer — show my accept + reject
                <>
                  <button
                    onClick={() => onAcceptTrade(mySeat as PlayerId)}
                    style={{
                      padding: isMobile ? '10px 14px' : '6px 12px', fontSize: 12,
                      backgroundColor: '#27ae60', color: 'white',
                      border: 'none', borderRadius: 4, cursor: 'pointer',
                    }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => onRejectTrade(mySeat as PlayerId)}
                    style={{
                      padding: isMobile ? '10px 14px' : '6px 12px', fontSize: 12,
                      backgroundColor: '#e74c3c', color: 'white',
                      border: 'none', borderRadius: 4, cursor: 'pointer',
                    }}
                  >
                    Reject
                  </button>
                </>
              )
            ) : (
              // Local hotseat mode — accept buttons for human players only
              <>
                {state.players.map((p) => {
                  if (p.id === pendingTrade.from) return null;
                  // Skip AI players — they auto-respond via useAITurn
                  if (playerConfigs?.[p.id]?.isAI) return null;
                  const canAccept = hasResources(p.resources, pendingTrade.requesting);
                  return (
                    <button
                      key={p.id}
                      onClick={() => onAcceptTrade(p.id)}
                      disabled={!canAccept}
                      title={canAccept ? undefined : 'Not enough resources'}
                      style={{
                        padding: isMobile ? '10px 14px' : '6px 12px', fontSize: 12,
                        backgroundColor: canAccept ? '#27ae60' : '#95a5a6',
                        color: 'white',
                        border: 'none', borderRadius: 4,
                        cursor: canAccept ? 'pointer' : 'default',
                        opacity: canAccept ? 1 : 0.6,
                      }}
                    >
                      {p.name} accepts
                    </button>
                  );
                })}
                <button
                  onClick={() => onRejectTrade(state.currentPlayer)}
                  style={{
                    padding: isMobile ? '10px 14px' : '6px 12px', fontSize: 12,
                    backgroundColor: '#e74c3c', color: 'white',
                    border: 'none', borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
        );
      })()}

      {!state.pendingTrade && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => setTradeMode(tradeMode === 'maritime' ? null : 'maritime')}
            style={{
              padding: '6px 14px', fontSize: 13,
              backgroundColor: tradeMode === 'maritime' ? '#3498db' : '#ecf0f1',
              color: tradeMode === 'maritime' ? 'white' : '#2c3e50',
              border: 'none', borderRadius: 4, cursor: 'pointer',
            }}
          >
            Maritime Trade
          </button>
          <button
            onClick={() => setTradeMode(tradeMode === 'domestic' ? null : 'domestic')}
            style={{
              padding: '6px 14px', fontSize: 13,
              backgroundColor: tradeMode === 'domestic' ? '#3498db' : '#ecf0f1',
              color: tradeMode === 'domestic' ? 'white' : '#2c3e50',
              border: 'none', borderRadius: 4, cursor: 'pointer',
            }}
          >
            Domestic Trade
          </button>
        </div>
      )}

      {tradeMode === 'maritime' && (
        <MaritimeTradeUI state={state} onTrade={onMaritimeTrade} />
      )}

      {tradeMode === 'domestic' && (
        <DomesticTradeUI state={state} onPropose={onProposeTrade} />
      )}
    </div>
  );
}

function MaritimeTradeUI({
  state,
  onTrade,
}: {
  state: GameState;
  onTrade: (give: ResourceType, receive: ResourceType) => void;
}) {
  const isMobile = useIsMobile();
  const [give, setGive] = useState<ResourceType | null>(null);
  const [receive, setReceive] = useState<ResourceType | null>(null);
  const player = state.currentPlayer;

  // Reset stale selections when player resources or bank change
  useEffect(() => {
    if (give !== null) {
      const ratio = getPlayerTradeRatio(state, player, give);
      if (state.players[player].resources[give] < ratio) {
        setGive(null);
      }
    }
    if (receive !== null) {
      if (receive === give || state.bank[receive] <= 0) {
        setReceive(null);
      }
    }
  }, [state.players[player].resources, state.bank, give, receive, state, player]);

  return (
    <div style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ marginBottom: 4 }}>Give:</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {ALL_RESOURCES.map((r) => {
            const ratio = getPlayerTradeRatio(state, player, r);
            const canGive = state.players[player].resources[r] >= ratio;
            return (
              <button
                key={r}
                onClick={() => setGive(r)}
                disabled={!canGive}
                style={{
                  padding: isMobile ? '8px 10px' : '4px 8px', fontSize: isMobile ? 12 : 11,
                  backgroundColor: give === r ? '#e74c3c' : canGive ? '#ecf0f1' : '#f5f5f5',
                  color: give === r ? 'white' : canGive ? '#2c3e50' : '#bbb',
                  border: 'none', borderRadius: 3, cursor: canGive ? 'pointer' : 'default',
                }}
              >
                {RESOURCE_LABELS[r]} ({ratio}:1)
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ marginBottom: 4 }}>Receive:</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {ALL_RESOURCES.filter((r) => r !== give).map((r) => (
            <button
              key={r}
              onClick={() => setReceive(r)}
              disabled={state.bank[r] <= 0}
              style={{
                padding: isMobile ? '8px 10px' : '4px 8px', fontSize: isMobile ? 12 : 11,
                backgroundColor: receive === r ? '#27ae60' : '#ecf0f1',
                color: receive === r ? 'white' : '#2c3e50',
                border: 'none', borderRadius: 3, cursor: 'pointer',
              }}
            >
              {RESOURCE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={() => give && receive && onTrade(give, receive)}
        disabled={!give || !receive}
        style={{
          padding: '6px 16px', backgroundColor: give && receive ? '#27ae60' : '#bdc3c7',
          color: 'white', border: 'none', borderRadius: 4,
          cursor: give && receive ? 'pointer' : 'default',
        }}
      >
        Trade
      </button>
    </div>
  );
}

function DomesticTradeUI({
  state,
  onPropose,
}: {
  state: GameState;
  onPropose: (offering: ResourceCount, requesting: ResourceCount) => void;
}) {
  const isMobile = useIsMobile();
  const [offering, setOffering] = useState<ResourceCount>(emptyResources());
  const [requesting, setRequesting] = useState<ResourceCount>(emptyResources());
  const player = state.currentPlayer;

  const adjustOffer = (r: ResourceType, delta: number) => {
    const newVal = offering[r] + delta;
    if (newVal < 0 || newVal > state.players[player].resources[r]) return;
    setOffering({ ...offering, [r]: newVal });
  };

  const adjustRequest = (r: ResourceType, delta: number) => {
    const newVal = requesting[r] + delta;
    if (newVal < 0 || newVal > 19) return;
    setRequesting({ ...requesting, [r]: newVal });
  };

  const totalOffer = ALL_RESOURCES.reduce((s, r) => s + offering[r], 0);
  const totalRequest = ALL_RESOURCES.reduce((s, r) => s + requesting[r], 0);

  return (
    <div style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 16 }}>
        <div>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Offer:</div>
          {ALL_RESOURCES.map((r) => (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <span style={{ width: 50, fontSize: 11 }}>{RESOURCE_LABELS[r]}</span>
              <button onClick={() => adjustOffer(r, -1)} style={{ width: isMobile ? 36 : 22, height: isMobile ? 36 : 22, fontSize: 10 }}>-</button>
              <span style={{ width: 16, textAlign: 'center', fontSize: 12 }}>{offering[r]}</span>
              <button onClick={() => adjustOffer(r, 1)} style={{ width: isMobile ? 36 : 22, height: isMobile ? 36 : 22, fontSize: 10 }}>+</button>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Request:</div>
          {ALL_RESOURCES.map((r) => (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <span style={{ width: 50, fontSize: 11 }}>{RESOURCE_LABELS[r]}</span>
              <button onClick={() => adjustRequest(r, -1)} style={{ width: isMobile ? 36 : 22, height: isMobile ? 36 : 22, fontSize: 10 }}>-</button>
              <span style={{ width: 16, textAlign: 'center', fontSize: 12 }}>{requesting[r]}</span>
              <button onClick={() => adjustRequest(r, 1)} style={{ width: isMobile ? 36 : 22, height: isMobile ? 36 : 22, fontSize: 10 }}>+</button>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={() => onPropose(offering, requesting)}
        disabled={totalOffer === 0 || totalRequest === 0}
        style={{
          marginTop: 8, padding: '6px 16px',
          backgroundColor: totalOffer > 0 && totalRequest > 0 ? '#f39c12' : '#bdc3c7',
          color: 'white', border: 'none', borderRadius: 4,
          cursor: totalOffer > 0 && totalRequest > 0 ? 'pointer' : 'default',
        }}
      >
        Propose Trade
      </button>
    </div>
  );
}

function formatResources(resources: ResourceCount): string {
  return ALL_RESOURCES
    .filter((r) => resources[r] > 0)
    .map((r) => `${resources[r]} ${RESOURCE_LABELS[r]}`)
    .join(', ') || 'nothing';
}
