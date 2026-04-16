-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Accounts table
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT balance_non_negative CHECK (balance >= 0)
);

-- Transactions table (ledger of money movements)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL,
    source_account_id UUID REFERENCES accounts(id),
    dest_account_id UUID REFERENCES accounts(id),
    amount BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    idempotency_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT amount_positive CHECK (amount > 0),
    CONSTRAINT valid_type CHECK (type IN ('TRANSFER', 'DEPOSIT', 'WITHDRAWAL')),
    CONSTRAINT valid_status CHECK (status IN ('SUCCESS', 'REVERSED'))
);

-- Reversals table (one reversal per transaction, enforced by UNIQUE)
CREATE TABLE reversals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id),
    idempotency_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation VARCHAR(20) NOT NULL,
    source_account_id UUID,
    dest_account_id UUID,
    amount BIGINT NOT NULL,
    outcome VARCHAR(10) NOT NULL,
    failure_reason VARCHAR(255),
    transaction_id UUID REFERENCES transactions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_operation CHECK (operation IN ('TRANSFER', 'DEPOSIT', 'WITHDRAWAL', 'REVERSAL')),
    CONSTRAINT valid_outcome CHECK (outcome IN ('SUCCESS', 'FAILURE'))
);

-- Indexes for query performance
CREATE INDEX idx_transactions_source ON transactions(source_account_id);
CREATE INDEX idx_transactions_dest ON transactions(dest_account_id);
CREATE INDEX idx_transactions_idempotency ON transactions(idempotency_key);
CREATE INDEX idx_reversals_original_txn ON reversals(original_transaction_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_source ON audit_logs(source_account_id);
CREATE INDEX idx_audit_logs_dest ON audit_logs(dest_account_id);
