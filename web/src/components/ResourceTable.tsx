import { RefreshCw, FileCode, Trash2, Search, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useState, useMemo } from 'react';
import { YamlModal } from './YamlModal';
import { ActionMenu } from './ActionMenu';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
  getValue?: (item: T) => string | number;
}

interface ResourceTableProps<T> {
  title: string;
  data: T[] | undefined;
  columns: Column<T>[];
  isLoading: boolean;
  error: Error | null;
  onRefresh: () => void;
  getRowKey: (item: T) => string;
  actions?: (item: T) => React.ReactNode;
  resourceType?: string;
  getResourceInfo?: (item: T) => { namespace?: string; name: string };
  onDelete?: (item: T) => void;
  canDelete?: boolean;
  searchKeys?: string[];
}

type SortDirection = 'asc' | 'desc' | null;

export function ResourceTable<T>({
  title,
  data,
  columns,
  isLoading,
  error,
  onRefresh,
  getRowKey,
  actions,
  resourceType,
  getResourceInfo,
  onDelete,
  canDelete = true,
  searchKeys = ['name', 'namespace'],
}: ResourceTableProps<T>) {
  const [yamlResource, setYamlResource] = useState<{ namespace?: string; name: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedData = useMemo(() => {
    if (!data) return [];

    let result = [...data];

    // Filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter((item) => {
        const record = item as Record<string, unknown>;
        return searchKeys.some((key) => {
          const value = record[key];
          if (typeof value === 'string') {
            return value.toLowerCase().includes(term);
          }
          if (Array.isArray(value)) {
            return value.some((v) => String(v).toLowerCase().includes(term));
          }
          return String(value ?? '').toLowerCase().includes(term);
        });
      });
    }

    // Sort
    if (sortColumn && sortDirection) {
      const column = columns.find((c) => c.key === sortColumn);
      result.sort((a, b) => {
        let aVal: string | number;
        let bVal: string | number;

        if (column?.getValue) {
          aVal = column.getValue(a);
          bVal = column.getValue(b);
        } else {
          const aRecord = a as Record<string, unknown>;
          const bRecord = b as Record<string, unknown>;
          aVal = String(aRecord[sortColumn] ?? '');
          bVal = String(bRecord[sortColumn] ?? '');
        }

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        const comparison = String(aVal).localeCompare(String(bVal));
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [data, searchTerm, searchKeys, sortColumn, sortDirection, columns]);

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortColumn !== columnKey) {
      return <ChevronsUpDown className="w-3 h-3 text-gray-400" />;
    }
    if (sortDirection === 'asc') {
      return <ChevronUp className="w-3 h-3 text-blue-600" />;
    }
    return <ChevronDown className="w-3 h-3 text-blue-600" />;
  };

  if (isLoading) {
    return <div className="text-gray-500">Loading {title.toLowerCase()}...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error.message}</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Filter..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-green-600 bg-green-50 rounded">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Live
          </div>
          <button
            onClick={onRefresh}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            title="Refresh now"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full min-w-max">
          <thead className="bg-gray-50 border-b">
            <tr>
              {columns.map((col) => {
                const isSortable = col.sortable !== false;
                return (
                  <th
                    key={col.key}
                    className={`text-left px-4 py-3 text-sm font-medium text-gray-600 ${col.className || ''} ${
                      isSortable ? 'cursor-pointer hover:bg-gray-100 select-none' : ''
                    }`}
                    onClick={() => isSortable && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      {isSortable && <SortIcon columnKey={col.key} />}
                    </div>
                  </th>
                );
              })}
              {(actions || (resourceType && getResourceInfo)) && (
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredAndSortedData.map((item) => (
              <tr key={getRowKey(item)} className="hover:bg-gray-50">
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 text-sm whitespace-nowrap ${col.className || ''}`}>
                    {col.render
                      ? col.render(item)
                      : String((item as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
                {(actions || (resourceType && getResourceInfo)) && (
                  <td className="px-4 py-3 text-right">
                    {actions ? (
                      actions(item)
                    ) : resourceType && getResourceInfo ? (
                      <ActionMenu
                        items={[
                          {
                            label: 'View YAML',
                            icon: <FileCode className="w-4 h-4" />,
                            onClick: () => setYamlResource(getResourceInfo(item)),
                          },
                          ...(onDelete ? [{
                            label: 'Delete',
                            icon: <Trash2 className="w-4 h-4" />,
                            variant: 'danger' as const,
                            disabled: !canDelete,
                            onClick: () => {
                              const info = getResourceInfo(item);
                              if (confirm(`Delete ${resourceType.slice(0, -1)} ${info.name}?`)) {
                                onDelete(item);
                              }
                            },
                          }] : []),
                        ]}
                      />
                    ) : null}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAndSortedData.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            {searchTerm ? `No ${title.toLowerCase()} matching "${searchTerm}"` : `No ${title.toLowerCase()} found`}
          </div>
        )}
      </div>

      {data && data.length > 0 && (
        <div className="mt-2 text-sm text-gray-500">
          {searchTerm
            ? `Showing ${filteredAndSortedData.length} of ${data.length} ${title.toLowerCase()}`
            : `${data.length} ${title.toLowerCase()}`}
        </div>
      )}

      {yamlResource && resourceType && (
        <YamlModal
          resourceType={resourceType}
          namespace={yamlResource.namespace}
          name={yamlResource.name}
          onClose={() => setYamlResource(null)}
        />
      )}
    </div>
  );
}
