import { useState, useEffect } from 'react';
import type { Transaction, Account } from '../api/types';
import { listTransactions, listAccounts, createReversal } from '../api/client';
import { formatCents } from '../utils';

interface Props {
  onRefreshNeeded?: number;
  onReversalSuccess: () => void;
}

export default function TransactionHistory({ onRefreshNeeded, onReversalSuccess }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accountsMap, setAccountsMap] = useState<Record<string, Account>>({});
  const [loading, setLoading] = useState(true);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [txns, accounts] = await Promise.all([listTransactions(), listAccounts()]);
      setTransactions(txns);
      const map: Record<string, Account> = {};
      accounts.forEach((acc) => { map[acc.id] = acc; });
      setAccountsMap(map);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatAccount = (id: string | null) => {
    if (!id) return '-';
    const acc = accountsMap[id];
    if (acc) return `${acc.account_number} (${acc.ifsc_code})`;
    return id;
  };

  useEffect(() => {
    fetchData();
  }, [onRefreshNeeded]);

  const handleReverse = async (txnId: string) => {
    setError('');
    setReversingId(txnId);
    try {
      await createReversal(txnId);
      fetchData();
      onReversalSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReversingId(null);
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'REVERSED') {
      return <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">REVERSED</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">SUCCESS</span>;
  };

  const typeBadge = (type: string) => {
    const colors: Record<string, string> = {
      TRANSFER: 'bg-blue-100 text-blue-700',
      DEPOSIT: 'bg-emerald-100 text-emerald-700',
      WITHDRAWAL: 'bg-purple-100 text-purple-700',
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs ${colors[type] || 'bg-gray-100'}`}>{type}</span>;
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Transaction History</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm py-8">Loading transactions...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((txn) => (
                <tr key={txn.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(txn.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{typeBadge(txn.type)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    {formatAccount(txn.source_account_id)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    {formatAccount(txn.dest_account_id)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-800">
                    {formatCents(txn.amount)}
                  </td>
                  <td className="px-4 py-3">{statusBadge(txn.status)}</td>
                  <td className="px-4 py-3">
                    {txn.status === 'SUCCESS' ? (
                      <button
                        onClick={() => handleReverse(txn.id)}
                        disabled={reversingId === txn.id}
                        className="text-red-600 hover:text-red-800 text-xs font-medium disabled:opacity-50"
                      >
                        {reversingId === txn.id ? 'Reversing...' : 'Reverse'}
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No transactions yet.
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
