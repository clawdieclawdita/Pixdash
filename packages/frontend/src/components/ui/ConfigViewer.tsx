interface ConfigViewerProps {
  config: Record<string, unknown>;
}

function stringifyValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[unserializable]';
  }
}

export function ConfigViewer({ config }: ConfigViewerProps) {
  const entries = Object.entries(config);

  if (entries.length === 0) {
    return <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">No config available.</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
      <table className="w-full border-collapse text-left text-sm text-slate-200">
        <thead className="bg-slate-900/80 text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium">Key</th>
            <th className="px-4 py-3 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} className="border-t border-slate-800 align-top">
              <td className="px-4 py-3 font-mono text-xs text-slate-400">{key}</td>
              <td className="px-4 py-3">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-200">{stringifyValue(value)}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
