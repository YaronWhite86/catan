# CLAUDE.md - Catan Web Application

## Project Overview
Web-based Settlers of Catan (base game, 3-4 players, local hot-seat).
TypeScript + React + Vite. SVG board rendering.

## Tech Stack
- **Runtime**: TypeScript (strict mode), React 18+
- **Build**: Vite
- **Test**: Vitest + @testing-library/react
- **Rendering**: SVG (no Canvas, no animation libraries)
- **State**: React useReducer with game engine reducer

## Architecture: STRICT Engine/UI Separation
`src/engine/` MUST NEVER import from `src/ui/`, React, or any DOM API.
The engine is a pure TypeScript library: `(state, action) => state`.
No side effects, no randomness outside the seeded PRNG.

`src/ui/` reads engine state and dispatches engine actions.
UI-only state (hover, placement mode) lives in React useState, NOT GameState.

## Game State is Immutable
Reducer always returns new objects via spread. NEVER mutate state.

## Coordinate System
- Hexes: axial coordinates (q, r), pointy-top
- Vertices/edges: integer IDs (0-53 / 0-71), pre-computed in BoardTopology
- BoardTopology is built once at game start and never changes

## Commands
- `npm run dev` — dev server
- `npm run build` — production build
- `npm run test` — tests (watch mode)
- `npm run test:run` — tests once
- `npm run lint` — ESLint

## File Naming
- Engine: kebab-case (`longest-road.ts`)
- React: PascalCase (`BoardSVG.tsx`)
- Tests: `<name>.test.ts`
- Types: centralized in `types.ts`, not in component files

## Key Game Rules
- Bank: 19 of each resource. If bank can't fulfill all for a hex, NO ONE gets any.
- Longest road: min 5, broken by opponent buildings, DFS on edges not vertices.
- Largest army: min 3 knights played.
- Dev cards: max 1 play/turn, can't play card bought this turn. VP cards secret until win.
- Pieces per player: 5 settlements, 4 cities, 15 roads.
- Setup: snake draft. Second settlement grants initial resources.
- Roll 7: discard if >7 cards (half rounded down), move robber, steal.
- Maritime trade: 4:1 default, 3:1 generic port, 2:1 specific port.

## Common Pitfalls
- Do NOT put UI interaction state into GameState.
- Do NOT generate random numbers outside the seeded PRNG.
- Distance rule: no building within 1 EDGE of another.
- Road connectivity: opponent buildings BLOCK traversal.
- Longest road: track visited EDGES not vertices.
- Win check: include hidden VP cards for current player only.
