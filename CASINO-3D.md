# The Amber House

A procedural low-poly casino inside Cryptosino. Open the site root to explore
without a login. Sign in at a game station to open the existing game screen.

## Local launch

From `D:\Documents\ChatGPT\Cryptosino\Cryptosino`:

```powershell
npm.cmd install
npm.cmd run dev
```

Then open http://localhost:3000. The launcher starts Express on port 5000 and
React on port 3000, with a local `/api` proxy. It does not open a browser.
Backend credentials belong in `backend/.env`; never put database or JWT secrets
in frontend environment variables. The development launcher uses same-origin
API calls even if an old frontend URL is configured in your shell.

No automated tests are created or run at the user's request. Production builds
check compilation; real browser-to-browser behavior still needs browser review.

## Controls and space

- Click Make yourself at home, then use WASD to walk and the mouse to look.
- Arrow up/down also walk; arrow left/right turn. Shift walks faster.
- Space jumps while standing.
- Hold Tab in the scene to see room players, server balances, and the host badge.
  Release to close; the Players button toggles it for touch/accessibility.
  Tab keeps its normal keyboard-navigation behavior inside forms and dialogs.
- If pointer lock is unavailable, drag the scene to look around.
- E or the interaction prompt plays a nearby game, sits on a couch, or stands up.
- Escape releases the cursor or closes a game screen.
- Touch devices have movement buttons and drag-to-look controls.
- R or Return upstairs restores the initial position and clears jumping and movement; the map button toggles the map.

Start on floor 02. The west staircase descends toward the windows to the
reception floor. The center entrance opens onto the sidewalk. Floor 02 contains
four game stations and two window-facing couches. Cars circulate on two lanes.
The collection menu offers the same game screens without walking to a station.

The ground-floor back wall, left of reception, has THE FACE PLACE: a real
mirror and a coral-colored button. Approach the button and press E (or click
the interaction prompt) to randomize your face. Each page visit starts with
independently randomized pupil directions and a smile or frown. The face stays
stable while walking or signing in, and other guests receive the same face seed.
The mirror works without an account, uses a 512px reflection texture, and is
disabled upstairs to avoid an unnecessary extra scene render.

The ground-floor right wall when entering from the street holds the brass-framed
House Leaderboard. It ranks the top 10 accounts by current casino balance, with
ties ordered by account ID. Names/balances come from the database via the public
`/api/casino/leaderboard` endpoint, not the browser host. It refreshes every 30s
while the page is visible and labels cached results if a refresh fails. Guests
can read the board too. Street shop labels are mounted above shop entrances on
brass backplates, with an awning below and upper windows above the sign band.

## Code architecture

`frontend/src/casino/worldLayout.json` is the shared room manifest, consumed by
both client and server. It defines spawn, stairs, stations, seats and capacity.
`models.js` generates all furniture, cars, avatars, signage and plants.
`buildWorld.js` assembles the building and street with furniture collision bounds.
`createScene.js` owns rendering, walking, interaction and resource cleanup.
`CasinoWorld.js` owns the HUD and existing game overlays. The wallet and login
remain in App. Game outcomes still use their original backend endpoints.

`backend/casino/router.js` retains the legacy presence endpoint for old clients.
New clients use `browserRoom.js` on frontend/backend: PostgreSQL handles only
authenticated discovery, host election, leases, and WebRTC SDP exchange.
`usePresence.js` owns the transport lifecycle. Room names and balances in the Tab
list come from authenticated backend responses, never untrusted peer packets.
`frontend/src/casino/version.json` is the single casino patch version. Bump it
with each shipped patch; the HUD and HTTP room roster use the same value. The
repository `AGENTS.md` requires Codex to increment it for every casino commit
and include the new number in the commit subject, including for small changes.

## Browser-hosted rooms

To enable shared presence, use the existing database connection and explicitly
install the new schema:

```powershell
npm.cmd run migrate:casino --workspace=backend
```

Re-run this additive migration for browser hosting: it creates three
`casino_browser_*` tables as well as the earlier presence schema, and adds the
per-member client version used for patch comparisons. Use the same
database as the deployment. Builds and server startup never run migrations.

The oldest active browser on the newest reported patch automatically hosts the
room. A newer patch joining or the last newest-patch client leaving triggers a
new host generation. Guests connect to the host in a star topology. Movement
snapshots target one send every 30ms (~33Hz),
using unordered, non-retransmitted packets with sequence checks and bounded
send buffers. Discrete seat/stand, face, reset, and jump changes also use an
ordered reliable channel. The host arbitrates occupied seats and shares the
street traffic clock. Local movement/camera are never replaced by a snapshot.
Pressing T opens ephemeral room chat. Messages are capped at 100 characters,
rate-limited, relayed over the reliable WebRTC event channel, and shown as
five-second cartoon bubbles above avatars. Chat is never written to PostgreSQL.
Live slot reels use dark in-world faces rather than bright white panels. Completed
wins carry server-provided payline data so the exact winning symbols glow for
five seconds for the player and everyone watching the machine.
The Amber Joker reel uses fruit-machine symbols and a real joker card. Wallet
updates remain immediate in PostgreSQL, but the spinning player's HUD and the
HTTP room roster retain the pre-spin balance until the reels reveal the result.

The 30ms interval is not a latency guarantee: host relaying, distance, jitter,
browser scheduling and interpolation add delay. Setup may take several seconds.
HTTP setup polling runs around 800ms while connecting and 3s when connected;
high-frequency movement never touches the database. Balances refresh with the
slow authenticated roster. Both browsers must sign in with different accounts.

A closed host releases its lease; crashes expire after 12 seconds. Brief Alt-Tab
switches keep existing connections and heartbeats instead of leaving the room.
Browsers may throttle or suspend long-hidden tabs: another active browser is
then elected and WebRTC connections are rebuilt. Reconnection is not seamless:
expect a pause. Keep host and guest tabs visible for full update speed. Expired control
plane leases stop transmission, preventing an isolated old host from continuing.
World traffic time survives host changes; individual poses are sent again by
their owning clients. Offline visitors can explore solo, but are not room members.

WebRTC direct connections may expose peer IP addresses. The default uses Google's
public STUN service. Some NAT/firewall combinations need TURN; good Wi-Fi does not
remove this requirement. No relay account is provisioned automatically. Optional
backend-only `CASINO_TURN_URLS` and `CASINO_TURN_SECRET` configure a coturn-compatible
shared-secret relay. The backend issues one-hour credentials, never the shared
secret. Configure them in both the local backend environment and Vercel secrets
when needed. Do not put permanent relay secrets in frontend environment variables.

Without a working direct or relay route, the HUD reports a connection problem;
it does not pretend 30ms multiplayer is active. Browser-hosted state is cosmetic,
not cheat-proof. Chat and live 3D casino games are not implemented yet.

For later multiplayer games, retain this room/station contract and add a
dedicated room simulation service with an authoritative game clock and movement
validation. The current pose endpoint validates the shape and bounds of updates,
but trusts the client for floor and movement: presence must not authorize bets,
payouts or other economic actions. Existing game endpoints need a separate
security review before using them for competitive 3D multiplayer.

The existing Vercel configuration is retained. This version is for local review;
do not retire existing services until a later deployment has been verified.
