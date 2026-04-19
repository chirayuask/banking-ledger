# Banking Ledger with Concurrency

A banking-style application where accounts hold balances and money moves between accounts safely under concurrent operations. Features transfers, deposits, withdrawals, reversals, and a complete audit trail.

---

## Setup from a New Machine

### 1. Prerequisites

**Install Homebrew** (if not already installed):
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Install Node.js, PostgreSQL, and Redis:**
```bash
brew install node
brew install postgresql@16
brew install redis
```

**Add PostgreSQL to your PATH** (add to `~/.zshrc`):
```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 2. Start Services

```bash
brew services start postgresql@16
brew services start redis
```

Verify they're running:
```bash
pg_isready          # should print "accepting connections"
redis-cli ping      # should print "PONG"
```

### 3. Create Database and User

```bash
psql postgres -c "CREATE USER banking WITH PASSWORD 'banking123';"
psql postgres -c "CREATE DATABASE banking_ledger OWNER banking;"
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE banking_ledger TO banking;"
```

### 4. Clone and Install

```bash
git clone <your-repo-url> banking-ledger
cd banking-ledger
npm install
cd frontend && npm install && cd ..
```

Or use the shortcut:
```bash
make install
```

### 5. Run Migrations and Seed

```bash
make migrate-up      # creates tables (accounts, transactions, reversals, audit_logs)
make seed            # inserts test accounts (Alice ₹100, Bob ₹50, Charlie ₹200, Treasury ₹1000)
```

### 6. Start the Application

**Terminal 1 — Backend** (runs on http://localhost:8080):
```bash
make dev
```

**Terminal 2 — Frontend** (runs on http://localhost:5173):
```bash
cd frontend && npm run dev
```

Open http://localhost:5173 in your browser.

### 7. Test Concurrency

```bash
make test-concurrency
```

This runs 3 automated tests:
- 20 concurrent ₹10 transfers from one account — verifies only 10 succeed, no overdraft
- 5 concurrent reversals on the same transaction — verifies only 1 applies
- 10 concurrent ₹10 deposits to the same account — verifies all apply correctly

---

## Architecture

```
┌─────────────┐              ┌──────────────────────────────┐
│  React UI   │───REST/JSON──│     Node.js + Express        │
│  (Vite)     │              │                              │
└─────────────┘              │  Route → Controller →        │
                             │  Service → Repository        │
                             └──────────────┬───────────────┘
                                            │
                              ┌─────────────┴──────────────┐
                              ▼                            ▼
                       ┌───────────┐              ┌─────────────┐
                       │   Redis   │              │  PostgreSQL  │
                       │ • Balance  │              │ • accounts   │
                       │   cache   │              │ • transactions│
                       │ • Idemp.  │              │ • reversals  │
                       │   keys    │              │ • audit_logs │
                       └───────────┘              └─────────────┘
```

### Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Backend | Node.js 22 + Express 5 (ESM) | Modern JS — `import/export`, top-level `await`, `??`, `?.` |
| Database | PostgreSQL 16 | `SELECT FOR UPDATE` row locking, CHECK constraints, ACID transactions |
| Cache | Redis 7 | Balance read cache (30s TTL), idempotency key deduplication (24h TTL) |
| DB Driver | `pg` (node-postgres) | Mature, connection pooling, explicit transaction control via `pool.connect()` |
| Frontend | React + TypeScript + Vite + Tailwind CSS 4 | Fast dev cycle, type safety, functional UI |

### Project Structure

```
banking-ledger/
├── src/
│   ├── server.js                      # Entry point — Express app, graceful shutdown
│   ├── config/
│   │   ├── index.js                   # Environment config (dotenv)
│   │   └── logger.js                  # Winston logger
│   ├── routes/                        # Route definitions (wires middleware + controllers)
│   │   ├── index.js                   # Mounts all sub-routers under /api
│   │   ├── account.routes.js
│   │   ├── transfer.routes.js
│   │   ├── reversal.routes.js
│   │   ├── transaction.routes.js
│   │   └── audit.routes.js
│   ├── controllers/                   # Thin — parse request, call service, send response
│   │   ├── account.controller.js
│   │   ├── transfer.controller.js
│   │   ├── reversal.controller.js
│   │   ├── transaction.controller.js
│   │   └── audit.controller.js
│   ├── service/                       # Business logic — transaction orchestration
│   │   ├── transfer.js                # Transfer + Deposit + Withdrawal (FOR UPDATE, ordered locking)
│   │   ├── reversal.js                # Reversal with UNIQUE constraint idempotency
│   │   ├── account.js
│   │   ├── transaction.js
│   │   └── audit.js
│   ├── repository/                    # Raw SQL queries via pg
│   │   ├── account.js
│   │   ├── transaction.js
│   │   ├── reversal.js
│   │   └── audit.js
│   ├── middleware/
│   │   ├── validate.js                # Generic validation middleware factory
│   │   ├── schemas/                   # Declarative validation schemas per domain
│   │   │   ├── account.js
│   │   │   ├── transfer.js
│   │   │   └── reversal.js
│   │   ├── errorHandler.js
│   │   └── requestLogger.js
│   ├── pkg/redis/                     # Standalone Redis package
│   │   ├── client.js                  # Connection init, close, low-level get/set/del
│   │   └── cache.js                   # App-level cache (accounts, idempotency keys)
│   └── db/
│       ├── postgres.js                # Pool + BIGINT type parser
│       ├── migrate.js                 # SQL migration runner (up/down)
│       └── seed.js                    # Test data seeder
├── migrations/
│   ├── 000001_init.up.sql
│   └── 000001_init.down.sql
├── scripts/
│   ├── seed.sql
│   └── concurrency_test.sh
└── frontend/                          # React + TypeScript + Vite + Tailwind
```

---

## Design Decisions & Trade-offs

### Money Representation: Integer Cents

Balances are stored as `BIGINT` in PostgreSQL, representing **paisa** (`₹100.00` = `10000`). The `pg` driver is configured to parse BIGINT as JavaScript `Number` (safe up to ~₹90 trillion). The frontend converts paisa to rupees for display.

**Trade-off:** For a real multi-currency system, `DECIMAL(19,4)` with a currency column would be more appropriate. Integer paisa is sufficient for single-currency INR.

### Concurrency: Redis Distributed Lock + Postgres Transaction + CHECK Constraint

Concurrency safety is enforced by **three independent layers**, not one. Each layer catches a different failure mode.

**Flow for a transfer:**

1. Check idempotency key (Redis) — short-circuit if this request already ran.
2. Acquire **Redis distributed lock** on each involved account, keys sorted in a canonical order (prevents deadlocks across workers).
3. `const client = await pool.connect()` — checkout a dedicated connection.
4. `BEGIN` a Postgres transaction.
5. `UPDATE accounts SET balance = balance - $amount WHERE id = $src` — atomic decrement. The `CHECK (balance >= 0)` constraint rejects the row if the result would be negative (Postgres error code `23514`). The service maps this to `422 Insufficient funds`.
6. `UPDATE accounts SET balance = balance + $amount WHERE id = $dst` — atomic increment.
7. Insert `transactions` row + `audit_logs` row (same transaction).
8. `COMMIT`. On any error, `ROLLBACK` and the balance changes disappear.
9. `client.release()` returns the connection to the pool.
10. Release the Redis locks (Lua script, only deletes if we still own the lock token — prevents releasing a lock that already expired and was re-acquired by someone else).

**What each layer guarantees:**

| Layer | What it protects against |
|-------|--------------------------|
| Redis lock (`SET NX EX`) on sorted account IDs | Two workers trying to modify the same account at the same moment; ordered acquisition prevents deadlock when two transfers touch the same pair of accounts in opposite directions |
| Postgres transaction (`BEGIN`/`COMMIT`/`ROLLBACK`) | Atomicity — the debit, credit, transaction row, and audit row either all persist or none do |
| `CHECK (balance >= 0)` constraint | Final safety net — even if the Redis lock failed, crashed, or a bug skipped it, the DB will reject any UPDATE that would drive a balance negative |

**Why Redis locks instead of `SELECT ... FOR UPDATE`?**

Row-level locks in Postgres only coordinate transactions on the same database. Redis gives us a single, cheap choke point across all backend workers and is easy to reason about — `SET key value NX EX 5` with a random token, released by a Lua script that compares the token before deleting.

The trade-off is that Redis locks are **advisory**: if a worker skips the lock, Postgres won't stop it. That's why the `CHECK` constraint is non-negotiable — it's the invariant that holds even if every application-layer guard fails.

**Why ordered lock acquisition?** If Transfer(A→B) acquires lock A then asks for B, and Transfer(B→A) acquires lock B then asks for A, both spin until their retry budget runs out. By always acquiring locks in sorted key order, the second transfer queues on lock A and proceeds cleanly after the first releases.

**Why `pool.connect()` instead of `pool.query()`?** We need multiple queries within the same transaction on the same connection. `pool.query()` grabs and releases a connection per query — no transaction continuity.

**Lock parameters** (see [src/pkg/redis/client.js](src/pkg/redis/client.js)):
- `LOCK_TTL = 5s` — auto-expires if the holder crashes, so the account is never permanently stuck.
- `retries = 50`, `retryDelayMs = 100ms` — up to ~5s waiting for a contended lock before giving up.
- Unique UUID token per lock acquisition — `safeRelease` only deletes the key if the token still matches, so we never free someone else's lock.

### Reversal: UNIQUE Constraint as the Concurrency Guard

The `reversals` table has `UNIQUE(original_transaction_id)` and `UNIQUE(idempotency_key)`. The reversal flow also acquires Redis locks on the involved accounts (same pattern as transfers), but the **true concurrency guarantee lives in the DB constraint**:

- First reversal `INSERT` for a given `original_transaction_id` succeeds.
- Any concurrent or duplicate reversal `INSERT` fails with Postgres error code `23505` (unique_violation).
- The service catches `23505`, rolls back, and returns `409 Conflict — Transaction already reversed`.

Because the uniqueness check is enforced by the database, it's safe against any race condition the application might miss — including two requests that pass the Redis lock at the exact same moment or requests from two machines when Redis is unreachable.

### Audit Log: Synchronous, In-Transaction

Audit logs are written in the **same Postgres transaction** as the balance changes. If the transfer commits, the audit commits. If it rolls back, the audit rolls back.

For **failures** (insufficient funds, invalid account), the audit log is written outside the transaction since no balance change occurred.

**Why not a Postgres trigger?** Triggers fire on row changes, so they can't log failures (no row change happens). We'd need two audit systems — trigger for successes, app code for failures.

**Why not async (Kafka/Redis Streams)?** Async audit risks losing entries if a worker crashes. The assignment requires all operations to be auditable. Synchronous writes ensure completeness.

### Redis: Cache-Aside + Idempotency

**Balance cache:** `GET /api/accounts` checks Redis first (30s TTL). Any write operation invalidates affected account caches. This offloads read-heavy dashboard requests from Postgres.

**Idempotency keys:** Stored in Redis with 24h TTL. Duplicate requests are caught before even opening a DB transaction.

### Balance Floor: CHECK Constraint

`CHECK (balance >= 0)` on the accounts table is a database-level safety net. Even if application logic has a bug, Postgres will reject a negative balance.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/accounts` | List all accounts |
| `POST` | `/api/accounts` | Create account — `{ name, initial_balance }` |
| `GET` | `/api/accounts/:id` | Get single account |
| `POST` | `/api/transfers` | Transfer — `{ source_account_id, dest_account_id, amount, idempotency_key }` |
| `POST` | `/api/deposits` | Deposit — `{ account_id, amount, idempotency_key }` |
| `POST` | `/api/withdrawals` | Withdraw — `{ account_id, amount, idempotency_key }` |
| `POST` | `/api/reversals` | Reverse — `{ transaction_id, idempotency_key }` |
| `GET` | `/api/transactions` | List transactions — `?account_id=&limit=&offset=` |
| `GET` | `/api/audit-logs` | List audit logs — `?account_id=&limit=&offset=` |

All amounts are in **paisa** (integer). `₹10.00` = `1000`.

---

## Concurrency Testing

### Automated Script

```bash
make test-concurrency
```

**Test 1 — Parallel Transfers (overdraft prevention):**
Creates Account A (₹100) and B (₹0), fires 20 concurrent ₹10 transfers A→B.
- Expected: A = ₹0, B = ₹100, exactly 10 succeed, 10 fail with `INSUFFICIENT_FUNDS`
- Audit log has 20 entries (10 SUCCESS + 10 FAILURE)

**Test 2 — Double Reversal Prevention:**
Performs one transfer, fires 5 concurrent reversals for the same transaction.
- Expected: exactly 1 reversal applied, balances restored

**Test 3 — Concurrent Deposits:**
Fires 10 concurrent ₹10 deposits to the same account.
- Expected: balance = ₹100, 10 success entries

### Manual Testing

1. Open two browser tabs at http://localhost:5173
2. In both, go to **Operations → Transfer**
3. Set up the same transfer (e.g., ₹50 from Alice to Bob)
4. Click submit in both tabs simultaneously
5. If Alice only had ₹50, only one should succeed
6. Check the **Audit Log** tab — one SUCCESS and one FAILURE entry

---

## Assumptions

1. **Single currency (INR)** — balances stored as integer paisa
2. **No authentication/authorization** — this is a demo application
3. **Balance floor is 0** — accounts cannot go negative (no overdraft)
4. **Deposits come from outside the system** — no source account required
5. **Reversals are full reversals** — no partial reversal support
6. **Idempotency keys are client-provided** — duplicates return the original result
7. **Reversal of a deposit requires sufficient balance** — if the deposited amount was already spent, the reversal fails

---

## What Would Change at Scale

- **Partitioned audit_logs table** by date range to manage table growth
- **Read replicas** for list/read endpoints
- **Kafka/Redis Streams** for async audit writes with at-least-once delivery
- **Connection pooling** with PgBouncer in front of Postgres
- **Rate limiting** per account via Redis to prevent abuse
- **Cursor-based pagination** instead of limit/offset for large datasets
- **Distributed tracing** (OpenTelemetry) for observability
