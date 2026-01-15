import { useState, useRef, useEffect } from 'react'
import { Folder, FileText, Play, Terminal as TerminalIcon, CheckCircle2, Circle, Loader2, XCircle, ChevronRight, ChevronDown, ListTodo } from 'lucide-react'

// Safe electron import
const electron = window.require ? window.require('electron') : null;
const ipcRenderer = electron ? electron.ipcRenderer : null;

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

function App() {
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
  const [activeSubtaskId, setActiveSubtaskId] = useState<string | null>(null);
  
  const terminalEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ipcRenderer) return;

    const logHandler = (_: any, msg: string) => {
      setLogs(prev => [...prev, msg]);
    };

    const statusHandler = (_: any, { phase, status }: { phase: 'planning'|'execution', status: any }) => {
      setStatus(prev => ({ ...prev, [phase]: status }));
    };

    const treeHandler = (_: any, tree: FileNode) => {
        setFileTree(tree);
    };

    const contentHandler = (_: any, { content }: { content: string }) => {
        setPreviewContent(content);
    };

    const planHandler = (_: any, plan: Plan) => {
        setCurrentPlan(plan);
        // Reset subtask statuses locally if needed, or rely on updates
    };

    const refreshHandler = () => {
        ipcRenderer.send('request-file-tree');
    };

    const workspaceHandler = (_: any, pathStr: string) => {
        setCwd(pathStr);
    };

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
    if (!input.trim() || !ipcRenderer) return

    const cmd = input.trim()
    setLogs(prev => [...prev, `$ ${cmd}`]);
    setInput('');
    setIsExecuting(true);
    setStatus({ planning: 'idle', execution: 'idle' });
    setCurrentPlan(null); // Clear previous plan
    ipcRenderer.send('execute-task', { task: cmd, options: {} });
  }

  const handleBrowseFolder = async () => {
    if (!ipcRenderer) return;
    try {
      const selected = await ipcRenderer.invoke('select-directory');
      if (selected) {
        await ipcRenderer.invoke('set-workspace-root', selected);
      }
    } catch (err) {
      console.error('Failed to select directory', err);
    }
  };

  const handleFileSelect = (path: string) => {
      ipcRenderer?.send('read-file', path);
  };

  // Helper for Status Icon
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
          <div className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex justify-between items-center">
            <span>Explorer</span>
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">.ai-al-gaib</span>
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
          
          {/* Active Plan Display */}
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

          {/* Logs */}
          <div className="flex-1 p-4 font-mono text-sm overflow-auto space-y-1">
            {logs.map((log, i) => (
              <div key={i} className={`${log.startsWith('$') ? 'text-zinc-100 font-bold mt-4' : 'text-zinc-400'}`}>
                {log}
              </div>
            ))}
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
                disabled={!input || isExecuting || !ipcRenderer}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 hover:bg-primary/90 flex items-center gap-2 transition-colors"
              >
                {isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Run
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

export default App
