# Amber Exchange

A new walk-in, low-poly trading facility beside the casino. From the street,
facing the casino entrance, it is on the right (+X): footprint x=18..36,
z=-10..10, doorway x=27. Go downstairs, leave the casino, follow the pavement,
enter Amber Exchange and press E near one of its three terminals. Ground-floor
minimap includes the new building. Normal multiplayer movement/chat also works
there through the existing room transport and its existing connection limitations.

## Gameplay

Three fictional assets: AMBR (Amber Index), NEON (Neon Energy), FLUX (Flux Labs).
Buy whole units using existing game credits; sell owned units to realize a profit
or loss. No real market feeds, deposits, withdrawals, short selling or leverage
are introduced. Profits are not guaranteed. Cash, holdings, equity, cost basis,
unrealized P/L and the last 20 fills are displayed at the terminal.

The server generates independent bounded price changes every five seconds with
cryptographic randomness. Maximum single-tick changes before cent rounding:
AMBR +/-0.4%, NEON +/-0.9%, FLUX +/-1.6%. Prices are bounded to $1..$10,000.
All players share the same persisted market; browser hosts do not choose prices.
This is a simple fictional random-walk game, not a realistic market simulator.
Trade volume does not move prices. No long-term positive return is promised.

An approximately 0.2% bid/ask spread applies (rounding to whole cents widens it
for cheaper assets); no additional fee. Submitted quotes expire after three ticks
(roughly 15 seconds). Displayed ask/bid is the order's strict price limit: an
adverse move rejects the order, a favorable move may improve its execution price.
Orders are immediately filled or rejected, not resting limit orders.

## Storage and correctness

`backend/trading/router.js`: `/api/trading/market`, authenticated `/account`,
authenticated `POST /orders`. Prices, portfolios and order receipts live in
PostgreSQL. The shared market advances lazily under a transaction lock when
requested; no dedicated server process or third-party price provider is needed.
On long inactivity, catch-up is capped to the last 120 ticks. Older dormant
intervals are omitted; the generator does not simulate every offline second.
The chart retains 120 ticks (about ten minutes while active).

Order IDs are unique per user. Retrying the same UUID returns the original fill
without another debit. The browser stores pending order payloads (no credentials)
in sessionStorage to recover uncertain responses after closing/reloading a terminal.
Orders, holdings and cash changes commit atomically. All amounts use integer cents
and whole units. Sales remove a proportional rounded cost basis; final liquidation
removes the remainder. Requests permit 1..10,000 units and holdings are capped at
10,000,000 units per asset. Position/order records survive API restarts.

The cash-reset endpoint now shares the wallet lock and refuses a refill while
any trading holdings remain. Otherwise buying assets, resetting cash and selling
would manufacture unlimited credits. Existing account balances are not reset
or changed by this migration. Public casino leaderboards remain cash-based;
the trading interface separately displays portfolio equity.

## Installation and validation

The existing casino migration now adds `trading_market`, `trading_positions`,
`trading_orders` and an index, and verifies all eight current casino/trading tables.
Keep credentials private in backend/.env. Confirm it points at the intended DB.
From the repository root, before running/deploying this backend:

```powershell
npm.cmd run migrate:casino --workspace=backend
npm.cmd run dev
```

Migration is additive. Do not remove the new tables while players own assets.
They contain their holdings and order audit records. Run this migration before
deploying the new backend; the cash-reset guard also depends on the new tables.

The market is fetched every two seconds only when the local player is near the
facility; hidden tabs stop polling. This is five-second market data, not 30 ms
trading updates. A wall board and the terminal show the same server feed.

Validation: backend syntax checks and production frontend build. On 2026-09-15,
missing trading tables were confirmed as the cause of HTTP 503. The additive casino
migration was applied to the configured database and verified. The live proxied
market endpoint returned all three assets successfully.

Database integration tests cover market/account loading, buy/sell settlement,
idempotent retries, overselling, insufficient funds, fractional quantities,
expired quotes and adverse price limits. They use an isolated schema in a rolled-back
transaction, with synthetic test credits; existing player accounts are untouched.
Run explicitly against your configured database:

```powershell
$env:RUN_TRADING_DB_TESTS='1'
node --test backend/trading/integration.test.js
```

No production trades, commit or push were performed. Browser verification remains:
walk in through the doorway,
open a terminal with E, buy/sell, compare prices with a second player, recover an
interrupted order, and confirm the cash reset refuses while holding assets.
