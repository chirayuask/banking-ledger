import { useState, useEffect } from 'react';
import type { Account } from '../api/types';
import { listAccounts, createTransfer, createDeposit, createWithdrawal } from '../api/client';

interface Props {
  onSuccess: () => void;
  onRefreshNeeded?: number;
}

type OperationType = 'transfer' | 'deposit' | 'withdrawal';

export default function TransferForm({ onSuccess, onRefreshNeeded }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [opType, setOpType] = useState<OperationType>('transfer');
  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    listAccounts().then(setAccounts).catch(() => {});
  }, [onRefreshNeeded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const amountPaisa = Math.round(parseFloat(amount) * 100);
      if (isNaN(amountPaisa) || amountPaisa <= 0) {
        setError('Amount must be greater than 0');
        return;
      }

      if (opType === 'transfer') {
        if (!sourceId || !destId) {
          setError('Select both source and destination accounts');
          return;
        }
        if (sourceId === destId) {
          setError('Source and destination must be different');
          return;
        }
        await createTransfer(sourceId, destId, amountPaisa);
        setSuccess(`Transfer of ₹${amount} completed successfully`);
      } else if (opType === 'deposit') {
        if (!accountId) {
          setError('Select an account');
          return;
        }
        await createDeposit(accountId, amountPaisa);
        setSuccess(`Deposit of ₹${amount} completed successfully`);
      } else {
        if (!accountId) {
          setError('Select an account');
          return;
        }
        await createWithdrawal(accountId, amountPaisa);
        setSuccess(`Withdrawal of ₹${amount} completed successfully`);
      }

      setAmount('');
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-4">New Operation</h2>

      {/* Operation type tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        {(['transfer', 'deposit', 'withdrawal'] as OperationType[]).map((type) => (
          <button
            key={type}
            onClick={() => { setOpType(type); setError(''); setSuccess(''); }}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium capitalize transition-colors ${
              opType === type
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded mb-4 text-sm">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {opType === 'transfer' ? (
          <>
            <div>
              <label className="block text-sm text-gray-600 mb-1">From Account</label>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">Select source...</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} — {acc.account_number} ({acc.ifsc_code}) — ₹${(acc.balance / 100).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">To Account</label>
              <select
                value={destId}
                onChange={(e) => setDestId(e.target.value)}
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">Select destination...</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} — {acc.account_number} ({acc.ifsc_code}) — ₹${(acc.balance / 100).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div>
            <label className="block text-sm text-gray-600 mb-1">Account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="">Select account...</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} — {acc.account_number} ({acc.ifsc_code}) — ₹${(acc.balance / 100).toFixed(2)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm text-gray-600 mb-1">Amount (₹)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="0.00"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 capitalize"
        >
          {loading ? 'Processing...' : `Submit ${opType}`}
        </button>
      </form>
    </div>
  );
}
