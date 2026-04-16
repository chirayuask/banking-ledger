import { useState } from 'react';
import AccountList from './components/AccountList';
import TransferForm from './components/TransferForm';
import TransactionHistory from './components/TransactionHistory';
import AuditLog from './components/AuditLog';

type Tab = 'accounts' | 'operations' | 'transactions' | 'audit';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('accounts');
  const [refreshCounter, setRefreshCounter] = useState(0);

  const triggerRefresh = () => setRefreshCounter((c) => c + 1);

  const handleTabSwitch = (tab: Tab) => {
    setActiveTab(tab);
    setRefreshCounter((c) => c + 1);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'accounts', label: 'Accounts' },
    { key: 'operations', label: 'Operations' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'audit', label: 'Audit Log' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-800">Banking Ledger</h1>
          <p className="text-sm text-gray-500">Concurrency-safe money movement with audit trail</p>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-0">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabSwitch(tab.key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {activeTab === 'accounts' && (
            <AccountList onRefreshNeeded={refreshCounter} />
          )}
          {activeTab === 'operations' && (
            <TransferForm onSuccess={triggerRefresh} onRefreshNeeded={refreshCounter} />
          )}
          {activeTab === 'transactions' && (
            <TransactionHistory
              onRefreshNeeded={refreshCounter}
              onReversalSuccess={triggerRefresh}
            />
          )}
          {activeTab === 'audit' && (
            <AuditLog onRefreshNeeded={refreshCounter} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
