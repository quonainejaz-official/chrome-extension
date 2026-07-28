import { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { sendMessage } from '@/hooks';
import type { StatusSnapshot } from '@/types';
import { Toggle } from '@/components/Toggle';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';

function StatBox({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="flex items-center gap-2.5 p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      <span className="text-base">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{label}</p>
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{value}</p>
      </div>
    </div>
  );
}

function HealthDot({ state }: { state: string }) {
  const cls =
    state === 'ok' ? 'bg-green-500' :
    state === 'error' ? 'bg-red-500' :
    state === 'testing' ? 'bg-yellow-500 animate-pulse' :
    state === 'unconfigured' ? 'bg-gray-400' :
    'bg-gray-300';
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />;
}

function App() {
  const [status, setStatus] = useState<StatusSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const s = await sendMessage({ type: 'GET_STATUS' } as never) as StatusSnapshot;
      setStatus(s);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleEnabled = async () => {
    const res = await sendMessage({ type: 'TOGGLE_ENABLED' } as never);
    setStatus((prev) => prev ? { ...prev, enabled: (res as { enabled: boolean }).enabled } : prev);
  };

  const togglePause = async () => {
    const res = await sendMessage({ type: 'TOGGLE_PAUSE' } as never);
    setStatus((prev) => prev ? { ...prev, paused: (res as { paused: boolean }).paused } : prev);
  };

  const rescan = async () => {
    await sendMessage({ type: 'RESCAN_ACTIVE_TAB' } as never);
  };

  const openOptions = () => chrome.runtime.openOptionsPage();

  if (loading) {
    return (
      <div className="w-[360px] min-h-[420px] flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="w-[360px] min-h-[420px] flex items-center justify-center bg-white dark:bg-gray-900 text-gray-500">
        Failed to load status
      </div>
    );
  }

  const healthLabel =
    status.health.state === 'ok' ? 'Connected' :
    status.health.state === 'error' ? 'Error' :
    status.health.state === 'testing' ? 'Testing...' :
    status.health.state === 'unconfigured' ? 'No API key' : 'Unknown';

  const healthVariant =
    status.health.state === 'ok' ? 'success' :
    status.health.state === 'error' ? 'error' :
    status.health.state === 'testing' ? 'warning' : 'default';

  return (
    <div className="w-[360px] min-h-[420px] bg-white dark:bg-gray-900 flex flex-col font-sans">
      {/* Header */}
      <header className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">U</span>
          </div>
          <h1 className="text-base font-bold text-gray-900 dark:text-white">Unslop</h1>
        </div>
        <Badge variant={healthVariant}>
          <HealthDot state={status.health.state} />
          {healthLabel}
        </Badge>
      </header>

      {/* Body */}
      <div className="px-4 py-3 space-y-3 flex-1 overflow-y-auto">
        {/* Enable / Pause toggles */}
        <Card>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {status.enabled ? 'Active' : 'Disabled'}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {status.paused ? 'Detection paused' : 'Scanning posts'}
                </p>
              </div>
              <Toggle checked={status.enabled} onChange={toggleEnabled} />
            </div>
            {status.enabled && (
              <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Pause</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Temporarily stop</p>
                </div>
                <Toggle checked={status.paused} onChange={togglePause} size="sm" />
              </div>
            )}
          </div>
        </Card>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          <StatBox icon={'\uD83D\uDC41\uFE0F'} label="Scanned (today)" value={status.today.scanned} />
          <StatBox icon={'\uD83D\uDEAB'} label="Hidden (today)" value={status.today.hidden} />
          <StatBox icon={'\uD83D\uDCE1'} label="API calls (today)" value={status.today.apiCalls} />
          <StatBox icon={'\uD83D\uDCB0'} label="Est. cost" value={`$${status.today.cost.toFixed(4)}`} />
        </div>

        {/* Profile info */}
        <Card>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">Active Model</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{status.activeModel}</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{status.activeProfileName}</p>
        </Card>

        {/* Queue */}
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">Queue</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {status.queue.pending} pending, {status.queue.inFlight} in-flight
              </p>
            </div>
            <p className="text-[11px] text-gray-400">{status.queue.completed} done</p>
          </div>
        </Card>
      </div>

      {/* Footer */}
      <footer className="px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 flex gap-2">
        <button onClick={rescan} className="flex-1 py-2 text-xs font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg transition-colors">
          {'\uD83D\uDD04'} Rescan
        </button>
        <button onClick={openOptions} className="flex-1 py-2 text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors">
          {'\u2699\uFE0F'} Settings
        </button>
      </footer>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
