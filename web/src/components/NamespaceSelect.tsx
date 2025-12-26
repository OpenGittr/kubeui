import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Layers } from 'lucide-react';

interface NamespaceSelectProps {
  namespaces: string[];
  value: string;
  onChange: (namespace: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export function NamespaceSelect({
  namespaces,
  value,
  onChange,
  disabled = false,
  isLoading = false,
}: NamespaceSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter namespaces based on search
  const filteredNamespaces = namespaces.filter((ns) =>
    ns.toLowerCase().includes(search.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (ns: string) => {
    onChange(ns);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && !isLoading && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        className={`
          flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded
          hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed
          min-w-[180px] text-left
        `}
      >
        <Layers className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="flex-1 truncate">
          {isLoading ? 'Loading...' : value || 'All namespaces'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-hidden flex flex-col">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search namespaces..."
              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Namespace list */}
          <div className="overflow-auto flex-1">
            {/* All namespaces option */}
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`
                w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                hover:bg-gray-100 transition-colors
                ${!value ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}
              `}
            >
              <span className="text-gray-400">*</span>
              <span>All namespaces</span>
            </button>

            {filteredNamespaces.map((ns) => (
              <button
                key={ns}
                type="button"
                onClick={() => handleSelect(ns)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                  hover:bg-gray-100 transition-colors
                  ${ns === value ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}
                `}
              >
                <span className="w-4" />
                <span className="truncate">{ns}</span>
              </button>
            ))}

            {filteredNamespaces.length === 0 && search && (
              <div className="px-3 py-2 text-sm text-gray-500 text-center">
                No namespaces found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
