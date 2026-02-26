import type { TerrainType } from '@engine/types';

export const TERRAIN_GRADIENT_STOPS: Record<TerrainType, { light: string; mid: string; dark: string }> = {
  forest:    { light: '#4a9e4a', mid: '#2d7a2d', dark: '#1a5c1a' },
  hills:     { light: '#d87a50', mid: '#b85a30', dark: '#8e3a18' },
  pasture:   { light: '#a0e878', mid: '#7ec850', dark: '#5aa030' },
  fields:    { light: '#f0c848', mid: '#daa520', dark: '#b08010' },
  mountains: { light: '#a0abb8', mid: '#78838e', dark: '#555e68' },
  desert:    { light: '#f5e8c8', mid: '#e8d5a8', dark: '#c8b888' },
};

export const PLAYER_GRADIENT_STOPS: { light: string; dark: string }[] = [
  { light: '#f07070', dark: '#b02020' }, // red
  { light: '#58a8e8', dark: '#1860a8' }, // blue
  { light: '#f8b848', dark: '#c87010' }, // orange
  { light: '#50d880', dark: '#189038' }, // green
];
