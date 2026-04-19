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
| Database | PostgreSQL 16 | `SELECT ... FOR UPDATE` row locking, CHECK constraints, ACID transactions |
| Cache | Redis 7 | Balance read cache (30s TTL), idempotency key deduplication (24h TTL) — **not used for locking** |
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
│   ├── 000001_init.up.sql / .down.sql
│   ├── 000002_add_account_metadata.up.sql / .down.sql
│   └── 000003_audit_transaction_index.up.sql / .down.sql
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

### Concurrency: Postgres Row Locks + CHECK Constraint

Concurrency safety is enforced by the database, not by the application. Every balance-changing operation runs inside a single Postgres transaction that:

1. `BEGIN`s a transaction on a dedicated pooled connection.
2. `SELECT ... FOR UPDATE`s every account it will touch, in **sorted ID order** (prevents deadlock when two transfers touch the same pair of accounts in opposite directions).
3. Applies the balance changes via `UPDATE accounts SET balance = balance ± $amount`. The `CHECK (balance >= 0)` constraint rejects any UPDATE that would drive a balance negative (error code `23514` → `422 Insufficient funds`).
4. Inserts `transactions` + `audit_logs` rows in the same transaction.
5. `COMMIT`s. On any error, `ROLLBACK` rolls back every change atomically.

**Why row locks instead of a Redis distributed lock?** A Postgres row lock is held until `COMMIT`/`ROLLBACK` — it cannot expire mid-transaction. A Redis lock with a TTL can expire while the DB transaction is still running, which breaks mutual exclusion exactly when it matters most. For a single-Postgres ledger, the database is already the source of truth for balances, so the strongest and simplest guarantee is the one the database gives you for free.

**Why ordered locking?** If Transfer(A→B) locks A then waits for B, and Transfer(B→A) locks B then waits for A, Postgres will eventually break the deadlock with an error. Sorting the account IDs before locking means both transactions queue on the same row first — the second just waits for the first to commit, no deadlock possible.

**Why `pool.connect()` instead of `pool.query()`?** A transaction must run on a single connection. `pool.query()` checks a connection out per statement, which breaks transaction continuity. `pool.connect()` gives us one connection for `BEGIN` → … → `COMMIT`.

**What about the `CHECK` constraint, then?** The row lock serializes writers so no two transfers can interleave UPDATEs on the same account. The `CHECK` is the ultimate invariant: even if a future code path skips the service layer, or a migration/admin script directly UPDATEs balances, Postgres refuses to store a negative number. Locks coordinate access; constraints enforce invariants — we want both.

### Reversal: UNIQUE Constraint + Idempotency Replay

The `reversals` table has `UNIQUE(original_transaction_id)` and `UNIQUE(idempotency_key)`. Concurrency and replay semantics are enforced by the database:

- First reversal `INSERT` for a given `original_transaction_id` succeeds.
- A **retry with the same idempotency key** is caught by a pre-check (reads the existing row) and by the `UNIQUE(idempotency_key)` constraint inside the transaction — the service returns the original reversal with `201 Created`, not `409`.
- A **different client trying to reverse the already-reversed transaction** (different idempotency key) fails the `UNIQUE(original_transaction_id)` constraint — the service returns `409 Conflict — Transaction already reversed`.

Because the uniqueness check is enforced by the database, it's safe against any race condition the application might miss. The reversal flow also acquires Postgres row locks (`SELECT ... FOR UPDATE`) on the involved accounts before applying balance changes, same as transfers.

### Audit Log: Synchronous, In-Transaction

Successful balance-changing operations write their audit row in the **same Postgres transaction** as the balance change. If the transfer commits, the audit commits. If it rolls back, the audit rolls back.

Failures are written outside the transaction (no balance change happened) via a best-effort `logFailure` helper. Covered failure reasons:

| Operation | Failure reasons recorded |
|---|---|
| `TRANSFER` | `INSUFFICIENT_FUNDS`, `ACCOUNT_NOT_FOUND`, `SAME_ACCOUNT`, `VALIDATION: <detail>` |
| `DEPOSIT` | `ACCOUNT_NOT_FOUND`, `VALIDATION: <detail>` |
| `WITHDRAWAL` | `INSUFFICIENT_FUNDS`, `ACCOUNT_NOT_FOUND`, `VALIDATION: <detail>` |
| `REVERSAL` | `TRANSACTION_NOT_FOUND`, `ALREADY_REVERSED`, `INSUFFICIENT_FUNDS`, `ACCOUNT_NOT_FOUND`, `VALIDATION: <detail>` |

**Validation failures** are audited by the `validate` middleware before the service ever runs — invalid inputs (negative amount, bad UUID, missing field) still leave an audit trail so reviewers can see attempted bad requests.

**Why not a Postgres trigger?** Triggers fire on row changes, so they can't log failures. We'd need two audit systems — trigger for successes, app code for failures.

**Why not async (Kafka/outbox)?** An outbox pattern (audit row written in-transaction, drained by a worker) would be strictly stronger for production — it survives post-COMMIT crashes. For this assignment's scope, in-transaction sync writes + best-effort failure logging cover every balance-changing attempt the assignment requires.

**Known gap:** if the Node process crashes between COMMIT and response, the client won't get a response but the audit is consistent with DB state (the balance change did land). Idempotency keys let the client retry safely.

### Redis: Cache-Aside + Idempotency (No Distributed Locking)

Redis is intentionally kept out of the concurrency critical path. It's used only for:

- **Balance cache** — `GET /api/accounts` checks Redis first (30s TTL). Writes invalidate affected account caches. Offloads dashboard reads from Postgres.
- **Idempotency keys** — short-circuit duplicate requests (24h TTL) before opening a DB transaction.

Earlier iterations used a Redis `SET NX EX` distributed lock to serialize account access. That was removed because Postgres row locks (`SELECT ... FOR UPDATE`) give a strictly stronger guarantee for a single-database system — they can't expire mid-transaction — and adding Redis on top was extra machinery without extra safety.

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
