import { useState, useCallback } from 'react';
import type { GameState, VertexId, EdgeId, HexId } from '@engine/types';
import type { GameAction } from '@engine/actions';
import { PLAYER_COLORS } from '@engine/constants';
import { BoardSVG } from './Board/BoardSVG';
import { PlayerPanel } from './PlayerPanel/PlayerPanel';
import { GameLog } from './Status/GameLog';
import { DiceDisplay } from './Status/DiceDisplay';
import { TradePanel } from './Trade/TradePanel';
import { DiscardDialog } from './Dialogs/DiscardDialog';
import { StealDialog } from './Dialogs/StealDialog';
import { MonopolyDialog } from './Dialogs/MonopolyDialog';
import { YearOfPlentyDialog } from './Dialogs/YearOfPlentyDialog';
import { WinnerDialog } from './Dialogs/WinnerDialog';
import { useValidActions } from '../hooks/useValidActions';
import type { PlacementMode } from '../hooks/useValidActions';

interface GameProps {
  state: GameState;
  dispatch: (action: GameAction) => void;
  error: string | null;
  onNewGame: () => void;
}

export function Game({ state, dispatch, error, onNewGame }: GameProps) {
  const [placementMode, setPlacementMode] = useState<PlacementMode>('none');
  const actions = useValidActions(state, placementMode);

  const currentPlayerName = state.players[state.currentPlayer]?.name ?? '';
  const currentColor = PLAYER_COLORS[state.currentPlayer] ?? '#333';

  const handleVertexClick = useCallback(
    (vid: VertexId) => {
      if (state.phase === 'SETUP_PLACE_SETTLEMENT') {
        dispatch({
          type: 'PLACE_SETUP_SETTLEMENT',
          player: state.currentPlayer,
          vertex: vid,
        });
      } else if (placementMode === 'settlement') {
        dispatch({
          type: 'BUILD_SETTLEMENT',
          player: state.currentPlayer,
          vertex: vid,
        });
        setPlacementMode('none');
      } else if (placementMode === 'city') {
        dispatch({
          type: 'BUILD_CITY',
          player: state.currentPlayer,
          vertex: vid,
        });
        setPlacementMode('none');
      }
    },
    [state.phase, state.currentPlayer, placementMode, dispatch],
  );

  const handleEdgeClick = useCallback(
    (eid: EdgeId) => {
      if (state.phase === 'SETUP_PLACE_ROAD') {
        dispatch({
          type: 'PLACE_SETUP_ROAD',
          player: state.currentPlayer,
          edge: eid,
        });
      } else if (state.phase === 'ROAD_BUILDING_PLACE') {
        dispatch({
          type: 'PLACE_ROAD_BUILDING_ROAD',
          player: state.currentPlayer,
          edge: eid,
        });
      } else if (placementMode === 'road') {
        dispatch({
          type: 'BUILD_ROAD',
          player: state.currentPlayer,
          edge: eid,
        });
        setPlacementMode('none');
      }
    },
    [state.phase, state.currentPlayer, placementMode, dispatch],
  );

  const handleHexClick = useCallback(
    (hid: HexId) => {
      if (state.phase === 'MOVE_ROBBER') {
        dispatch({
          type: 'MOVE_ROBBER',
          player: state.currentPlayer,
          hex: hid,
        });
      }
    },
    [state.phase, state.currentPlayer, dispatch],
  );

  const phaseLabel = getPhaseLabel(state);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Left side: Board */}
      <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 8, padding: '8px 12px', borderRadius: 8,
          backgroundColor: `${currentColor}20`, border: `2px solid ${currentColor}`,
        }}>
          <div>
            <span style={{ fontWeight: 'bold', color: currentColor }}>{currentPlayerName}</span>
            <span style={{ marginLeft: 8, color: '#666', fontSize: 14 }}>{phaseLabel}</span>
          </div>
          <DiceDisplay dice={state.lastRoll} />
        </div>

        {error && (
          <div style={{
            padding: '8px 12px', backgroundColor: '#fdedec',
            border: '1px solid #e74c3c', borderRadius: 6, marginBottom: 8,
            color: '#c0392b', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <div style={{ flex: 1 }}>
          <BoardSVG
            state={state}
            validVertices={actions.validVertices}
            validEdges={actions.validEdges}
            validHexes={actions.validHexes}
            onVertexClick={handleVertexClick}
            onEdgeClick={handleEdgeClick}
            onHexClick={handleHexClick}
          />
        </div>
      </div>

      {/* Right side: Controls */}
      <div style={{
        width: 320, padding: 16, backgroundColor: '#f8f9fa',
        borderLeft: '1px solid #ddd', overflowY: 'auto',
      }}>
        {/* Action buttons */}
        <div style={{ marginBottom: 16 }}>
          {state.phase === 'ROLL_DICE' && (
            <button
              onClick={() => dispatch({ type: 'ROLL_DICE', player: state.currentPlayer })}
              style={{
                width: '100%', padding: '14px', fontSize: 18,
                backgroundColor: '#e67e22', color: 'white',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Roll Dice
            </button>
          )}

          {state.phase === 'TRADE_BUILD_PLAY' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <BuildButton
                  label="Road"
                  cost="1L 1B"
                  enabled={actions.canBuildRoad}
                  active={placementMode === 'road'}
                  onClick={() => setPlacementMode(placementMode === 'road' ? 'none' : 'road')}
                />
                <BuildButton
                  label="Settlement"
                  cost="1L 1B 1W 1G"
                  enabled={actions.canBuildSettlement}
                  active={placementMode === 'settlement'}
                  onClick={() => setPlacementMode(placementMode === 'settlement' ? 'none' : 'settlement')}
                />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <BuildButton
                  label="City"
                  cost="2G 3O"
                  enabled={actions.canBuildCity}
                  active={placementMode === 'city'}
                  onClick={() => setPlacementMode(placementMode === 'city' ? 'none' : 'city')}
                />
                <BuildButton
                  label="Dev Card"
                  cost="1W 1G 1O"
                  enabled={actions.canBuyCard}
                  active={false}
                  onClick={() => dispatch({ type: 'BUY_DEV_CARD', player: state.currentPlayer })}
                />
              </div>

              {/* Dev card actions */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {actions.canPlayKnight && (
                  <SmallButton label="Knight" onClick={() => dispatch({ type: 'PLAY_KNIGHT', player: state.currentPlayer })} />
                )}
                {actions.canPlayRoadBuilding && (
                  <SmallButton label="Road Building" onClick={() => dispatch({ type: 'PLAY_ROAD_BUILDING', player: state.currentPlayer })} />
                )}
                {actions.canPlayYearOfPlenty && (
                  <SmallButton label="Year of Plenty" onClick={() => dispatch({ type: 'PLAY_YEAR_OF_PLENTY', player: state.currentPlayer })} />
                )}
                {actions.canPlayMonopoly && (
                  <SmallButton label="Monopoly" onClick={() => dispatch({ type: 'PLAY_MONOPOLY', player: state.currentPlayer })} />
                )}
              </div>

              <TradePanel
                state={state}
                onMaritimeTrade={(give, receive) =>
                  dispatch({ type: 'MARITIME_TRADE', player: state.currentPlayer, give, receive })
                }
                onProposeTrade={(offering, requesting) =>
                  dispatch({ type: 'PROPOSE_DOMESTIC_TRADE', player: state.currentPlayer, offering, requesting })
                }
                onAcceptTrade={(player) =>
                  dispatch({ type: 'ACCEPT_DOMESTIC_TRADE', player })
                }
                onRejectTrade={(player) =>
                  dispatch({ type: 'REJECT_DOMESTIC_TRADE', player })
                }
              />

              <button
                onClick={() => {
                  setPlacementMode('none');
                  dispatch({ type: 'END_TURN', player: state.currentPlayer });
                }}
                style={{
                  width: '100%', padding: '10px', fontSize: 14,
                  backgroundColor: '#3498db', color: 'white',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  fontWeight: 'bold', marginTop: 4,
                }}
              >
                End Turn
              </button>
            </div>
          )}

          {state.phase === 'ROAD_BUILDING_PLACE' && (
            <div style={{
              padding: 12, backgroundColor: '#eaf2f8', borderRadius: 8,
              textAlign: 'center', fontSize: 14,
            }}>
              Place a road ({state.roadBuildingRoadsLeft} remaining)
            </div>
          )}
        </div>

        {/* Players */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#7f8c8d', textTransform: 'uppercase' }}>
            Players
          </h3>
          {state.players.map((p) => (
            <PlayerPanel
              key={p.id}
              player={p}
              isCurrentPlayer={p.id === state.currentPlayer}
              state={state}
            />
          ))}
        </div>

        {/* Scoreboard extras */}
        <div style={{ marginBottom: 16, fontSize: 13 }}>
          {state.longestRoadPlayer !== null && (
            <div style={{ padding: '4px 0' }}>
              Longest Road: <strong>{state.players[state.longestRoadPlayer].name}</strong> ({state.longestRoadLength})
            </div>
          )}
          {state.largestArmyPlayer !== null && (
            <div style={{ padding: '4px 0' }}>
              Largest Army: <strong>{state.players[state.largestArmyPlayer].name}</strong> ({state.largestArmySize})
            </div>
          )}
          <div style={{ padding: '4px 0', color: '#999' }}>
            Dev cards left: {state.devCardDeck.length}
          </div>
        </div>

        {/* Game log */}
        <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#7f8c8d', textTransform: 'uppercase' }}>
          Game Log
        </h3>
        <GameLog log={state.log} />
      </div>

      {/* Dialogs */}
      {state.phase === 'DISCARD' && state.playersNeedingDiscard.length > 0 && (
        <DiscardDialog
          state={state}
          player={state.playersNeedingDiscard[0]}
          onDiscard={(resources) =>
            dispatch({ type: 'DISCARD_RESOURCES', player: state.playersNeedingDiscard[0], resources })
          }
        />
      )}

      {state.phase === 'STEAL' && (
        <StealDialog
          state={state}
          onSteal={(victim) =>
            dispatch({ type: 'STEAL_RESOURCE', player: state.currentPlayer, victim })
          }
        />
      )}

      {state.phase === 'MONOPOLY_PICK' && (
        <MonopolyDialog
          onPick={(resource) =>
            dispatch({ type: 'PICK_MONOPOLY_RESOURCE', player: state.currentPlayer, resource })
          }
        />
      )}

      {state.phase === 'YEAR_OF_PLENTY_PICK' && (
        <YearOfPlentyDialog
          state={state}
          onPick={(r1, r2) =>
            dispatch({ type: 'PICK_YEAR_OF_PLENTY_RESOURCES', player: state.currentPlayer, resource1: r1, resource2: r2 })
          }
        />
      )}

      {state.phase === 'GAME_OVER' && (
        <WinnerDialog state={state} onNewGame={onNewGame} />
      )}
    </div>
  );
}

function BuildButton({
  label,
  cost,
  enabled,
  active,
  onClick,
}: {
  label: string;
  cost: string;
  enabled: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      style={{
        flex: 1, padding: '8px 4px', fontSize: 12,
        backgroundColor: active ? '#27ae60' : enabled ? '#ecf0f1' : '#f5f5f5',
        color: active ? 'white' : enabled ? '#2c3e50' : '#bbb',
        border: active ? '2px solid #27ae60' : '1px solid #ddd',
        borderRadius: 6, cursor: enabled ? 'pointer' : 'default',
        textAlign: 'center',
      }}
    >
      <div style={{ fontWeight: 'bold' }}>{label}</div>
      <div style={{ fontSize: 10, opacity: 0.7 }}>{cost}</div>
    </button>
  );
}

function SmallButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', fontSize: 11,
        backgroundColor: '#8e44ad', color: 'white',
        border: 'none', borderRadius: 4, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function getPhaseLabel(state: GameState): string {
  switch (state.phase) {
    case 'PRE_GAME': return 'Waiting to start';
    case 'SETUP_PLACE_SETTLEMENT': return 'Place a settlement';
    case 'SETUP_PLACE_ROAD': return 'Place a road';
    case 'ROLL_DICE': return 'Roll the dice';
    case 'DISCARD': return 'Discard cards';
    case 'MOVE_ROBBER': return 'Move the robber';
    case 'STEAL': return 'Steal a resource';
    case 'TRADE_BUILD_PLAY': return 'Trade, build, or play';
    case 'ROAD_BUILDING_PLACE': return 'Place roads';
    case 'YEAR_OF_PLENTY_PICK': return 'Pick resources';
    case 'MONOPOLY_PICK': return 'Pick a resource type';
    case 'GAME_OVER': return 'Game over!';
  }
}
