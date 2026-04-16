export interface Account {
  id: string;
  name: string;
  account_number: string;
  ifsc_code: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  type: 'TRANSFER' | 'DEPOSIT' | 'WITHDRAWAL';
  source_account_id: string | null;
  dest_account_id: string | null;
  amount: number;
  status: 'SUCCESS' | 'REVERSED';
  idempotency_key: string | null;
  created_at: string;
}

export interface Reversal {
  id: string;
  original_transaction_id: string;
  idempotency_key: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  operation: string;
  source_account_id: string | null;
  dest_account_id: string | null;
  amount: number;
  outcome: 'SUCCESS' | 'FAILURE';
  failure_reason: string | null;
  transaction_id: string | null;
  created_at: string;
}

export interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  error?: string;
  message?: string;
}
