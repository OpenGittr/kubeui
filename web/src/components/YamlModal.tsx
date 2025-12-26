import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Copy, Check, Edit2, Save, XCircle } from 'lucide-react';
import { api } from '../services/api';
import { useState, useEffect, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface YamlModalProps {
  resourceType: string;
  namespace?: string;
  name: string;
  onClose: () => void;
}

// Editable code component with syntax highlighting
function EditableYaml({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync scroll between textarea and highlighted code
  const handleScroll = () => {
    if (containerRef.current && textareaRef.current) {
      const pre = containerRef.current.querySelector('pre');
      if (pre) {
        pre.scrollTop = textareaRef.current.scrollTop;
        pre.scrollLeft = textareaRef.current.scrollLeft;
      }
    }
  };

  return (
    <div ref={containerRef} className="relative h-full">
      {/* Syntax highlighted background */}
      <SyntaxHighlighter
        language="yaml"
        style={oneDark}
        showLineNumbers
        customStyle={{
          margin: 0,
          borderRadius: 0,
          minHeight: '100%',
          fontSize: '13px',
          pointerEvents: 'none',
        }}
        lineNumberStyle={{
          minWidth: '3em',
          paddingRight: '1em',
          color: '#636d83',
          userSelect: 'none',
        }}
      >
        {value || ' '}
      </SyntaxHighlighter>

      {/* Transparent editable textarea overlay */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        spellCheck={false}
        className="absolute inset-0 w-full h-full resize-none bg-transparent text-transparent caret-white focus:outline-none"
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '13px',
          lineHeight: '1.5',
          padding: '1em',
          paddingLeft: '4.5em', // Account for line numbers
        }}
      />
    </div>
  );
}

export function YamlModal({ resourceType, namespace, name, onClose }: YamlModalProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedYaml, setEditedYaml] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['yaml', resourceType, namespace, name],
    queryFn: () =>
      namespace
        ? api.yaml.get(resourceType, namespace, name)
        : api.yaml.getClusterScoped(resourceType, name),
  });

  useEffect(() => {
    if (data?.yaml) {
      setEditedYaml(data.yaml);
    }
  }, [data?.yaml]);

  const updateMutation = useMutation({
    mutationFn: (yaml: string) =>
      namespace
        ? api.yaml.update(resourceType, namespace, name, yaml)
        : api.yaml.updateClusterScoped(resourceType, name, yaml),
    onSuccess: () => {
      setIsEditing(false);
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ['yaml', resourceType, namespace, name] });
      queryClient.invalidateQueries({ queryKey: [resourceType] });
    },
    onError: (err: Error) => {
      setSaveError(err.message);
    },
  });

  const handleCopy = async () => {
    const yamlToCopy = isEditing ? editedYaml : data?.yaml;
    if (yamlToCopy) {
      await navigator.clipboard.writeText(yamlToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setSaveError(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedYaml(data?.yaml || '');
    setSaveError(null);
  };

  const handleSave = () => {
    updateMutation.mutate(editedYaml);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-4/5 h-4/5 flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">
            {namespace ? `${namespace}/` : ''}{name}
            {isEditing && <span className="ml-2 text-sm text-blue-600">(editing)</span>}
          </h2>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
                >
                  <XCircle className="w-4 h-4" />
                  Cancel
                </button>
              </>
            ) : (
              <>
                {data?.canEdit && (
                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {saveError && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm">
            Error: {saveError}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-4 text-gray-500">Loading...</div>
          ) : error ? (
            <div className="p-4 text-red-500">Error: {(error as Error).message}</div>
          ) : isEditing ? (
            <EditableYaml value={editedYaml} onChange={setEditedYaml} />
          ) : (
            <SyntaxHighlighter
              language="yaml"
              style={oneDark}
              showLineNumbers
              customStyle={{
                margin: 0,
                borderRadius: 0,
                minHeight: '100%',
                fontSize: '13px',
              }}
              lineNumberStyle={{
                minWidth: '3em',
                paddingRight: '1em',
                color: '#636d83',
                userSelect: 'none',
              }}
            >
              {data?.yaml || '# No data'}
            </SyntaxHighlighter>
          )}
        </div>
      </div>
    </div>
  );
}
