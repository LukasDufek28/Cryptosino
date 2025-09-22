# Cryptosino Frontend

React UI for the Cryptosino games (Dice, Crash, Blackjack). Bootstrapped with Create React App.

## Prerequisites
- Node.js 18+ (match backend)

## Environment Variables
`.env`
```
REACT_APP_API_URL=http://localhost:5000
```
Only vars prefixed with `REACT_APP_` are exposed to the client bundle. If missing, `src/config.js` falls back to `http://localhost:5000`.

## Install
```
npm install
```

## Run (Development)
```
npm start
```
Launches on http://localhost:3000

## Build (Production)
```
npm run build
```
Creates optimized static files in `build/`.

## Key Files
- `src/config.js` central API base.
- `DiceGame.js`, `CrashGame.js`, `BlackjackGame.js` call backend endpoints.

## Typical Workflow
1. Start backend (default port 5000).
2. Ensure `.env` has correct `REACT_APP_API_URL` before building.
3. Run `npm start` here.
4. Use browser DevTools Network tab to debug API calls if failures.

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