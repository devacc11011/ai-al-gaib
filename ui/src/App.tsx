import { useState } from 'react'

function App() {
  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <div className="h-12 border-b flex items-center px-4 justify-between bg-card">
        <h1 className="font-bold text-lg">AI Al-Gaib</h1>
        <div className="text-sm text-muted-foreground">Orchestration Dashboard</div>
      </div>

      {/* Main Content - 3 Pane Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Explorer */}
        <div className="w-64 border-r bg-muted/20 flex flex-col">
          <div className="p-2 text-sm font-semibold text-muted-foreground">Explorer</div>
          <div className="flex-1 p-2">
            {/* Mock File List */}
            <div className="space-y-1">
              <div className="text-sm px-2 py-1 rounded hover:bg-accent cursor-pointer">task-1768479369146</div>
            </div>
          </div>
        </div>

        {/* Center: Terminal / Output */}
        <div className="flex-1 bg-black text-green-400 p-4 font-mono text-sm overflow-auto">
          <div>$ ai-al-gaib plan "Hello World"</div>
          <div className="mt-2">[Planner] Analyzing task...</div>
          <div className="mt-1 text-blue-400">[Orchestrator] Starting Execution...</div>
        </div>

        {/* Right: Preview */}
        <div className="w-1/3 border-l bg-card flex flex-col">
          <div className="h-10 border-b flex items-center px-4 bg-muted/20">
             <span className="text-sm font-medium">Preview</span>
          </div>
          <div className="flex-1 p-4 prose dark:prose-invert max-w-none overflow-auto">
            <h1>Execution Plan</h1>
            <p>Here is the plan details...</p>
          </div>
        </div>
      </div>

      {/* Footer: Progress */}
      <div className="h-8 border-t flex items-center px-4 bg-muted/20 text-xs text-muted-foreground">
        Ready
      </div>
    </div>
  )
}

export default App
