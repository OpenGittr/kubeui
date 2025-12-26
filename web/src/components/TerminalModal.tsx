import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

interface TerminalModalProps {
  namespace: string;
  podName: string;
  containerName?: string;
  onClose: () => void;
}

interface TerminalMessage {
  type: 'input' | 'output' | 'resize' | 'error';
  data?: string;
  rows?: number;
  cols?: number;
}

export function TerminalModal({ namespace, podName, containerName, onClose }: TerminalModalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal
    const terminal = new Terminal({
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

    const fit = new FitAddon();
    const webLinks = new WebLinksAddon();

    terminal.loadAddon(fit);
    terminal.loadAddon(webLinks);

    terminal.open(terminalRef.current);
    fit.fit();

    terminalInstance.current = terminal;
    fitAddon.current = fit;

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/pods/${namespace}/${podName}/exec${containerName ? `?container=${containerName}` : ''}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);

      // Send initial terminal size
      const msg: TerminalMessage = {
        type: 'resize',
        rows: terminal.rows,
        cols: terminal.cols,
      };
      ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (event) => {
      try {
        const msg: TerminalMessage = JSON.parse(event.data);
        if (msg.type === 'output' && msg.data) {
          terminal.write(msg.data);
        } else if (msg.type === 'error' && msg.data) {
          setError(msg.data);
          terminal.write(`\r\n\x1b[31mError: ${msg.data}\x1b[0m\r\n`);
        }
      } catch {
        // Raw text output
        terminal.write(event.data);
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
      terminal.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n');
    };

    // Handle terminal input
    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        const msg: TerminalMessage = {
          type: 'input',
          data: data,
        };
        ws.send(JSON.stringify(msg));
      }
    });

    // Handle resize
    const handleResize = () => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        const msg: TerminalMessage = {
          type: 'resize',
          rows: terminal.rows,
          cols: terminal.cols,
        };
        ws.send(JSON.stringify(msg));
      }
    };

    window.addEventListener('resize', handleResize);

    // Focus terminal
    terminal.focus();

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      terminal.dispose();
    };
  }, [namespace, podName, containerName]);

  // Handle fullscreen toggle
  useEffect(() => {
    if (fitAddon.current) {
      setTimeout(() => fitAddon.current?.fit(), 100);
    }
  }, [isFullscreen]);

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

  return (
    <div className={`fixed ${isFullscreen ? 'inset-0' : 'inset-4'} bg-black/80 flex items-center justify-center z-50`}>
      <div className={`bg-[#1e1e1e] rounded-lg shadow-2xl flex flex-col ${isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[80vh]'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <span className="text-gray-300 text-sm font-mono">
              {podName}{containerName ? ` / ${containerName}` : ''}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${isConnected ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="px-4 py-2 bg-red-900/50 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Terminal */}
        <div ref={terminalRef} className="flex-1 p-2" />
      </div>
    </div>
  );
}
