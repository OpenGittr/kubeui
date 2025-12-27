import { useState, useEffect, useMemo } from 'react';
import { Lock, LockOpen, FileSliders, Settings, Cpu, Hash } from 'lucide-react';
import { KeyValueTable } from './KeyValueTable';

export interface EnvVar {
  name: string;
  value?: string;
  valueFrom?: string;
}

export interface ContainerEnv {
  name: string;
  env: EnvVar[];
}

export interface Tab {
  key: string;
  label: string;
  data?: Record<string, string>;
  secretData?: Record<string, string>; // For secret data with lock functionality
  envData?: ContainerEnv[]; // For environment variables
  multiline?: boolean;
}

interface MetadataTabsProps {
  tabs: Tab[];
}

function hasTabContent(tab: Tab): boolean {
  if (tab.data && Object.keys(tab.data).length > 0) return true;
  if (tab.secretData && Object.keys(tab.secretData).length > 0) return true;
  if (tab.envData?.some(c => c.env && c.env.length > 0)) return true;
  return false;
}

export function MetadataTabs({ tabs }: MetadataTabsProps) {
  const [activeTab, setActiveTab] = useState<string>('');

  // Filter out tabs with no data
  const availableTabs = tabs.filter(hasTabContent);

  // Generate fingerprint to detect when tabs change
  const tabsFingerprint = useMemo(() => {
    return availableTabs.map(t => {
      const dataKeys = Object.keys(t.data || {}).sort().join(',');
      const secretKeys = Object.keys(t.secretData || {}).sort().join(',');
      const envKeys = t.envData?.map(c => c.name).join(',') || '';
      return `${t.key}:${dataKeys}:${secretKeys}:${envKeys}`;
    }).join('|');
  }, [availableTabs]);

  // Reset to first tab when available tabs change
  useEffect(() => {
    if (availableTabs.length > 0) {
      setActiveTab(availableTabs[0].key);
    }
  }, [tabsFingerprint]);

  if (availableTabs.length === 0) return null;

  const effectiveTab = availableTabs.find(t => t.key === activeTab) ? activeTab : availableTabs[0]?.key;
  const activeTabData = availableTabs.find(t => t.key === effectiveTab);

  return (
    <div>
      <div className="flex border-b border-gray-200 mb-3">
        {availableTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${
              effectiveTab === tab.key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="ml-1">
        {activeTabData?.data && (
          <KeyValueTable data={activeTabData.data} multiline={activeTabData.multiline} />
        )}
        {activeTabData?.secretData && (
          <SecretDataTable data={activeTabData.secretData} />
        )}
        {activeTabData?.envData && (
          <EnvTable containers={activeTabData.envData} />
        )}
      </div>
    </div>
  );
}

function SecretDataTable({ data }: { data: Record<string, string> }) {
  const [unlockedKeys, setUnlockedKeys] = useState<Set<string>>(new Set());
  const keys = Object.keys(data).sort();

  const toggleKeyLock = (key: string) => {
    setUnlockedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAllKeys = () => {
    setUnlockedKeys(prev => {
      if (prev.size === keys.length) {
        return new Set();
      } else {
        return new Set(keys);
      }
    });
  };

  const allUnlocked = unlockedKeys.size === keys.length;

  return (
    <div className="border border-gray-200 rounded overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap" style={{ maxWidth: '50%' }}>Key</th>
            <th className="w-4"></th>
            <th className="text-left px-3 py-2 font-medium text-gray-600 w-full">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={toggleAllKeys}
                  className="p-0.5 hover:bg-yellow-100 rounded"
                  title={allUnlocked ? 'Hide all values' : 'Show all values'}
                >
                  {allUnlocked ? (
                    <LockOpen className="w-3 h-3 text-yellow-600" />
                  ) : (
                    <Lock className="w-3 h-3 text-yellow-600" />
                  )}
                </button>
                <span>Value</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key, idx) => {
            const isUnlocked = unlockedKeys.has(key);
            return (
              <tr key={key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 font-mono font-medium text-gray-800 align-top whitespace-nowrap" style={{ maxWidth: '50%' }}>{key}</td>
                <td className="py-2 text-gray-300 align-top text-center w-4">|</td>
                <td className="px-3 py-2 font-mono text-gray-600 break-all align-top">
                  <div className="flex items-start gap-1.5">
                    <button
                      onClick={() => toggleKeyLock(key)}
                      className="p-0.5 hover:bg-yellow-100 rounded flex-shrink-0 mt-0.5"
                      title={isUnlocked ? 'Hide value' : 'Show value'}
                    >
                      {isUnlocked ? (
                        <LockOpen className="w-3 h-3 text-yellow-600" />
                      ) : (
                        <Lock className="w-3 h-3 text-yellow-600" />
                      )}
                    </button>
                    <span>
                      {isUnlocked ? (
                        data[key] || <span className="text-gray-400">-</span>
                      ) : (
                        <span className="text-gray-400">••••••••</span>
                      )}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface EnvGroup {
  type: 'direct' | 'configmap' | 'secret' | 'field' | 'resource' | 'other';
  source?: string; // ConfigMap or Secret name
  envs: EnvVar[];
}

function groupEnvVars(envs: EnvVar[]): EnvGroup[] {
  const groups: Map<string, EnvGroup> = new Map();

  for (const env of envs) {
    let groupKey: string;
    let group: EnvGroup;

    // Check valueFrom FIRST to properly group by source
    if (env.valueFrom?.startsWith('configmap:')) {
      // Extract ConfigMap name (format: configmap:name/key or configmap:name)
      const parts = env.valueFrom.substring(10).split('/');
      const cmName = parts[0];
      groupKey = `configmap:${cmName}`;
      group = groups.get(groupKey) || { type: 'configmap', source: cmName, envs: [] };
    } else if (env.valueFrom?.startsWith('secret:')) {
      const parts = env.valueFrom.substring(7).split('/');
      const secretName = parts[0];
      groupKey = `secret:${secretName}`;
      group = groups.get(groupKey) || { type: 'secret', source: secretName, envs: [] };
    } else if (env.valueFrom?.startsWith('field:')) {
      groupKey = 'field';
      group = groups.get(groupKey) || { type: 'field', envs: [] };
    } else if (env.valueFrom?.startsWith('resource:')) {
      groupKey = 'resource';
      group = groups.get(groupKey) || { type: 'resource', envs: [] };
    } else if (env.value && !env.valueFrom) {
      // Direct value - no external source
      groupKey = 'direct';
      group = groups.get(groupKey) || { type: 'direct', envs: [] };
    } else {
      groupKey = 'other';
      group = groups.get(groupKey) || { type: 'other', envs: [] };
    }

    group.envs.push(env);
    groups.set(groupKey, group);
  }

  // Sort envs within each group
  for (const group of groups.values()) {
    group.envs.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Order: configmaps first, then secrets, then field refs, then resource refs, then direct values, then other
  const order = ['configmap', 'secret', 'field', 'resource', 'direct', 'other'];
  return Array.from(groups.entries())
    .sort((a, b) => {
      const aType = a[1].type;
      const bType = b[1].type;
      const aOrder = order.findIndex(t => aType.startsWith(t));
      const bOrder = order.findIndex(t => bType.startsWith(t));
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a[0].localeCompare(b[0]);
    })
    .map(([, group]) => group);
}

function EnvTable({ containers }: { containers: ContainerEnv[] }) {
  const containerCount = containers.filter(c => c.env && c.env.length > 0).length;
  const [unlockedSecrets, setUnlockedSecrets] = useState<Set<string>>(new Set());

  const toggleSecretLock = (secretKey: string) => {
    setUnlockedSecrets(prev => {
      const next = new Set(prev);
      if (next.has(secretKey)) {
        next.delete(secretKey);
      } else {
        next.add(secretKey);
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {containers.map((container) => {
        if (!container.env || container.env.length === 0) return null;

        const groups = groupEnvVars(container.env);

        return (
          <div key={container.name} className="border border-gray-200 rounded overflow-hidden">
            {containerCount > 1 && (
              <div className="bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 border-b border-gray-200">
                {container.name}
              </div>
            )}
            <table className="w-full text-xs">
              <tbody>
                {groups.map((group, groupIdx) => {
                  return (
                    <>
                      {/* Group Header Row */}
                      <tr key={`header-${groupIdx}`} className="bg-gray-50 border-b border-gray-100">
                        <td colSpan={3} className="px-3 py-1.5 text-xs font-medium text-gray-600">
                          <div className="flex items-center gap-1.5">
                            {group.type === 'configmap' && (
                              <>
                                <FileSliders className="w-3 h-3 text-blue-600" />
                                <span>From ConfigMap:</span>
                                <a
                                  href={`#/configmaps?highlight=${group.source}`}
                                  className="text-blue-600 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {group.source}
                                </a>
                              </>
                            )}
                            {group.type === 'secret' && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Toggle all secrets in this group
                                    const allKeys = group.envs.map(env => `${container.name}-${env.name}`);
                                    setUnlockedSecrets(prev => {
                                      const next = new Set(prev);
                                      const allUnlocked = allKeys.every(k => prev.has(k));
                                      if (allUnlocked) {
                                        allKeys.forEach(k => next.delete(k));
                                      } else {
                                        allKeys.forEach(k => next.add(k));
                                      }
                                      return next;
                                    });
                                  }}
                                  className="p-0.5 hover:bg-yellow-100 rounded"
                                  title="Toggle all values"
                                >
                                  {group.envs.every(env => unlockedSecrets.has(`${container.name}-${env.name}`)) ? (
                                    <LockOpen className="w-3 h-3 text-yellow-600" />
                                  ) : (
                                    <Lock className="w-3 h-3 text-yellow-600" />
                                  )}
                                </button>
                                <span>From Secret:</span>
                                <a
                                  href={`#/secrets?highlight=${group.source}`}
                                  className="text-yellow-700 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {group.source}
                                </a>
                              </>
                            )}
                            {group.type === 'field' && (
                              <>
                                <Settings className="w-3 h-3 text-purple-600" />
                                <span>From Pod Fields</span>
                              </>
                            )}
                            {group.type === 'resource' && (
                              <>
                                <Cpu className="w-3 h-3 text-teal-600" />
                                <span>From Resource Fields</span>
                              </>
                            )}
                            {group.type === 'direct' && (
                              <>
                                <Hash className="w-3 h-3 text-green-600" />
                                <span>Direct Values</span>
                              </>
                            )}
                            {group.type === 'other' && (
                              <span>Other</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Group Env Vars */}
                      {group.envs.map((env, idx) => {
                        const rowKey = `${container.name}-${env.name}`;
                        const isRowUnlocked = unlockedSecrets.has(rowKey);

                        return (
                          <tr key={`${groupIdx}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="px-3 py-2 font-mono font-medium text-gray-800 align-top whitespace-nowrap">
                              {env.name}
                            </td>
                            <td className="py-2 text-gray-300 align-top w-4">|</td>
                            <td className="px-3 py-2 font-mono text-gray-600 break-all align-top">
                              {group.type === 'secret' ? (
                                <div className="flex items-start gap-1.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSecretLock(rowKey);
                                    }}
                                    className="p-0.5 hover:bg-yellow-100 rounded flex-shrink-0 mt-0.5"
                                    title={isRowUnlocked ? 'Hide value' : 'Show value'}
                                  >
                                    {isRowUnlocked ? (
                                      <LockOpen className="w-3 h-3 text-yellow-600" />
                                    ) : (
                                      <Lock className="w-3 h-3 text-yellow-600" />
                                    )}
                                  </button>
                                  <span className="min-w-[4rem]">
                                    {isRowUnlocked ? (
                                      env.value || <span className="text-gray-400">-</span>
                                    ) : (
                                      <span className="text-gray-400">••••••••</span>
                                    )}
                                  </span>
                                </div>
                              ) : env.value ? (
                                env.value
                              ) : env.valueFrom ? (
                                group.type === 'field' ? (
                                  env.valueFrom.substring(6)
                                ) : group.type === 'resource' ? (
                                  env.valueFrom.substring(9)
                                ) : (
                                  <span className="text-gray-400 italic">-</span>
                                )
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
