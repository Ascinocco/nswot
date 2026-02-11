import { useState } from 'react';

export default function WorkspacePage(): React.JSX.Element {
  const [pingResult, setPingResult] = useState<string | null>(null);

  async function handlePing(): Promise<void> {
    const result = await window.nswot.system.ping();
    if (result.success && result.data) {
      setPingResult(result.data);
    } else {
      setPingResult(`Error: ${result.error?.message ?? 'Unknown error'}`);
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold">Workspace</h2>
      <p className="mb-6 text-gray-400">Open a directory to start a SWOT analysis workspace.</p>
      <div className="flex items-center gap-4">
        <button
          onClick={handlePing}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          Ping Main Process
        </button>
        {pingResult !== null && (
          <span className="text-sm text-green-400">Response: {pingResult}</span>
        )}
      </div>
    </div>
  );
}
