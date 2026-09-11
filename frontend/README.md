# Cryptosino Frontend

React UI for Cryptosino, with the Three.js Amber House casino at `/` and the original games in overlays or the classic lobby at `/lobby`. See [CASINO-3D.md](../CASINO-3D.md) for controls and room architecture.

## Prerequisites
- Node.js 18+ (match backend)

## Environment Variables
`.env`
```
REACT_APP_API_URL=http://localhost:5000
```
Leave REACT_APP_API_URL unset for the unified deployment. Requests default to same-origin `/api` routes. The local React development server proxies these to port 5000. Do not put backend secrets in frontend variables.

## Install
```
cd ..
npm install
```

## Run (Development)
```
npm run dev
```
Run from the repository root. Starts the frontend on http://localhost:3000 and the backend on port 5000. Open the browser yourself.

## Build (Production)
```
npm run build
```
Creates optimized static files in `build/`.

## Key Files
- `src/casino/` contains the world, generated models, movement, HUD and presence client.
- `DiceGame.js`, `CrashGame.js`, `BlackjackGame.js`, `SlotsGame.js` call backend endpoints.

## Typical Workflow
1. Put database settings in `backend/.env` when you need authenticated games.
2. Start both processes with `npm run dev` from the repository root.
3. Open http://localhost:3000 and explore without signing in, or sign in to play.
4. Shared player presence uses an optional additive migration described in CASINO-3D.md.

## Testing
```
npm test
```
(Default CRA tests; none custom yet.)

## Future Improvements
- Central API service + error handling
- Persist balance (localStorage / context)
- Loading & error states for each fetch
- Convert to TypeScript
