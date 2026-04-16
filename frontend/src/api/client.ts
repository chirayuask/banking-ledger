import type { Account, Transaction, Reversal, AuditLog, ApiResponse } from './types.ts';

const BASE_URL = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok || data.status === 'error') {
    throw new Error(data.message || data.error || 'Unknown error');
  }
  return data;
}

function generateKey(): string {
  return crypto.randomUUID();
}

// Accounts
export async function listAccounts(): Promise<Account[]> {
  const res = await request<Account[]>('/accounts');
  return res.data || [];
}

export async function getAccount(id: string): Promise<Account> {
  const res = await request<Account>(`/accounts/${id}`);
  return res.data!;
}

export async function createAccount(name: string, accountNumber: string, ifscCode: string, initialBalance: number): Promise<Account> {
  const res = await request<Account>('/accounts', {
    method: 'POST',
    body: JSON.stringify({ name, account_number: accountNumber, ifsc_code: ifscCode, initial_balance: initialBalance }),
  });
  return res.data!;
}

// Transfers
export async function createTransfer(
  sourceAccountId: string,
  destAccountId: string,
  amount: number
): Promise<Transaction> {
  const res = await request<Transaction>('/transfers', {
    method: 'POST',
    body: JSON.stringify({
      source_account_id: sourceAccountId,
      dest_account_id: destAccountId,
      amount,
      idempotency_key: generateKey(),
    }),
  });
  return res.data!;
}

// Deposits
export async function createDeposit(accountId: string, amount: number): Promise<Transaction> {
  const res = await request<Transaction>('/deposits', {
    method: 'POST',
    body: JSON.stringify({
      account_id: accountId,
      amount,
      idempotency_key: generateKey(),
    }),
  });
  return res.data!;
}

// Withdrawals
export async function createWithdrawal(accountId: string, amount: number): Promise<Transaction> {
  const res = await request<Transaction>('/withdrawals', {
    method: 'POST',
    body: JSON.stringify({
      account_id: accountId,
      amount,
      idempotency_key: generateKey(),
    }),
  });
  return res.data!;
}

// Reversals
export async function createReversal(transactionId: string): Promise<Reversal> {
  const res = await request<Reversal>('/reversals', {
    method: 'POST',
    body: JSON.stringify({
      transaction_id: transactionId,
      idempotency_key: generateKey(),
    }),
  });
  return res.data!;
}

// Transactions
export async function listTransactions(accountId?: string): Promise<Transaction[]> {
  const params = accountId ? `?account_id=${accountId}` : '';
  const res = await request<Transaction[]>(`/transactions${params}`);
  return res.data || [];
}

// Audit Logs
export async function listAuditLogs(accountId?: string): Promise<AuditLog[]> {
  const params = accountId ? `?account_id=${accountId}` : '';
  const res = await request<AuditLog[]>(`/audit-logs${params}`);
  return res.data || [];
}
