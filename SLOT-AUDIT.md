# Amber slots — math audit and shared machines

## Provider research

[SYNOT's official Respin Joker page](https://www.synotgames.com/games/respin-joker/)
lists 3 reels, 8 symbols, RTP configurations 85.02–98.02%, and a 500× maximum win.
Its public page does not supply reel strips, per-stop weights, or a complete
mathematical specification. Our Joker uses six symbols. The existing five-reel,
ten-line “Golden Book” also has no verified provider/version mapping.

These are **Amber Joker** and **Amber Book**: custom games, not licensed or certified
SYNOT replicas. Similar RTP does not imply identical volatility, bonuses or odds.
The user approved custom tuning toward stronger ordinary wins when exact math
was unavailable.

## Million-round validation

Run from the repository root:

```powershell
node backend/audit-slots.js 1000000 cryptosino-independent-validation-v2
```

This executes the settlement engine (`backend/slots/math.js`) and configuration
displayed by the frontend (`frontend/src/slots/config.json`). It uses synthetic
seeds and a $10 stake; no secrets, database connections, balance changes or real
bets. `backend/simulate-slots.js` delegates here instead of duplicating the math.

Final version: `amber-v2`. SHA-256 of math.js plus config.json:
`d63f9e7577420c5a829aece8b10c4482d47b1b1d3d88a69805b4f6529ef00b38`.

| Measure | Amber Joker | Amber Book |
| --- | ---: | ---: |
| Independent validation rounds | 1,000,000 | 1,000,000 |
| Measured RTP | 95.70888% | 96.26718% |
| Approximate 95% interval | 95.24652–96.17124% | 95.98368–96.55068% |
| Any payout | 37.2258% | 47.8535% |
| Return greater than stake | 37.2258% | 47.1336% |
| Positive return below stake | 0 | 0 |
| Break-even spins | 0 | 7,199 |
| Free respin trigger | 18.6615% | None |
| Largest observed return / stake | 35.2× | 31.2× |

These are simulation estimates, not exact/certified theoretical RTP. Intervals
use sample variance and a normal approximation. Observed maxima are not maximum
possible returns. RTP is long-run returned money divided by staked money, not
the chance of winning or a guarantee for a session.

Original engine: 1,000,000 rounds per variant, seed `cryptosino-public-audit-v1`,
stake $10. RTP 96.51434% / 96.90932%, hit frequency 37.3230% / 47.7818%, profitable
spin frequency 18.8348% / 27.4626%. It returned less than the stake on 184,815
Joker and 192,778 Book spins. Many displayed wins were net losses. Final validation
uses an independent seed; minor hit-frequency differences are sampling noise.

Reel strips were retained. Common line awards increased, funded by smaller rare
awards. This changes the payout distribution, not balance-dependent odds. At
similar RTP and hit frequency, the arithmetic average across all hits cannot
rise much; ordinary hits improve at the expense of the upper tail. These games
have no progressive jackpot.

## Probabilities and combinations

Initial nominal stop probabilities, before Joker's conditional respin:

| Joker symbol | Reel 1 | Reel 2 | Reel 3 | Three-match line award |
| --- | ---: | ---: | ---: | ---: |
| JOKER | 2/30 | 2/30 | 2/30 | 170× |
| 7 | 4/30 | 4/30 | 4/30 | 25× |
| BAR | 4/30 | 4/30 | 4/30 | 16× |
| BELL | 6/30 | 7/30 | 6/30 | 9× |
| WATER | 8/30 | 7/30 | 8/30 | 6× |
| CHERRY | 6/30 | 6/30 | 6/30 | 6× |

Book's five reels each contain BOOK 2/30, SCARAB 3/30, ACE 4/30,
KING/QUEEN/JACK each 5/30, and TEN 6/30. The shared config contains exact ordering,
paylines and full 3/4/5-match paytables; both game interfaces display the paytables.

Visible rows on a reel are correlated neighboring stops, not independent draws.
The audit preserves the tiny modulo-reduction bias of the HMAC stop selector.
Matching starts on reel 1, left to right, with wild substitution. Only the highest
eligible award per line pays, including a better wild-only prefix. Stake is split
over five Joker or ten Book paylines: a 6× Joker line returns 1.2× total stake.

A center-row Joker locks its reel for one free respin of the other reels, unless
all three are locked. The respin replaces the initial result; awards are not added.
Book scatters count across the grid and return an additional 1×/3×/10× total stake
for 3/4/5+ BOOKs. Three scatters alone break even. No Book free spins. The old UI
incorrectly advertised 2×/5×/25× scatters; both interfaces now match settlement.

The audit prints award counts and payouts for every symbol/count combination,
return buckets and reel probabilities. Award counts are not distinct winning
spins: one spin can pay several lines plus a scatter.

## Shared 3D play

- Cabinets and stools are against the upstairs rear wall. Approach a stool and
  press E; the server reserves it, the avatar sits with bent legs, and compact
  stake/paytable controls appear while the world remains visible.
- Curved reels stop on the server result, including Joker's initial result, held
  reels and respin. Late viewers catch up using server timestamps.
- WebRTC carries refresh hints, never trusted payouts. Spectators fetch API state.
  One-second polling is a fallback, not a promise of 30 ms end-to-end latency.
  Existing WebRTC connectivity limitations still apply to moving avatars.
- Seats have 15-second leases, renewed about every 5 seconds. Running spins stay
  reserved until finished even if the player stands or disconnects.
- Wallet, bet record, public result and idempotent request record commit in one
  transaction. An uncertain request can retry its UUID without a second charge.
  Browser hosts never determine payouts.
- The legacy slots page uses the same new math; independent legacy spins are not
  attached to a physical cabinet.

## Local rollout — not pushed or migrated automatically

Two additive tables are required: `casino_slot_machines` and `casino_slot_requests`.
The migration retains existing tables and verifies all six casino tables. Configure
backend/.env privately for the intended database, then run from the repository root:

```powershell
npm.cmd run migrate:casino --workspace=backend
npm.cmd run dev
```

Verify the database target before running this: the migration affects whichever
database backend/.env selects. It does not reset accounts or balances. Run it
before deploying the backend, including the legacy slots page. Idempotency records
are retained; monitor database growth before introducing a retention policy.

Validation: million-round simulations and production compilation. No browser or
multiplayer gameplay tests were run. Browser checks remain: two distinct accounts,
simultaneous claims, spectator reels/respin, interrupted-response recovery,
standing/reseating, and reconnecting during a spin.
