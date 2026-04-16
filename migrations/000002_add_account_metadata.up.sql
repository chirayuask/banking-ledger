-- Add account metadata: account_number and ifsc_code
ALTER TABLE accounts
    ADD COLUMN account_number VARCHAR(20) NOT NULL DEFAULT '',
    ADD COLUMN ifsc_code VARCHAR(11) NOT NULL DEFAULT '';

-- Create unique index on account_number (non-empty values only)
CREATE UNIQUE INDEX idx_accounts_account_number ON accounts(account_number) WHERE account_number != '';
