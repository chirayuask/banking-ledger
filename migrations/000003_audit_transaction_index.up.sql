-- Faster lookup of all audit entries tied to a given transaction
-- (e.g. "show me the full history of this transfer and its reversal").
CREATE INDEX IF NOT EXISTS idx_audit_logs_transaction_id
  ON audit_logs(transaction_id);
