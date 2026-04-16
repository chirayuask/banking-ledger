import { useState, useEffect } from 'react';
import type { Account } from '../api/types';
import { listAccounts, createAccount } from '../api/client';
import { formatCents } from '../utils';

interface Props {
  onRefreshNeeded?: number;
}

export default function AccountList({ onRefreshNeeded }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const data = await listAccounts();
      setAccounts(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [onRefreshNeeded]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const balanceCents = Math.round(parseFloat(balance) * 100);
      if (isNaN(balanceCents) || balanceCents < 0) {
        setError('Invalid balance');
        return;
      }
      await createAccount(name, balanceCents);
      setName('');
      setBalance('');
      setShowCreate(false);
      fetchAccounts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Accounts</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
        >
          {showCreate ? 'Cancel' : '+ Create Account'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-gray-50 p-4 rounded-lg mb-4 flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">Account Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="e.g. Alice"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">Initial Balance ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="0.00"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm py-8">Loading accounts...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{acc.name}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-800">
                    {formatCents(acc.balance)}
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{acc.id.slice(0, 8)}...</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(acc.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    No accounts yet. Create one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
