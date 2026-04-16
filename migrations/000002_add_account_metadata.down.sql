-- Remove account metadata columns
DROP INDEX IF EXISTS idx_accounts_account_number;
ALTER TABLE accounts
    DROP COLUMN IF EXISTS account_number,
    DROP COLUMN IF EXISTS ifsc_code;
