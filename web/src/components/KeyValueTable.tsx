interface KeyValueTableProps {
  data: Record<string, string>;
  keyHeader?: string;
  valueHeader?: string;
  showHeader?: boolean;
  multiline?: boolean; // For values that may have multiline content
}

export function KeyValueTable({ data, keyHeader = 'Key', valueHeader = 'Value', showHeader = false, multiline = false }: KeyValueTableProps) {
  const entries = Object.entries(data);

  if (entries.length === 0) return null;

  const renderValue = (value: string) => {
    if (multiline && value.includes('\n')) {
      const lines = value.split('\n');
      const displayValue = lines.slice(0, 3).join('\n') + (lines.length > 3 ? '\n...' : '');
      return (
        <pre className="font-mono text-gray-600 whitespace-pre-wrap break-all m-0">
          {displayValue}
        </pre>
      );
    }
    return value;
  };

  return (
    <div className="border border-gray-200 rounded overflow-hidden">
      <table className="w-full text-xs">
        {showHeader && (
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">{keyHeader}</th>
              <th className="w-4"></th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">{valueHeader}</th>
            </tr>
          </thead>
        )}
        <tbody>
          {entries.map(([key, value], idx) => (
            <tr key={key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-3 py-2 font-mono font-medium text-gray-800 align-top whitespace-nowrap">
                {key}
              </td>
              <td className="py-2 text-gray-300 align-top w-4">|</td>
              <td className="px-3 py-2 font-mono text-gray-600 break-all align-top">
                {renderValue(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
