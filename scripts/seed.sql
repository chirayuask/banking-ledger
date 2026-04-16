-- Seed data: create test accounts with initial balances
-- This runs automatically on first docker compose up via init scripts

-- Only seed if accounts table is empty
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM accounts LIMIT 1) THEN
        INSERT INTO accounts (name, balance) VALUES
            ('Alice', 10000),     -- $100.00
            ('Bob', 5000),        -- $50.00
            ('Charlie', 20000),   -- $200.00
            ('Treasury', 100000); -- $1000.00 (system account for deposits/withdrawals)
    END IF;
END $$;
