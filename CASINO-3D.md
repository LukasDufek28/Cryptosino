# The Amber House

A procedural low-poly casino inside Cryptosino. Open the site root to explore
without a login. Sign in at a game station to open the existing game screen.

## Local launch

From `D:\Documents\ChatGPT\Cryptosino\Cryptosino`:

```powershell
npm install
npm run dev
```

Then open http://localhost:3000. The launcher starts Express on port 5000 and
React on port 3000, with a local `/api` proxy. It does not open a browser.
Backend credentials belong in `backend/.env`; never put database or JWT secrets
in frontend environment variables. The development launcher uses same-origin
API calls even if an old frontend URL is configured in your shell.

No tests, build, browser session, database migration, or production deployment
were run for this implementation. Browser verification is left to you.

## Controls and space

- Click Make yourself at home, then use WASD to walk and the mouse to look.
- Arrow up/down also walk; arrow left/right turn. Shift walks faster.
- If pointer lock is unavailable, drag the scene to look around.
- E or the interaction prompt plays a nearby game, sits on a couch, or stands up.
- Escape releases the cursor or closes a game screen.
- Touch devices have movement buttons and drag-to-look controls.
- Return upstairs restores the initial position; the map button toggles the map.

Start on floor 02. The west staircase descends toward the windows to the
reception floor. The center entrance opens onto the sidewalk. Floor 02 contains
four game stations and two window-facing couches. Cars circulate on two lanes.
The collection menu offers the same game screens without walking to a station.

## Code architecture

`frontend/src/casino/worldLayout.json` is the shared room manifest, consumed by
both client and server. It defines spawn, stairs, stations, seats and capacity.
`models.js` generates all furniture, cars, avatars, signage and plants.
`buildWorld.js` assembles the building and street with furniture collision bounds.
`createScene.js` owns rendering, walking, interaction and resource cleanup.
`CasinoWorld.js` owns the HUD and existing game overlays. The wallet and login
remain in App. Game outcomes still use their original backend endpoints.

`backend/casino/router.js` adds a public world manifest and authenticated presence
updates. `usePresence.js` sends one update at a time and interpolates other guests.
It gracefully falls back to solo exploration if the database is unavailable.

## Optional shared-room foundation

To enable shared presence, use the existing database connection and explicitly
install the new schema:

```powershell
npm run migrate:casino --workspace=backend
```

The additive migration creates `casino_presence`; it does not modify balances
or bets. Two browsers signed in as different users will share the room. There
is one presence per user per room; multiple tabs of one user share that identity.
Positions refresh approximately every 1.5 seconds, inactive presence expires
after 12 seconds, and a transaction prevents two users reserving the same seat.
Movement is visually interpolated. This is an initial presence layer, not a
finished real-time multiplayer game server. Chat and synchronized 3D games
are not implemented in this chapter.

For later multiplayer games, retain this room/station contract and add a
dedicated room simulation service with an authoritative game clock and movement
validation. The current pose endpoint validates the shape and bounds of updates,
but trusts the client for floor and movement: presence must not authorize bets,
payouts or other economic actions. Existing game endpoints need a separate
security review before using them for competitive 3D multiplayer.

The existing Vercel configuration is retained. This version is for local review;
do not retire existing services until a later deployment has been verified.
