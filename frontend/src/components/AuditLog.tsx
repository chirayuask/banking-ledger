import { useState, useEffect } from 'react';
import type { AuditLog as AuditLogType } from '../api/types';
import { listAuditLogs } from '../api/client';
import { formatCents } from '../utils';

interface Props {
  onRefreshNeeded?: number;
}

export default function AuditLog({ onRefreshNeeded }: Props) {
  const [logs, setLogs] = useState<AuditLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const data = await listAuditLogs();
      setLogs(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [onRefreshNeeded]);

  const outcomeBadge = (outcome: string) => {
    if (outcome === 'FAILURE') {
      return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">FAILURE</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">SUCCESS</span>;
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Audit Log</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm py-8">Loading audit logs...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Operation</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Failure Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id} className={`hover:bg-gray-50 ${log.outcome === 'FAILURE' ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-gray-700">{log.operation}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {log.source_account_id ? log.source_account_id.slice(0, 8) + '...' : '-'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {log.dest_account_id ? log.dest_account_id.slice(0, 8) + '...' : '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-800">
                    {formatCents(log.amount)}
                  </td>
                  <td className="px-4 py-3">{outcomeBadge(log.outcome)}</td>
                  <td className="px-4 py-3 text-xs text-red-600">
                    {log.failure_reason || '-'}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No audit log entries yet.
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
