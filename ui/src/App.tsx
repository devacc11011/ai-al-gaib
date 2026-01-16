import { useState, useRef, useEffect } from 'react'
import { Folder, FileText, Play, Terminal as TerminalIcon, CheckCircle2, Circle, Loader2, XCircle, ChevronRight, ChevronDown, ListTodo, ExternalLink } from 'lucide-react'

// Safe electron import
const electron = window.require ? window.require('electron') : null;
const ipcRenderer = electron ? electron.ipcRenderer : null;

// --- Types ---
interface StatusState {
  planning: 'idle' | 'running' | 'completed' | 'failed';
  execution: 'idle' | 'running' | 'completed' | 'failed';
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

interface Subtask {
  id: string;
  title: string;
  description: string;
  agent: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

interface Plan {
  id: string;
  subtasks: Subtask[];
}

// --- Helper Functions ---
const highlightAgentCommands = (text: string) => {
  // Regex to match patterns like: agent_name "command" or agent_name 'command'
  // Supported agents: claude, codex, gemini, python, pip, etc.
  const regex = /\b(claude|codex|gemini|python|python3|pip|npm|npx|git)\b\s+(['"])(.*?)\2/gi;
  
  if (!regex.test(text)) return text;

  const parts = [];
  let lastIndex = 0;
  let match;
  regex.lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    // Add highlighted match
    parts.push(
      <span key={match.index} className="text-yellow-400 font-bold">
        {match[0]}
      </span>
    );
    
    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <span>{parts}</span>;
};

// --- Components ---

const FileTreeItem = ({ node, onSelect }: { node: FileNode, onSelect: (path: string) => void }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'folder') {
      setIsOpen(!isOpen);
    } else {
      onSelect(node.path);
    }
  };

  return (
    <div className="pl-2">
      <div 
        className={`flex items-center gap-1.5 py-1 px-2 rounded-sm cursor-pointer hover:bg-accent/50 text-sm ${node.type === 'folder' ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
        onClick={handleClick}
      >
        {node.type === 'folder' && (
          isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
        )}
        {node.type === 'folder' ? <Folder className="w-3.5 h-3.5 text-blue-400" /> : <FileText className="w-3.5 h-3.5" />}
        <span className="truncate">{node.name}</span>
      </div>
      
      {isOpen && node.children && (
        <div className="border-l border-border/50 ml-2.5">
          {node.children.map((child) => (
            <FileTreeItem key={child.path} node={child} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
};

const PlannerWindow = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ipcRenderer) return;
    const handler = (_: any, msg: string) => {
      setLogs(prev => [...prev, msg]);
    };
    ipcRenderer.on('planner-log', handler);
    return () => { ipcRenderer.removeListener('planner-log', handler); };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 font-mono text-sm">
      <div className="p-3 border-b border-zinc-800 bg-zinc-900 flex justify-between items-center">
        <span className="font-bold flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-purple-400" />
          Planner Output (Headless)
        </span>
        <span className="text-xs text-zinc-500">Live Stream</span>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-1">
        {logs.length === 0 && <div className="text-zinc-600 italic">Waiting for planner output...</div>}
        {logs.map((log, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            {highlightAgentCommands(log)}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};

interface PermissionRequest {
  id: string;
  type: 'file_write' | 'file_edit' | 'bash' | 'unknown';
  description: string;
  rawText: string;
}

type ExecutionPhase = 'idle' | 'planning' | 'executing' | 'completed' | 'failed';

const ExecutorWindow = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [phase, setPhase] = useState<ExecutionPhase>('idle');
  const [currentSubtask, setCurrentSubtask] = useState<string>('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ipcRenderer) return;

    const logHandler = (_: any, msg: string) => {
      setLogs(prev => [...prev, msg]);

      // Update phase based on log messages
      if (msg.includes('[Planner]') || msg.includes('Planning task')) {
        setPhase('planning');
      } else if (msg.includes('[Plan]')) {
        const match = msg.match(/(\d+) subtasks/);
        if (match) setProgress({ current: 0, total: parseInt(match[1]) });
      } else if (msg.startsWith('▶ Starting:')) {
        setPhase('executing');
        setCurrentSubtask(msg.replace('▶ Starting:', '').trim());
        setProgress(prev => ({ ...prev, current: prev.current + 1 }));
      } else if (msg.includes('All tasks completed')) {
        setPhase('completed');
      } else if (msg.startsWith('✗') || msg.includes('[Failed]')) {
        setPhase('failed');
      }
    };

    const permissionHandler = (_: any, request: PermissionRequest) => {
      setPermissionRequest(request);
    };

    ipcRenderer.on('executor-log', logHandler);
    ipcRenderer.on('permission-request', permissionHandler);

    return () => {
      ipcRenderer.removeListener('executor-log', logHandler);
      ipcRenderer.removeListener('permission-request', permissionHandler);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handlePermissionResponse = (allow: boolean) => {
    if (ipcRenderer) {
      ipcRenderer.send('permission-respond', { allow });
    }
    setPermissionRequest(null);
  };

  const getPermissionIcon = (type: string) => {
    switch (type) {
      case 'file_write': return '📝';
      case 'file_edit': return '✏️';
      case 'bash': return '⚡';
      default: return '⚠️';
    }
  };

  const getPermissionTitle = (type: string) => {
    switch (type) {
      case 'file_write': return 'File Write Request';
      case 'file_edit': return 'File Edit Request';
      case 'bash': return 'Command Execution Request';
      default: return 'Permission Request';
    }
  };

  const phases: { key: ExecutionPhase; label: string }[] = [
    { key: 'planning', label: 'Planning' },
    { key: 'executing', label: 'Executing' },
    { key: 'completed', label: 'Done' }
  ];

  const getPhaseIndex = () => {
    if (phase === 'idle') return -1;
    if (phase === 'planning') return 0;
    if (phase === 'executing') return 1;
    if (phase === 'completed' || phase === 'failed') return 2;
    return -1;
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 font-mono text-sm">
      {/* Header */}
      <div className="p-3 border-b border-zinc-800 bg-zinc-900 flex justify-between items-center">
        <span className="font-bold flex items-center gap-2">
          <Play className="w-4 h-4 text-green-400" />
          Executor
        </span>
        <span className="text-xs text-zinc-500">
          {progress.total > 0 && `${progress.current}/${progress.total} subtasks`}
        </span>
      </div>

      {/* Phase Indicator */}
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center justify-center gap-2">
          {phases.map((p, idx) => {
            const currentIdx = getPhaseIndex();
            const isActive = idx === currentIdx;
            const isCompleted = idx < currentIdx;
            const isFailed = phase === 'failed' && idx === currentIdx;

            return (
              <div key={p.key} className="flex items-center">
                {/* Step circle */}
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                  ${isFailed ? 'bg-red-500 text-white' :
                    isCompleted ? 'bg-green-500 text-white' :
                    isActive ? 'bg-blue-500 text-white animate-pulse' :
                    'bg-zinc-700 text-zinc-400'}
                `}>
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isFailed ? (
                    <XCircle className="w-4 h-4" />
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    idx + 1
                  )}
                </div>

                {/* Label */}
                <span className={`ml-2 text-sm ${isActive ? 'text-white font-medium' : 'text-zinc-500'}`}>
                  {p.label}
                </span>

                {/* Connector line */}
                {idx < phases.length - 1 && (
                  <div className={`w-12 h-0.5 mx-3 ${isCompleted ? 'bg-green-500' : 'bg-zinc-700'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Current subtask */}
        {currentSubtask && phase === 'executing' && (
          <div className="mt-2 text-center text-xs text-zinc-400">
            Current: <span className="text-blue-400">{currentSubtask}</span>
          </div>
        )}
      </div>

      {/* Permission Request Dialog */}
      {permissionRequest && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-lg w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{getPermissionIcon(permissionRequest.type)}</span>
              <div>
                <h3 className="text-lg font-bold text-yellow-400">
                  {getPermissionTitle(permissionRequest.type)}
                </h3>
                <p className="text-xs text-zinc-500">Claude is requesting permission</p>
              </div>
            </div>

            <div className="bg-zinc-950 rounded p-3 mb-4 border border-zinc-800">
              <p className="text-sm text-zinc-300 break-all">
                {permissionRequest.description}
              </p>
            </div>

            <div className="bg-zinc-950/50 rounded p-2 mb-4 max-h-32 overflow-auto border border-zinc-800">
              <p className="text-xs text-zinc-500 whitespace-pre-wrap break-all">
                {permissionRequest.rawText.slice(-300)}
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => handlePermissionResponse(false)}
                className="px-4 py-2 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm font-medium transition-colors"
              >
                Deny
              </button>
              <button
                onClick={() => handlePermissionResponse(true)}
                className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
              >
                Allow
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 space-y-1">
        {logs.length === 0 && <div className="text-zinc-600 italic">Waiting for executor output...</div>}
        {logs.map((log, i) => {
          let className = 'text-zinc-400';
          if (log.startsWith('▶')) className = 'text-blue-400 font-bold mt-3';
          else if (log.startsWith('✓')) className = 'text-green-400';
          else if (log.startsWith('✗')) className = 'text-red-400';
          else if (log.startsWith('[Plan]')) className = 'text-purple-400 font-bold';

          return (
            <div key={i} className={`whitespace-pre-wrap break-all ${className}`}>
              {highlightAgentCommands(log)}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
};

function MainApp() {
  const [cwd, setCwd] = useState<string>('')
  const [logs, setLogs] = useState<string[]>([
    "Welcome to AI Al-Gaib Orchestrator.",
    "Ready for instructions."
  ])
  const [input, setInput] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [status, setStatus] = useState<StatusState>({ planning: 'idle', execution: 'idle' })
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ipcRenderer) return;

    const logHandler = (_: any, msg: string) => setLogs(prev => [...prev, msg]);
    const statusHandler = (_: any, { phase, status }: { phase: 'planning'|'execution', status: any }) => {
      setStatus(prev => ({ ...prev, [phase]: status }));
    };
    const treeHandler = (_: any, tree: FileNode) => setFileTree(tree);
    const contentHandler = (_: any, { content }: { content: string }) => setPreviewContent(content);
    const planHandler = (_: any, plan: Plan) => setCurrentPlan(plan);
    const refreshHandler = () => ipcRenderer.send('request-file-tree');
    const workspaceHandler = (_: any, pathStr: string) => setCwd(pathStr);

    ipcRenderer.on('log', logHandler);
    ipcRenderer.on('status-update', statusHandler);
    ipcRenderer.on('file-tree-update', treeHandler);
    ipcRenderer.on('file-content', contentHandler);
    ipcRenderer.on('plan-created', planHandler);
    ipcRenderer.on('refresh-explorer', refreshHandler);
    ipcRenderer.on('workspace-root-changed', workspaceHandler);

    ipcRenderer.send('request-file-tree');
    ipcRenderer.invoke('get-workspace-root').then((pathStr: string) => {
        if (pathStr) setCwd(pathStr);
    }).catch(() => {});

    return () => {
      ipcRenderer.removeListener('log', logHandler);
      ipcRenderer.removeListener('status-update', statusHandler);
      ipcRenderer.removeListener('file-tree-update', treeHandler);
      ipcRenderer.removeListener('file-content', contentHandler);
      ipcRenderer.removeListener('plan-created', planHandler);
      ipcRenderer.removeListener('refresh-explorer', refreshHandler);
      ipcRenderer.removeListener('workspace-root-changed', workspaceHandler);
    };
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleExecute = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!ipcRenderer) return

    if (isExecuting) {
        ipcRenderer.send('cancel-task');
        return;
    }

    if (!input.trim()) return

    const cmd = input.trim()
    setLogs(prev => [...prev, `$ ${cmd}`]);
    setInput('');
    setIsExecuting(true);
    setStatus({ planning: 'idle', execution: 'idle' });
    setCurrentPlan(null);
    ipcRenderer.send('execute-task', { task: cmd, options: {} });
  }

  const handleFileSelect = (path: string) => {
      ipcRenderer?.send('read-file', path);
  };

  const handleBrowseFolder = async () => {
    if (!ipcRenderer) return;
    const selectedPath = await ipcRenderer.invoke('select-directory');
    if (selectedPath) {
      await ipcRenderer.invoke('set-workspace-root', selectedPath);
    }
  };

  useEffect(() => {
      if (!ipcRenderer) return;
      const statusHandler = (_: any, { status }: { status: any }) => {
          if (status === 'completed' || status === 'failed') {
              setIsExecuting(false);
          }
      };
      ipcRenderer.on('status-update', statusHandler);
      return () => { ipcRenderer.removeListener('status-update', statusHandler); };
  }, []);

  const StatusIcon = ({ state }: { state: string }) => {
    if (state === 'running') return <Loader2 className="w-4 h-4 animate-spin text-blue-400" />;
    if (state === 'completed') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (state === 'failed') return <XCircle className="w-4 h-4 text-red-500" />;
    return <Circle className="w-4 h-4 text-zinc-600" />;
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden font-sans">
      {/* Header */}
      <div className="h-14 border-b flex items-center px-4 justify-between bg-card shrink-0">
        <div className="flex items-center gap-2">
           <TerminalIcon className="w-5 h-5" />
           <h1 className="font-bold text-lg">AI Al-Gaib</h1>
        </div>
        
        <div className="flex-1 max-w-xl mx-4">
          <div className="flex items-center border rounded-md px-3 py-1.5 bg-muted/50 text-sm gap-2">
            <Folder className="w-4 h-4 mr-2 text-muted-foreground" />
            <input 
              className="bg-transparent border-none outline-none flex-1 font-mono text-xs text-muted-foreground"
              value={cwd}
              readOnly
            />
            <button
              type="button"
              onClick={handleBrowseFolder}
              className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              Browse
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm mr-4">
            <div className="flex items-center gap-2">
                <StatusIcon state={status.planning} />
                <span className={status.planning === 'running' ? 'text-blue-400' : 'text-muted-foreground'}>Planner</span>
            </div>
            <div className="w-px h-4 bg-border"></div>
            <div className="flex items-center gap-2">
                <StatusIcon state={status.execution} />
                <span className={status.execution === 'running' ? 'text-blue-400' : 'text-muted-foreground'}>Executor</span>
            </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Explorer */}
        <div className="w-64 border-r bg-muted/10 flex flex-col shrink-0">
          <div className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span>Explorer</span>
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {cwd ? cwd.split('/').pop() : 'No folder'}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground/60 truncate font-normal normal-case">
              {cwd || 'Select a folder to browse'}
            </div>
          </div>
          <div className="flex-1 p-2 overflow-auto">
             {fileTree ? (
                 <FileTreeItem node={fileTree} onSelect={handleFileSelect} />
             ) : (
                 <div className="text-center text-xs text-muted-foreground mt-4 flex flex-col items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Scanning...
                 </div>
             )}
          </div>
        </div>

        {/* Center: Terminal & Plan */}
        <div className="flex-1 flex flex-col min-w-0 bg-zinc-950 text-zinc-100">
          {currentPlan && (
            <div className="bg-zinc-900 border-b border-zinc-800 p-4 shrink-0 max-h-48 overflow-auto">
              <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                <ListTodo className="w-4 h-4" />
                Current Execution Plan
              </div>
              <div className="space-y-2">
                {currentPlan.subtasks.map((task, idx) => (
                  <div key={task.id} className="flex items-start gap-3 text-sm bg-zinc-950/50 p-2 rounded border border-zinc-800/50">
                    <div className="mt-0.5 text-zinc-500 font-mono text-xs w-4">{idx + 1}.</div>
                    <div className="flex-1">
                      <div className="font-medium text-zinc-200">{task.title}</div>
                      <div className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{task.description}</div>
                    </div>
                    <div className="px-2 py-0.5 rounded bg-zinc-800 text-xs text-zinc-400 font-mono">
                      {task.agent}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 p-4 font-mono text-sm overflow-auto space-y-1">
            {logs.map((log, i) => {
              const isCommand = log.startsWith('$');
              let className = isCommand ? 'text-zinc-100 font-bold mt-4' : 'text-zinc-400';
              
              return (
                <div key={i} className={className}>
                  {highlightAgentCommands(log)}
                </div>
              );
            })}
            <div ref={terminalEndRef} />
          </div>

          <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
            <form onSubmit={handleExecute} className="flex gap-2">
              <span className="text-green-500 font-mono py-2">❯</span>
              <input
                autoFocus
                className="flex-1 bg-transparent border-none outline-none font-mono text-sm py-2 text-zinc-100 placeholder:text-zinc-600"
                placeholder={ipcRenderer ? 'Enter task instruction...' : 'Connecting to backend...'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isExecuting || !ipcRenderer}
              />
              <button 
                type="submit" 
                disabled={(!input && !isExecuting) || !ipcRenderer}
                className={`px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-2 transition-colors ${
                    isExecuting 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {isExecuting ? (
                    <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Stop
                    </>
                ) : (
                    <>
                        <Play className="w-3.5 h-3.5" />
                        Run
                    </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="w-1/3 border-l bg-card flex flex-col shrink-0">
          <div className="h-10 border-b flex items-center px-4 bg-muted/10 justify-between">
             <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Preview</span>
          </div>
          <div className="flex-1 p-6 prose prose-sm dark:prose-invert max-w-none overflow-auto bg-card">
             {previewContent ? (
                 <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                     {previewContent}
                 </pre>
             ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Select a context file to preview
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  // Simple Router based on Query Params
  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get('mode');

  if (mode === 'planner') {
    return <PlannerWindow />;
  }
  if (mode === 'executor') {
    return <ExecutorWindow />;
  }
  return <MainApp />;
}

export default App
