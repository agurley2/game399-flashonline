# Flash Online

React + TypeScript + Three.js starter for a 3D web game.

## Requirements

- Node.js (LTS recommended)

## Getting started

Install deps and run the dev server:

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Code entry points

- `src/components/ThreeViewport.tsx`: Three.js scene setup + render loop
- `src/App.tsx`: UI shell that hosts the viewport

## Notes

- If `node` / `npm` aren’t recognized after installing Node, open a new terminal so PATH refreshes.
