import type { ResourceCount, ResourceType, PlayerState } from '../types';
import { ALL_RESOURCES } from '../types';

export function emptyResources(): ResourceCount {
  return { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
}

export function addResources(a: ResourceCount, b: ResourceCount): ResourceCount {
  return {
    lumber: a.lumber + b.lumber,
    brick: a.brick + b.brick,
    wool: a.wool + b.wool,
    grain: a.grain + b.grain,
    ore: a.ore + b.ore,
  };
}

export function subtractResources(a: ResourceCount, b: ResourceCount): ResourceCount {
  return {
    lumber: a.lumber - b.lumber,
    brick: a.brick - b.brick,
    wool: a.wool - b.wool,
    grain: a.grain - b.grain,
    ore: a.ore - b.ore,
  };
}

export function hasResources(hand: ResourceCount, cost: ResourceCount): boolean {
  return ALL_RESOURCES.every((r) => hand[r] >= cost[r]);
}

export function totalResources(hand: ResourceCount): number {
  return ALL_RESOURCES.reduce((sum, r) => sum + hand[r], 0);
}

export function addResource(hand: ResourceCount, resource: ResourceType, amount: number = 1): ResourceCount {
  return { ...hand, [resource]: hand[resource] + amount };
}

export function removeResource(hand: ResourceCount, resource: ResourceType, amount: number = 1): ResourceCount {
  return { ...hand, [resource]: hand[resource] - amount };
}

/** Give resources from bank to player, returning updated bank and player */
export function giveResourcesToPlayer(
  bank: ResourceCount,
  player: PlayerState,
  resources: ResourceCount,
): { bank: ResourceCount; player: PlayerState } {
  return {
    bank: subtractResources(bank, resources),
    player: {
      ...player,
      resources: addResources(player.resources, resources),
    },
  };
}

/** Take resources from player to bank */
export function takeResourcesFromPlayer(
  bank: ResourceCount,
  player: PlayerState,
  resources: ResourceCount,
): { bank: ResourceCount; player: PlayerState } {
  return {
    bank: addResources(bank, resources),
    player: {
      ...player,
      resources: subtractResources(player.resources, resources),
    },
  };
}

/** Get list of resource types the player has at least 1 of */
export function availableResources(hand: ResourceCount): ResourceType[] {
  return ALL_RESOURCES.filter((r) => hand[r] > 0);
}
