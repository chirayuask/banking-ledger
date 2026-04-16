-- Seed data: create test accounts with initial balances
-- This runs automatically on first docker compose up via init scripts

-- Only seed if accounts table is empty
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM accounts LIMIT 1) THEN
        INSERT INTO accounts (name, account_number, ifsc_code, balance) VALUES
            ('Alice',    '1234567890', 'SBIN0001234', 10000),     -- $100.00
            ('Bob',      '9876543210', 'HDFC0002345', 5000),      -- $50.00
            ('Charlie',  '5678901234', 'ICIC0003456', 20000),     -- $200.00
            ('Treasury', '0000000001', 'RBIS0000001', 100000);    -- $1000.00 (system account)
    END IF;
END $$;
