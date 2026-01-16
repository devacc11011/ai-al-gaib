import { useState, useRef, useEffect } from 'react'
import { Folder, FileText, Play, Terminal as TerminalIcon, CheckCircle2, Circle, Loader2, XCircle, ChevronRight, ChevronDown, ListTodo, ExternalLink, Zap, RefreshCw, Menu, Plus, X, Wand2 } from 'lucide-react'

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

interface Skill {
  name: string;
  description: string;
  agent: 'claude' | 'gemini' | 'codex';
  path: string;
}

interface SkillsByAgent {
  claude: Skill[];
  gemini: Skill[];
  codex: Skill[];
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

const AVAILABLE_AGENTS = ['claude', 'codex', 'gemini'] as const;
type AgentType = typeof AVAILABLE_AGENTS[number];

// Skill Generator Modal
interface SkillGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceRoot: string;
  onSkillCreated: () => void;
}

const SkillGeneratorModal = ({ isOpen, onClose, workspaceRoot, onSkillCreated }: SkillGeneratorModalProps) => {
  const [skillName, setSkillName] = useState('');
  const [skillDescription, setSkillDescription] = useState('');
  const [targetAgent, setTargetAgent] = useState<AgentType>('claude');
  const [generatorAgent, setGeneratorAgent] = useState<AgentType>('claude');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationLog, setGenerationLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [generationLog]);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setSkillName('');
      setSkillDescription('');
      setGenerationLog([]);
      setError(null);
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    if (!skillName.trim() || !skillDescription.trim()) {
      setError('Please provide both skill name and description');
      return;
    }

    if (!ipcRenderer) {
      setError('IPC not available');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGenerationLog(['Starting skill generation...']);

    try {
      const result = await ipcRenderer.invoke('generate-skill', {
        name: skillName.trim().toLowerCase().replace(/\s+/g, '-'),
        description: skillDescription.trim(),
        targetAgent,
        generatorAgent,
        workspaceRoot,
      });

      if (result.success) {
        setGenerationLog(prev => [...prev, `✓ Skill created at: ${result.path}`]);
        onSkillCreated();
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(result.error || 'Failed to generate skill');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate skill');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!ipcRenderer || !isOpen) return;

    const logHandler = (_: any, msg: string) => {
      setGenerationLog(prev => [...prev, msg]);
    };

    ipcRenderer.on('skill-generation-log', logHandler);
    return () => {
      ipcRenderer.removeListener('skill-generation-log', logHandler);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-bold">Skill Generator</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-1 hover:bg-muted rounded disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-auto flex-1">
          {/* Skill Name */}
          <div>
            <label className="block text-sm font-medium mb-1">Skill Name</label>
            <input
              type="text"
              value={skillName}
              onChange={(e) => setSkillName(e.target.value)}
              disabled={isGenerating}
              placeholder="e.g., code-reviewer, test-generator"
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm disabled:opacity-50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">
              What should this skill do?
            </label>
            <textarea
              value={skillDescription}
              onChange={(e) => setSkillDescription(e.target.value)}
              disabled={isGenerating}
              placeholder="Describe what the skill should do, when it should be used, and any specific instructions..."
              rows={4}
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm disabled:opacity-50 resize-none"
            />
          </div>

          {/* Agent Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Target Agent</label>
              <select
                value={targetAgent}
                onChange={(e) => setTargetAgent(e.target.value as AgentType)}
                disabled={isGenerating}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm disabled:opacity-50"
              >
                {AVAILABLE_AGENTS.map(agent => (
                  <option key={agent} value={agent}>{agent}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Which agent will use this skill
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Generator Agent</label>
              <select
                value={generatorAgent}
                onChange={(e) => setGeneratorAgent(e.target.value as AgentType)}
                disabled={isGenerating}
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm disabled:opacity-50"
              >
                {AVAILABLE_AGENTS.map(agent => (
                  <option key={agent} value={agent}>{agent}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Which agent will generate the skill
              </p>
            </div>
          </div>

          {/* Generation Log */}
          {generationLog.length > 0 && (
            <div className="bg-zinc-950 rounded-md p-3 max-h-40 overflow-auto">
              <div className="text-xs font-mono space-y-1">
                {generationLog.map((log, i) => (
                  <div key={i} className={log.startsWith('✓') ? 'text-green-400' : 'text-zinc-400'}>
                    {log}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 text-sm rounded-md hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !skillName.trim() || !skillDescription.trim()}
            className="px-4 py-2 text-sm rounded-md bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Generate Skill
              </>
            )}
          </button>
        </div>
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
  const [planner, setPlanner] = useState<AgentType>('claude');
  const [executor, setExecutor] = useState<AgentType>('claude');
  const [skills, setSkills] = useState<SkillsByAgent>({ claude: [], gemini: [], codex: [] });
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [skillGeneratorOpen, setSkillGeneratorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
    const workspaceHandler = (_: any, pathStr: string) => {
      setCwd(pathStr);
      // Clear selected skills when workspace changes
      setSelectedSkills([]);
    };
    const skillsHandler = (_: any, loadedSkills: SkillsByAgent) => {
      setSkills(loadedSkills);
      setLoadingSkills(false);
    };

    ipcRenderer.on('log', logHandler);
    ipcRenderer.on('status-update', statusHandler);
    ipcRenderer.on('file-tree-update', treeHandler);
    ipcRenderer.on('file-content', contentHandler);
    ipcRenderer.on('plan-created', planHandler);
    ipcRenderer.on('refresh-explorer', refreshHandler);
    ipcRenderer.on('workspace-root-changed', workspaceHandler);
    ipcRenderer.on('skills-loaded', skillsHandler);

    ipcRenderer.send('request-file-tree');
    ipcRenderer.invoke('get-workspace-root').then((pathStr: string) => {
        if (pathStr) setCwd(pathStr);
    }).catch(() => {});

    // Load skills on initial load
    loadSkills();

    return () => {
      ipcRenderer.removeListener('log', logHandler);
      ipcRenderer.removeListener('status-update', statusHandler);
      ipcRenderer.removeListener('file-tree-update', treeHandler);
      ipcRenderer.removeListener('file-content', contentHandler);
      ipcRenderer.removeListener('plan-created', planHandler);
      ipcRenderer.removeListener('refresh-explorer', refreshHandler);
      ipcRenderer.removeListener('workspace-root-changed', workspaceHandler);
      ipcRenderer.removeListener('skills-loaded', skillsHandler);
    };
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const loadSkills = async () => {
    if (!ipcRenderer) return;
    setLoadingSkills(true);
    try {
      const loadedSkills = await ipcRenderer.invoke('load-skills');
      setSkills(loadedSkills);
    } catch (err) {
      console.error('Failed to load skills:', err);
    } finally {
      setLoadingSkills(false);
    }
  };

  const toggleSkill = (skillName: string) => {
    setSelectedSkills(prev =>
      prev.includes(skillName)
        ? prev.filter(s => s !== skillName)
        : [...prev, skillName]
    );
  };

  const getAllSkills = (): Skill[] => {
    return [...skills.claude, ...skills.gemini, ...skills.codex];
  };

  const handleExecute = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!ipcRenderer) return

    if (isExecuting) {
        ipcRenderer.send('cancel-task');
        return;
    }

    if (!input.trim()) return

    const cmd = input.trim()
    const skillsLog = selectedSkills.length > 0 ? `, Skills: ${selectedSkills.join(', ')}` : '';
    setLogs(prev => [...prev, `$ ${cmd}`, `[Config] Planner: ${planner}, Executor: ${executor}${skillsLog}`]);
    setInput('');
    setIsExecuting(true);
    setStatus({ planning: 'idle', execution: 'idle' });
    setCurrentPlan(null);
    ipcRenderer.send('execute-task', { task: cmd, options: { planner, executor, skills: selectedSkills } });
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
      {/* Skill Generator Modal */}
      <SkillGeneratorModal
        isOpen={skillGeneratorOpen}
        onClose={() => setSkillGeneratorOpen(false)}
        workspaceRoot={cwd}
        onSkillCreated={loadSkills}
      />

      {/* Header */}
      <div className="h-14 border-b flex items-center px-4 justify-between bg-card shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <TerminalIcon className="w-5 h-5" />
            <h1 className="font-bold text-lg">AI Al-Gaib</h1>
          </div>

          {/* Menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded transition-colors"
            >
              <Menu className="w-4 h-4" />
              <span>Menu</span>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute left-0 top-full mt-1 bg-card border border-border rounded-md shadow-lg z-50 min-w-48">
                  <button
                    onClick={() => {
                      setSkillGeneratorOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    <Wand2 className="w-4 h-4 text-purple-400" />
                    Generate Skill
                  </button>
                  <button
                    onClick={() => {
                      loadSkills();
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Reload Skills
                  </button>
                </div>
              </>
            )}
          </div>
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
                <select
                  value={planner}
                  onChange={(e) => setPlanner(e.target.value as AgentType)}
                  disabled={isExecuting}
                  className="bg-muted border border-border rounded px-2 py-0.5 text-xs font-mono disabled:opacity-50"
                >
                  {AVAILABLE_AGENTS.map(agent => (
                    <option key={agent} value={agent}>{agent}</option>
                  ))}
                </select>
            </div>
            <div className="w-px h-4 bg-border"></div>
            <div className="flex items-center gap-2">
                <StatusIcon state={status.execution} />
                <span className={status.execution === 'running' ? 'text-blue-400' : 'text-muted-foreground'}>Executor</span>
                <select
                  value={executor}
                  onChange={(e) => setExecutor(e.target.value as AgentType)}
                  disabled={isExecuting}
                  className="bg-muted border border-border rounded px-2 py-0.5 text-xs font-mono disabled:opacity-50"
                >
                  {AVAILABLE_AGENTS.map(agent => (
                    <option key={agent} value={agent}>{agent}</option>
                  ))}
                </select>
            </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Explorer + Skills */}
        <div className="w-64 border-r bg-muted/10 flex flex-col shrink-0">
          {/* Explorer Section */}
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
          <div className="flex-1 p-2 overflow-auto min-h-0">
             {fileTree ? (
                 <FileTreeItem node={fileTree} onSelect={handleFileSelect} />
             ) : (
                 <div className="text-center text-xs text-muted-foreground mt-4 flex flex-col items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Scanning...
                 </div>
             )}
          </div>

          {/* Skills Section */}
          <div className="border-t border-border">
            <div className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-yellow-500" />
                <span>Skills</span>
              </div>
              <button
                onClick={loadSkills}
                disabled={loadingSkills}
                className="p-1 hover:bg-muted rounded disabled:opacity-50"
                title="Reload skills"
              >
                <RefreshCw className={`w-3 h-3 ${loadingSkills ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="px-2 pb-3 max-h-40 overflow-auto">
              {loadingSkills ? (
                <div className="text-center text-xs text-muted-foreground py-2 flex items-center justify-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading...
                </div>
              ) : getAllSkills().length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-2">
                  No skills found
                  <div className="text-[10px] mt-1 opacity-60">
                    Add skills to .claude/skills/, .gemini/skills/, or .codex/skills/
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {getAllSkills().map(skill => (
                    <label
                      key={`${skill.agent}-${skill.name}`}
                      className={`flex items-start gap-2 p-1.5 rounded cursor-pointer hover:bg-muted/50 transition-colors ${
                        selectedSkills.includes(skill.name) ? 'bg-primary/10' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSkills.includes(skill.name)}
                        onChange={() => toggleSkill(skill.name)}
                        disabled={isExecuting}
                        className="mt-0.5 rounded border-border"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate">{skill.name}</span>
                          <span className={`text-[10px] px-1 rounded ${
                            skill.agent === 'claude' ? 'bg-orange-500/20 text-orange-400' :
                            skill.agent === 'gemini' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-green-500/20 text-green-400'
                          }`}>
                            {skill.agent}
                          </span>
                        </div>
                        {skill.description && (
                          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {skill.description}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
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
