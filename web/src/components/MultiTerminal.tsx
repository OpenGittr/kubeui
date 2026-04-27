import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { X, Maximize2, Minimize2, RotateCcw, Minus } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

export interface TerminalSession {
  id: string;
  namespace: string;
  podName: string;
  containerName?: string;
  reconnectKey?: number;
}

interface MultiTerminalProps {
  sessions: TerminalSession[];
  onRemoveSession: (id: string) => void;
  onReconnectSession: (id: string) => void;
  onClose: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

interface TerminalMessage {
  type: 'input' | 'output' | 'resize' | 'error' | 'shell';
  data?: string;
  rows?: number;
  cols?: number;
  shell?: string;
}

// Individual terminal component for each session
function SessionTerminal({
  session,
  isActive,
  onConnectionChange,
  onShellChange,
  onError,
}: {
  session: TerminalSession;
  isActive: boolean;
  onConnectionChange: (connected: boolean) => void;
  onShellChange: (shell: string) => void;
  onError: (error: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isConnectingRef = useRef(false);
  // Store callbacks in refs to avoid dependency issues
  const onConnectionChangeRef = useRef(onConnectionChange);
  const onShellChangeRef = useRef(onShellChange);
  const onErrorRef = useRef(onError);

  // Keep refs updated
  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
    onShellChangeRef.current = onShellChange;
    onErrorRef.current = onError;
  }, [onConnectionChange, onShellChange, onError]);

  // Initialize terminal and WebSocket
  useEffect(() => {
    if (!containerRef.current) return;

    // Prevent multiple simultaneous connections
    if (isConnectingRef.current) {
      return;
    }

    // Close existing WebSocket if reconnecting
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    isConnectingRef.current = true;

    // Create or reuse terminal
    let terminal = terminalRef.current;
    let fitAddon = fitAddonRef.current;

    if (!terminal) {
      terminal = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
          selectionBackground: '#264f78',
        },
      });

      fitAddon = new FitAddon();
      const webLinks = new WebLinksAddon();
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinks);

      terminal.open(containerRef.current);
      fitAddon.fit();

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
    } else {
      // Clear terminal for reconnect
      terminal.clear();
      terminal.write('\x1b[33mReconnecting...\x1b[0m\r\n');
    }

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/pods/${session.namespace}/${session.podName}/exec${session.containerName ? `?container=${session.containerName}` : ''}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      isConnectingRef.current = false;
      onConnectionChangeRef.current(true);
      onErrorRef.current(null);

      const msg: TerminalMessage = {
        type: 'resize',
        rows: terminal!.rows,
        cols: terminal!.cols,
      };
      ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (event) => {
      try {
        const msg: TerminalMessage = JSON.parse(event.data);
        if (msg.type === 'output' && msg.data) {
          terminal!.write(msg.data);
        } else if (msg.type === 'error' && msg.data) {
          onErrorRef.current(msg.data);
          terminal!.write(`\r\n\x1b[31mError: ${msg.data}\x1b[0m\r\n`);
        } else if (msg.type === 'shell' && msg.shell) {
          onShellChangeRef.current(msg.shell);
        }
      } catch {
        terminal!.write(event.data);
      }
    };

    ws.onerror = () => {
      isConnectingRef.current = false;
      onErrorRef.current('WebSocket connection error');
      onConnectionChangeRef.current(false);
    };

    ws.onclose = () => {
      isConnectingRef.current = false;
      onConnectionChangeRef.current(false);
      terminal!.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n');
    };

    // Handle input
    const dataHandler = terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        const msg: TerminalMessage = {
          type: 'input',
          data: data,
        };
        ws.send(JSON.stringify(msg));
      }
    });

    return () => {
      dataHandler.dispose();
      ws.close();
      wsRef.current = null;
      isConnectingRef.current = false;
    };
  }, [session.id, session.namespace, session.podName, session.containerName, session.reconnectKey]);

  // Cleanup terminal on unmount
  useEffect(() => {
    return () => {
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Focus and fit when becoming active
  useEffect(() => {
    if (isActive && terminalRef.current && fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        terminalRef.current?.focus();
      }, 50);
    }
  }, [isActive]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (isActive && fitAddonRef.current && wsRef.current?.readyState === WebSocket.OPEN && terminalRef.current) {
        fitAddonRef.current.fit();
        const msg: TerminalMessage = {
          type: 'resize',
          rows: terminalRef.current.rows,
          cols: terminalRef.current.cols,
        };
        wsRef.current.send(JSON.stringify(msg));
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 p-2 ${isActive ? 'block' : 'hidden'}`}
    />
  );
}

export function MultiTerminal({ sessions, onRemoveSession, onReconnectSession, onClose, isMinimized, onToggleMinimize }: MultiTerminalProps) {
  const [activeSessionId, setActiveSessionId] = useState<string>(sessions[0]?.id || '');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sessionStates, setSessionStates] = useState<Map<string, { isConnected: boolean; shell: string | null; error: string | null }>>(new Map());

  // Auto-select new sessions
  useEffect(() => {
    if (sessions.length > 0) {
      const lastSession = sessions[sessions.length - 1];
      if (!sessionStates.has(lastSession.id)) {
        setActiveSessionId(lastSession.id);
      }
    }
  }, [sessions, sessionStates]);

  // Keep active session in sync
  useEffect(() => {
    if (sessions.length > 0 && !sessions.find((s) => s.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isFullscreen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isFullscreen]);

  const activeState = sessionStates.get(activeSessionId);
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Always render everything, use CSS to show/hide based on minimized state
  return (
    <>
      {/* Minimized bar - shown when minimized */}
      <div className={`fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 z-50 shadow-lg ${isMinimized ? 'block' : 'hidden'}`}>
        <div className="flex items-center justify-between px-4 py-2">
          <button
            onClick={onToggleMinimize}
            className="flex items-center gap-3 hover:bg-gray-800 -m-2 p-2 rounded cursor-pointer"
          >
            <span className="text-gray-300 text-sm font-medium">
              Terminal ({sessions.length} session{sessions.length !== 1 ? 's' : ''})
            </span>
            <div className="flex items-center gap-1">
              {sessions.slice(0, 3).map((session) => {
                const state = sessionStates.get(session.id);
                return (
                  <span
                    key={session.id}
                    className="flex items-center gap-1 px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${state?.isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                    {session.podName}
                  </span>
                );
              })}
              {sessions.length > 3 && (
                <span className="text-xs text-gray-500">+{sessions.length - 3} more</span>
              )}
            </div>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleMinimize}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
              title="Expand"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
              title="Close all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Full terminal modal - shown when not minimized */}
      <div className={`fixed ${isFullscreen ? 'inset-0' : 'inset-4'} bg-black/80 flex items-center justify-center z-50 ${isMinimized ? 'hidden' : 'block'}`}>
        <div className={`bg-[#1e1e1e] rounded-lg shadow-2xl flex flex-col ${isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[80vh]'}`}>
          {/* Header with tabs and buttons */}
          <div className="flex items-center bg-gray-900 border-b border-gray-700">
          <div className="flex-1 flex items-center min-w-0 overflow-x-auto">
            {sessions.map((session) => {
              const state = sessionStates.get(session.id);
              const isActive = session.id === activeSessionId;
              return (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`group flex items-center gap-2 px-3 py-2 text-sm border-r border-gray-700 min-w-0 whitespace-nowrap ${
                    isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      state?.isConnected ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="truncate max-w-[120px]">
                    {session.podName}
                    {session.containerName && ` / ${session.containerName}`}
                  </span>
                  {sessions.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveSession(session.id);
                      }}
                      className="p-0.5 rounded hover:bg-gray-600 opacity-0 group-hover:opacity-100 flex-shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center flex-shrink-0 border-l border-gray-700">
            {onToggleMinimize && (
              <button
                onClick={onToggleMinimize}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800"
                title="Minimize"
              >
                <Minus className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800"
              title="Close all terminals"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status bar */}
        {activeSession && (
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-300 font-mono">
                {activeSession.namespace}/{activeSession.podName}
                {activeSession.containerName && ` (${activeSession.containerName})`}
              </span>
              {activeState?.shell && (
                <span className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 font-mono">
                  {activeState.shell.split('/').pop()}
                </span>
              )}
              <span className={`px-1.5 py-0.5 rounded ${activeState?.isConnected ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                {activeState?.isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {activeState && !activeState.isConnected && (
              <button
                onClick={() => onReconnectSession(activeSessionId)}
                className="flex items-center gap-1 px-2 py-0.5 text-yellow-300 hover:text-yellow-200 hover:bg-gray-700 rounded"
              >
                <RotateCcw className="w-3 h-3" />
                Reconnect
              </button>
            )}
          </div>
        )}

        {/* Error banner */}
        {activeState?.error && (
          <div className="px-3 py-1.5 bg-red-900/50 text-red-300 text-xs flex items-center justify-between">
            <span>{activeState.error}</span>
          </div>
        )}

          {/* Terminal container - relative for absolute positioned children */}
          <div className="flex-1 relative">
            {sessions.map((session) => (
              <SessionTerminal
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId && !isMinimized}
                onConnectionChange={(connected) => {
                  setSessionStates((prev) => {
                    const next = new Map(prev);
                    const current = next.get(session.id) || { isConnected: false, shell: null, error: null };
                    next.set(session.id, { ...current, isConnected: connected });
                    return next;
                  });
                }}
                onShellChange={(shell) => {
                  setSessionStates((prev) => {
                    const next = new Map(prev);
                    const current = next.get(session.id) || { isConnected: false, shell: null, error: null };
                    next.set(session.id, { ...current, shell });
                    return next;
                  });
                }}
                onError={(error) => {
                  setSessionStates((prev) => {
                    const next = new Map(prev);
                    const current = next.get(session.id) || { isConnected: false, shell: null, error: null };
                    next.set(session.id, { ...current, error });
                    return next;
                  });
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
