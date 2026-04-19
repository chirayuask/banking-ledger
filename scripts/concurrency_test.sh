#!/bin/bash
# Concurrency Test Script for Banking Ledger
# Tests that concurrent operations maintain correct invariants

set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"
PASS=0
FAIL=0

# Unique per-run suffix so idempotency keys don't replay prior transactions.
RUN_ID="$(date +%s)-$$"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_pass() { PASS=$((PASS+1)); echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { FAIL=$((FAIL+1)); echo -e "${RED}[FAIL]${NC} $1"; }
log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

# Helper: create an account and return its ID
# Schema requires account_number and ifsc_code; generate unique values per call.
create_account() {
    local name=$1
    local balance=$2
    local acct_num
    local ifsc
    acct_num=$(python3 -c "import random; print(''.join(random.choices('0123456789', k=10)))")
    ifsc=$(python3 -c "import random,string; print(''.join(random.choices(string.ascii_uppercase, k=4)) + '0' + ''.join(random.choices('0123456789', k=6)))")
    local result
    result=$(curl -s -X POST "$BASE_URL/api/accounts" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"$name\", \"initial_balance\": $balance, \"account_number\": \"$acct_num\", \"ifsc_code\": \"$ifsc\"}")
    echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null
}

# Helper: get account balance
get_balance() {
    local id=$1
    curl -s "$BASE_URL/api/accounts/$id" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['balance'])" 2>/dev/null
}

# Helper: count audit logs
count_audit_logs() {
    local filter=$1
    curl -s "$BASE_URL/api/audit-logs?limit=200" | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
if '$filter':
    data = [d for d in data if d.get('outcome') == '$filter']
print(len(data))
" 2>/dev/null
}

echo "========================================"
echo "  Banking Ledger Concurrency Tests"
echo "========================================"
echo ""

# ------------------------------------------
# TEST 1: Parallel Transfers (overdraft prevention)
# ------------------------------------------
log_info "TEST 1: Parallel transfers - overdraft prevention"
log_info "Creating accounts: A=₹100, B=₹0"

ACCOUNT_A=$(create_account "Test-A" 10000)
ACCOUNT_B=$(create_account "Test-B" 0)

if [ -z "$ACCOUNT_A" ] || [ -z "$ACCOUNT_B" ]; then
    log_fail "Failed to create test accounts"
    exit 1
fi

log_info "Account A: $ACCOUNT_A"
log_info "Account B: $ACCOUNT_B"
log_info "Firing 20 concurrent ₹10 transfers from A -> B..."

# Fire 20 concurrent transfers of ₹10 (1000 paisa) each
# Only 10 should succeed (A has ₹100 = 10000 paisa)
pids=()
for i in $(seq 1 20); do
    curl -s -X POST "$BASE_URL/api/transfers" \
        -H "Content-Type: application/json" \
        -d "{
            \"source_account_id\": \"$ACCOUNT_A\",
            \"dest_account_id\": \"$ACCOUNT_B\",
            \"amount\": 1000,
            \"idempotency_key\": \"test1-${RUN_ID}-transfer-$i\"
        }" -o /dev/null &
    pids+=($!)
done

# Wait for all requests to complete
for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null
done

sleep 1

# Check balances
BALANCE_A=$(get_balance "$ACCOUNT_A")
BALANCE_B=$(get_balance "$ACCOUNT_B")

log_info "Balance A: $BALANCE_A (expected: 0)"
log_info "Balance B: $BALANCE_B (expected: 10000)"

if [ "$BALANCE_A" = "0" ] && [ "$BALANCE_B" = "10000" ]; then
    log_pass "Balances are correct after concurrent transfers"
else
    log_fail "Balances are incorrect! A=$BALANCE_A, B=$BALANCE_B"
fi

# Verify total is conserved
TOTAL=$((BALANCE_A + BALANCE_B))
if [ "$TOTAL" = "10000" ]; then
    log_pass "Total balance conserved: $TOTAL"
else
    log_fail "Total balance NOT conserved: $TOTAL (expected 10000)"
fi

echo ""

# ------------------------------------------
# TEST 2: Double Reversal Prevention
# ------------------------------------------
log_info "TEST 2: Double reversal prevention"
log_info "Creating accounts and performing a transfer..."

ACCOUNT_C=$(create_account "Test-C" 5000)
ACCOUNT_D=$(create_account "Test-D" 5000)

# Do a single transfer
TXN_RESULT=$(curl -s -X POST "$BASE_URL/api/transfers" \
    -H "Content-Type: application/json" \
    -d "{
        \"source_account_id\": \"$ACCOUNT_C\",
        \"dest_account_id\": \"$ACCOUNT_D\",
        \"amount\": 2000,
        \"idempotency_key\": \"test2-${RUN_ID}-transfer-1\"
    }")

TXN_ID=$(echo "$TXN_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
log_info "Transaction ID: $TXN_ID"

# Verify post-transfer balances
BALANCE_C=$(get_balance "$ACCOUNT_C")
BALANCE_D=$(get_balance "$ACCOUNT_D")
log_info "Post-transfer: C=$BALANCE_C, D=$BALANCE_D"

# Fire 5 concurrent reversal requests
log_info "Firing 5 concurrent reversals for the same transaction..."
pids=()
for i in $(seq 1 5); do
    curl -s -X POST "$BASE_URL/api/reversals" \
        -H "Content-Type: application/json" \
        -d "{
            \"transaction_id\": \"$TXN_ID\",
            \"idempotency_key\": \"test2-${RUN_ID}-reversal-$i\"
        }" -o /dev/null &
    pids+=($!)
done

for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null
done

sleep 1

# Check balances are restored
BALANCE_C=$(get_balance "$ACCOUNT_C")
BALANCE_D=$(get_balance "$ACCOUNT_D")

log_info "Post-reversal: C=$BALANCE_C (expected: 5000), D=$BALANCE_D (expected: 5000)"

if [ "$BALANCE_C" = "5000" ] && [ "$BALANCE_D" = "5000" ]; then
    log_pass "Balances correctly restored after reversal"
else
    log_fail "Balances incorrect after reversal! C=$BALANCE_C, D=$BALANCE_D"
fi

echo ""

# ------------------------------------------
# TEST 3: Concurrent Deposits
# ------------------------------------------
log_info "TEST 3: Concurrent deposits to same account"

ACCOUNT_E=$(create_account "Test-E" 0)
log_info "Account E: $ACCOUNT_E (starting balance: ₹0)"
log_info "Firing 10 concurrent ₹10 deposits..."

pids=()
for i in $(seq 1 10); do
    curl -s -X POST "$BASE_URL/api/deposits" \
        -H "Content-Type: application/json" \
        -d "{
            \"account_id\": \"$ACCOUNT_E\",
            \"amount\": 1000,
            \"idempotency_key\": \"test3-${RUN_ID}-deposit-$i\"
        }" -o /dev/null &
    pids+=($!)
done

for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null
done

sleep 1

BALANCE_E=$(get_balance "$ACCOUNT_E")
log_info "Balance E: $BALANCE_E (expected: 10000)"

if [ "$BALANCE_E" = "10000" ]; then
    log_pass "All 10 concurrent deposits applied correctly"
else
    log_fail "Deposit total incorrect! E=$BALANCE_E (expected 10000)"
fi

echo ""

# ------------------------------------------
# Summary
# ------------------------------------------
echo "========================================"
echo "  Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
