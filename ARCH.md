# AI Al-Gaib Architecture

> Multi-Agent AI Orchestration System with Planner-Executor Pattern

## Overview

AI Al-Gaib는 여러 AI 에이전트(Claude Code, Codex, Gemini)를 Planner-Executor 패턴으로 오케스트레이션하여 복잡한 코딩 작업을 자동화하는 시스템입니다. 컨텍스트 효율성을 위해 구조화된 Markdown 요약본으로 에이전트 간 통신을 수행합니다.

## Core Principles

1. **Context Efficiency**: 불필요한 컨텍스트 전달 최소화
2. **Structured Communication**: Markdown 기반 표준화된 통신 프로토콜
3. **Agent Specialization**: 각 AI의 강점을 활용한 역할 분담
4. **Headless Operation**: 모든 에이전트는 헤드리스 모드로 실행

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Interface                        │
│                    (Commander.js + Inquirer)                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      Orchestrator                            │
│  - Task routing                                              │
│  - Agent lifecycle management                                │
│  - Result aggregation                                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐   ┌──────────┐
    │ Planner  │    │ Context  │   │ Executor │
    │          │◄───┤ Manager  │───►│          │
    └──────────┘    └──────────┘   └──────────┘
           │               │               │
           └───────────────┼───────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌───────────┐   ┌───────────┐  ┌───────────┐
    │  Claude   │   │   Codex   │  │  Gemini   │
    │   Code    │   │  (OpenAI) │  │           │
    └───────────┘   └───────────┘  └───────────┘
```

## Component Details

### 1. Orchestrator

**Responsibility**: 전체 시스템의 진입점이자 작업 조율자

**Key Functions**:
- User 명령 파싱 및 라우팅 (Planner/Executor 선택 지원)
- 에이전트 간 워크플로우 관리
- 에러 핸들링 및 재시도 로직
- 최종 결과 집계 및 사용자 피드백

**Interface**:
```typescript
interface Orchestrator {
  execute(task: Task, config: ExecutionConfig): Promise<TaskResult>;
  routeToPlanner(task: Task, plannerName?: string): Promise<Plan>;
  executeWithAgents(plan: Plan, executorMap?: Map<string, string>): Promise<ExecutionResult>;
}
```

### 2. Planner

**Responsibility**: 작업 분석 및 실행 계획 수립

**Key Functions**:
- 작업 복잡도 분석
- 서브태스크 분해
- 에이전트 할당 전략 결정
- 의존성 그래프 생성

**Agent Selection Strategy**:
Planner는 기본적으로 작업의 특성에 맞춰 최적의 에이전트를 **추천**하지만, 사용자가 직접 지정한 설정을 우선합니다.

- **Manual Selection**: 사용자가 CLI 플래그(`--planner`, `--executor`) 또는 설정 파일로 지정
- **Auto Recommendation**:
  - **Claude Code**: 복잡한 코드 생성, 대규모 리팩토링, 아키텍처 설계
  - **Codex**: 빠른 코드 완성, 단순 함수 생성, 테스트 작성
  - **Gemini**: 코드 분석, 리뷰, 문서화, 설명

**Output Format** (Markdown):
```markdown
# Execution Plan

## Task Summary
[Brief description of the overall task]

## Complexity Analysis
- Estimated Steps: N
- Required Agents: [agent1, agent2]
- Dependencies: [dependency graph]

## Subtasks

### Subtask 1: [Name]
- **Agent**: Claude Code
- **Priority**: High
- **Input Context**: [reference to context file]
- **Expected Output**: [description]
- **Dependencies**: []

### Subtask 2: [Name]
...
```

### 3. Context Manager

**Responsibility**: 컨텍스트 최적화 및 관리

**Key Functions**:
- 컨텍스트 요약 (summarization)
- 필요한 정보만 추출 (filtering)
- Markdown 포맷 변환
- 컨텍스트 파일 생성 및 관리

**Summarization Strategy**:

```typescript
interface ContextSummary {
  // Essential metadata
  id: string;
  timestamp: string;
  source: string;

  // Hierarchical summary levels
  oneLiner: string;          // 1줄 요약 (< 100 chars)
  brief: string;             // 단락 요약 (< 500 chars)
  detailed: string;          // 상세 요약 (< 2000 chars)

  // Structured content
  codeSnippets?: CodeSnippet[];
  fileReferences?: FileRef[];
  keyDecisions?: Decision[];
}
```

**Context File Structure**:
```
.ai-al-gaib/
├── contexts/
│   ├── task-{id}/
│   │   ├── input.md          # 원본 입력
│   │   ├── summary.md        # 요약본
│   │   ├── plan.md           # 실행 계획
│   │   └── results/
│   │       ├── agent1.md     # 각 에이전트 결과
│   │       ├── agent2.md
│   │       └── final.md      # 최종 집계
```

### 4. Executor

**Responsibility**: 계획된 작업을 실제로 실행

**Key Functions**:
- 에이전트 프로세스 생성 및 관리
- 헤드리스 모드로 에이전트 실행
- 실시간 진행 상황 모니터링
- 에이전트 간 데이터 전달

**Agent Execution Interface**:
```typescript
interface AgentExecutor {
  spawn(agent: AgentType, config: AgentConfig): Promise<AgentProcess>;
  execute(process: AgentProcess, context: Context): Promise<AgentResult>;
  monitor(process: AgentProcess): Observable<AgentEvent>;
  terminate(process: AgentProcess): Promise<void>;
}
```

### 5. Agent Adapters

각 AI 에이전트를 위한 어댑터 레이어

#### Claude Code Adapter
```typescript
interface ClaudeCodeAdapter {
  // Headless execution via CLI
  executeHeadless(context: ContextFile): Promise<Result>;

  // Uses: @anthropics/sdk + child_process
  // Command: claude-code --headless --input context.md
}
```

#### Codex Adapter
```typescript
interface CodexAdapter {
  // CLI 기반 실행 (예: gh copilot alias 또는 openai-cli)
  executeHeadless(prompt: string, context: Context): Promise<string>;

  // Uses: child_process (spawning CLI tools)
}
```

#### Gemini Adapter
```typescript
interface GeminiAdapter {
  // CLI 기반 실행 (예: gcloud genai 또는 custom wrapper)
  executeHeadless(code: string, task: string): Promise<Analysis>;

  // Uses: child_process
}
```

## Communication Protocol

### Inter-Agent Communication Format

모든 에이전트 간 통신은 구조화된 Markdown 파일을 통해 이루어집니다.

**Standard Template**:
```markdown
---
id: unique-task-id
timestamp: 2026-01-15T12:00:00Z
from: planner | executor | agent-name
to: planner | executor | agent-name
type: plan | task | result | error
---

# [Title]

## Context
[Essential background information]

## Input
[Specific input for this task]

## Expected Output
[What should be produced]

## Constraints
- Constraint 1
- Constraint 2

## References
- [file:path/to/file.ts:10-20]
- [context:previous-task-id]
```

### Context Reduction Strategy

1. **Input Phase**:
   - 전체 컨텍스트 수집
   - 중요도 점수 계산

2. **Summarization Phase**:
   - AI를 사용한 인텔리전트 요약
   - 코드 스니펫 추출
   - 관계 그래프 생성

3. **Filtering Phase**:
   - 현재 작업에 필요한 정보만 선택
   - 토큰 수 제한 (예: 4K tokens per context)

4. **Transmission Phase**:
   - Markdown 파일로 직렬화
   - 에이전트에게 전달

### Agent Prompt Injection Strategy

각 에이전트가 MD 파일 기반으로 작업하고 산출물을 MD로 출력하도록 프롬프트를 주입합니다.

#### 1. Input Prompt Template

에이전트에게 전달되는 프롬프트 구조:

```typescript
interface AgentPrompt {
  systemPrompt: string;      // 역할 정의
  contextFiles: string[];    // 읽어야 할 MD 파일 경로
  taskPrompt: string;        // 구체적 작업 지시
  outputFormat: string;      // 출력 형식 지시
}
```

**Example - Claude Code에게 전달되는 프롬프트**:

```markdown
# System Prompt
You are a code architect working as part of a multi-agent system.
Your role is to design JWT authentication structure.

# Input Context
Please read the following context files:
1. `/path/to/.ai-al-gaib/contexts/task-123/input.md`
2. `/path/to/.ai-al-gaib/contexts/task-123/analysis.md` (from previous agent)

The previous agent (Gemini) has analyzed the current authentication system.
Their findings are in `analysis.md`.

# Your Task
Based on the analysis, design a JWT authentication structure including:
- Token payload schema
- Signing algorithm and secret management
- Refresh token strategy
- Middleware integration approach

# Output Requirements
You MUST output your result as a Markdown file with this exact structure:

```markdown
---
agent: claude-code
subtask_id: task-123-subtask-2
status: success | failure
tokens_used: <number>
---

# JWT Authentication Design

## Token Payload Schema
[Your design here]

## Signing Strategy
[Your design here]

## Refresh Token Strategy
[Your design here]

## Middleware Integration
[Your design here]

## Implementation Notes
[Any important notes]

## Files to Create/Modify
- [ ] src/auth/jwt.ts
- [ ] src/middleware/auth.ts
```

Save this output to: `/path/to/.ai-al-gaib/contexts/task-123/results/claude-design.md`
```

#### 2. Output Validation

에이전트가 생성한 MD 파일을 검증:

```typescript
interface OutputValidator {
  validateStructure(mdFile: string): ValidationResult;
  validateFrontmatter(mdFile: string): FrontmatterResult;
  extractArtifacts(mdFile: string): Artifact[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Example
const validator = new OutputValidator();
const result = validator.validateStructure('./results/claude-design.md');

if (!result.valid) {
  // Retry with corrected prompt
  await retryWithFeedback(agent, result.errors);
}
```

#### 3. Chain Prompting for Sequential Tasks

이전 에이전트의 산출물을 다음 에이전트에게 전달:

```typescript
// Step 1: Gemini analyzes
const geminiPrompt = {
  systemPrompt: "You are a code analyzer...",
  taskPrompt: "Analyze the current authentication system",
  outputFile: "./contexts/task-123/results/gemini-analysis.md"
};

const geminiResult = await executeAgent('gemini', geminiPrompt);

// Step 2: Claude designs (using Gemini's output)
const claudePrompt = {
  systemPrompt: "You are a code architect...",
  contextFiles: [
    "./contexts/task-123/input.md",
    "./contexts/task-123/results/gemini-analysis.md"  // 이전 산출물
  ],
  taskPrompt: `Based on the analysis in gemini-analysis.md, design JWT structure`,
  outputFile: "./contexts/task-123/results/claude-design.md"
};

const claudeResult = await executeAgent('claude-code', claudePrompt);

// Step 3: Codex implements (using Claude's design)
const codexPrompt = {
  systemPrompt: "You are a code implementer...",
  contextFiles: [
    "./contexts/task-123/results/claude-design.md"  // 이전 산출물
  ],
  taskPrompt: `Implement the JWT utilities as specified in claude-design.md`,
  outputFile: "./contexts/task-123/results/codex-implementation.md"
};
```

#### 4. Structured Output Format

모든 에이전트는 표준화된 출력 포맷을 따름:

```markdown
---
# Frontmatter (YAML)
agent: claude-code | codex | gemini
subtask_id: string
task_type: analysis | design | implementation | testing | review
status: success | failure | partial
tokens_used: number
execution_time_ms: number
timestamp: ISO8601
depends_on: [previous-subtask-ids]
---

# [Result Title]

## Summary
[1-3 sentence summary of what was accomplished]

## Detailed Output
[Main content organized by sections]

## Artifacts Generated
### Code Files
- `src/auth/jwt.ts` - JWT utility functions
- `src/middleware/auth.ts` - Authentication middleware

### Documentation
- API documentation for JWT endpoints

## Next Steps
[What the next agent should do]

## Issues/Blockers
[Any problems encountered]

## References
- [Previous context](./gemini-analysis.md)
- [External doc](https://jwt.io/introduction)
```

#### 5. Agent-Specific Prompt Templates

**Claude Code Template**:
```typescript
const claudeCodeTemplate = `
You are working in a multi-agent code development system.

CONTEXT FILES:
{{#each contextFiles}}
- Read: {{this}}
{{/each}}

TASK:
{{taskDescription}}

OUTPUT FORMAT:
You must save your response to: {{outputPath}}

Structure your response as a Markdown file with:
1. Frontmatter (agent, subtask_id, status, tokens_used)
2. Summary section
3. Detailed design/implementation
4. List of files to create/modify
5. Next steps for subsequent agents

IMPORTANT:
- Reference previous agent outputs when relevant
- Be specific about file paths and line numbers
- Include code snippets when helpful
- Flag any ambiguities or blockers
`;
```

**Codex Template**:
```typescript
const codexTemplate = `
Generate code based on the specification.

SPECIFICATION FILE:
Read the design spec from: {{specFile}}

TASK:
{{taskDescription}}

OUTPUT:
Create a markdown file at: {{outputPath}}

Include:
1. Frontmatter with metadata
2. Complete code implementation
3. Inline comments explaining complex logic
4. Unit test suggestions

Code should be production-ready and follow best practices.
`;
```

**Gemini Template**:
```typescript
const geminiTemplate = `
Analyze the provided code and generate insights.

CODE LOCATION:
{{codeLocation}}

ANALYSIS FOCUS:
{{analysisFocus}}

OUTPUT FILE:
{{outputPath}}

Your analysis should include:
1. Current architecture overview
2. Identified patterns and anti-patterns
3. Security considerations
4. Performance implications
5. Recommendations for improvement

Format as Markdown with clear sections.
`;
```

#### 6. Execution Flow with MD Files

```typescript
class AgentExecutor {
  async execute(subtask: Subtask): Promise<AgentResult> {
    // 1. Prepare context files
    const contextFiles = await this.prepareContext(subtask);

    // 2. Build prompt with file references
    const prompt = this.buildPrompt({
      template: this.getTemplate(subtask.agent),
      contextFiles,
      taskDescription: subtask.description,
      outputPath: subtask.outputPath
    });

    // 3. Execute agent
    let result: string;
    if (subtask.agent === 'claude-code') {
      // Headless CLI execution
      result = await this.executeClaudeCLI(prompt);
    } else if (subtask.agent === 'codex') {
      // CLI execution
      result = await this.executeCodexCLI(prompt);
    } else if (subtask.agent === 'gemini') {
      // CLI execution
      result = await this.executeGeminiCLI(prompt);
    }

    // 4. Validate output file was created
    const outputExists = await fs.pathExists(subtask.outputPath);
    if (!outputExists) {
      throw new Error(`Agent failed to create output file: ${subtask.outputPath}`);
    }

    // 5. Parse and validate output
    const output = await this.parseMarkdownOutput(subtask.outputPath);
    const validation = await this.validateOutput(output);

    if (!validation.valid) {
      // Retry with feedback
      return await this.retryWithFeedback(subtask, validation.errors);
    }

    return {
      subtaskId: subtask.id,
      agent: subtask.agent,
      status: output.frontmatter.status,
      outputFile: subtask.outputPath,
      tokensUsed: output.frontmatter.tokens_used,
      artifacts: output.artifacts
    };
  }

  private async executeClaudeCLI(prompt: string): Promise<string> {
    // Create a temporary instruction file
    const tempFile = `/tmp/claude-instruction-${Date.now()}.md`;
    await fs.writeFile(tempFile, prompt);

    // Execute Claude CLI in headless mode
    const result = await exec(
      `claude-code --headless --input ${tempFile} --output ${outputPath}`
    );

    return result.stdout;
  }
}
```

#### 7. Task Completion Detection (헤드리스 모드)

헤드리스 모드에서 각 에이전트의 작업 완료를 감지하는 전략:

##### Method 1: File Watcher (가장 신뢰할 수 있음)

```typescript
import chokidar from 'chokidar';
import { EventEmitter } from 'events';

class TaskCompletionDetector extends EventEmitter {
  private watchers: Map<string, chokidar.FSWatcher> = new Map();

  /**
   * 출력 파일을 감시하여 작업 완료 감지
   */
  async waitForCompletion(
    outputPath: string,
    timeout: number = 300000  // 5분 기본
  ): Promise<CompletionResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        watcher.close();
        reject(new Error(`Task timed out after ${timeout}ms`));
      }, timeout);

      let fileStableTimer: NodeJS.Timeout | null = null;
      const STABLE_DURATION = 2000;  // 2초 동안 변경 없으면 완료

      const watcher = chokidar.watch(outputPath, {
        persistent: true,
        ignoreInitial: false
      });

      // 파일 생성 또는 변경 감지
      watcher.on('add', async (path) => {
        console.log(`Output file created: ${path}`);
        this.startStabilityCheck();
      });

      watcher.on('change', (path) => {
        console.log(`Output file updated: ${path}`);
        this.startStabilityCheck();
      });

      const startStabilityCheck = () => {
        // 기존 타이머 취소
        if (fileStableTimer) {
          clearTimeout(fileStableTimer);
        }

        // 새 타이머 시작 - 2초 동안 변경 없으면 완료
        fileStableTimer = setTimeout(async () => {
          clearTimeout(timer);
          watcher.close();

          // 파일 내용 검증
          const content = await fs.readFile(outputPath, 'utf-8');
          const parsed = this.parseMarkdown(content);

          resolve({
            completed: true,
            outputPath,
            status: parsed.frontmatter.status,
            tokensUsed: parsed.frontmatter.tokens_used,
            duration: Date.now() - startTime
          });
        }, STABLE_DURATION);
      };

      watcher.on('error', (error) => {
        clearTimeout(timer);
        watcher.close();
        reject(error);
      });
    });
  }
}
```

**사용 예시**:
```typescript
const detector = new TaskCompletionDetector();

// 에이전트 실행
executeAgent('claude-code', prompt);

// 완료 대기
const result = await detector.waitForCompletion(
  './contexts/task-123/results/claude-design.md',
  300000  // 5분 타임아웃
);

console.log(`Task completed: ${result.status}`);
```

##### Method 2: Process Exit Code + File Validation

```typescript
class AgentProcess {
  async executeAndWait(
    agent: AgentType,
    prompt: string,
    outputPath: string
  ): Promise<AgentResult> {
    return new Promise((resolve, reject) => {
      // 1. 프로세스 생성
      const proc = spawn(this.getCommand(agent), this.getArgs(prompt, outputPath));

      let stdout = '';
      let stderr = '';

      // 2. 출력 캡처
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        this.emit('stdout', data.toString());
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        this.emit('stderr', data.toString());
      });

      // 3. 프로세스 종료 감지
      proc.on('exit', async (code, signal) => {
        if (code !== 0) {
          reject(new Error(`Agent exited with code ${code}\n${stderr}`));
          return;
        }

        // 4. 출력 파일 존재 확인 (최대 10초 대기)
        const fileExists = await this.waitForFile(outputPath, 10000);
        if (!fileExists) {
          reject(new Error(`Output file not created: ${outputPath}`));
          return;
        }

        // 5. 파일 내용 검증
        try {
          const content = await fs.readFile(outputPath, 'utf-8');
          const parsed = parseMarkdown(content);

          // Frontmatter 필수 필드 확인
          if (!parsed.frontmatter.agent || !parsed.frontmatter.status) {
            reject(new Error('Invalid output format: missing frontmatter'));
            return;
          }

          resolve({
            agent,
            status: parsed.frontmatter.status,
            outputPath,
            tokensUsed: parsed.frontmatter.tokens_used || 0,
            stdout,
            stderr
          });
        } catch (error) {
          reject(new Error(`Failed to parse output: ${error.message}`));
        }
      });

      // 6. 에러 핸들링
      proc.on('error', (error) => {
        reject(new Error(`Failed to start agent: ${error.message}`));
      });
    });
  }

  private async waitForFile(
    path: string,
    timeout: number
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await fs.pathExists(path)) {
        return true;
      }
      await sleep(100);  // 100ms마다 체크
    }

    return false;
  }
}
```

##### Method 3: Progress File (실시간 진행률 추적)

에이전트가 진행 상황을 별도 파일에 기록:

```typescript
// 에이전트 프롬프트에 포함
const promptWithProgress = `
${basePrompt}

PROGRESS REPORTING:
Create a progress file at: ${progressPath}

Update it periodically with:
\`\`\`json
{
  "status": "running" | "completed" | "failed",
  "progress": 0-100,
  "currentStep": "description",
  "timestamp": "ISO8601"
}
\`\`\`

When task is complete, set status to "completed" and update the final time.
`;

// 진행률 모니터링
class ProgressMonitor {
  async monitor(progressPath: string): Observable<Progress> {
    return new Observable((subscriber) => {
      const watcher = chokidar.watch(progressPath);

      watcher.on('change', async () => {
        try {
          const content = await fs.readFile(progressPath, 'utf-8');
          const progress = JSON.parse(content);

          subscriber.next(progress);

          if (progress.status === 'completed' || progress.status === 'failed') {
            watcher.close();
            subscriber.complete();
          }
        } catch (error) {
          subscriber.error(error);
        }
      });
    });
  }
}

// 사용
const monitor = new ProgressMonitor();
const progress$ = monitor.monitor('./progress/task-123.json');

progress$.subscribe({
  next: (p) => console.log(`Progress: ${p.progress}% - ${p.currentStep}`),
  complete: () => console.log('Task completed!'),
  error: (e) => console.error('Task failed:', e)
});
```

##### Method 4: API-Based Agents (Codex, Gemini)

API 기반 에이전트는 Promise로 완료 감지:

```typescript
class CodexAdapter {
  async execute(prompt: string, outputPath: string): Promise<AgentResult> {
    try {
      // API 호출
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
      });

      const content = response.choices[0].message.content;

      // 결과를 MD 파일로 저장
      await fs.writeFile(outputPath, content);

      // 파싱 및 검증
      const parsed = parseMarkdown(content);

      return {
        agent: 'codex',
        status: parsed.frontmatter.status || 'success',
        outputPath,
        tokensUsed: response.usage?.total_tokens || 0,
        completed: true
      };
    } catch (error) {
      // 실패 시에도 에러 정보를 MD 파일로 저장
      const errorMd = this.createErrorMarkdown(error);
      await fs.writeFile(outputPath, errorMd);

      throw error;
    }
  }
}
```

##### Method 5: Hybrid Approach (추천)

여러 방법을 조합한 robust한 감지:

```typescript
class RobustCompletionDetector {
  async waitForCompletion(
    agent: AgentType,
    process: ChildProcess,
    outputPath: string,
    progressPath?: string
  ): Promise<AgentResult> {
    return Promise.race([
      // 1. 프로세스 exit 기반
      this.waitForProcessExit(process),

      // 2. 출력 파일 감시
      this.waitForOutputFile(outputPath),

      // 3. 진행률 파일 감시 (optional)
      progressPath ? this.waitForProgressCompletion(progressPath) : never(),

      // 4. 타임아웃
      this.timeout(300000)
    ]).then(async () => {
      // 모든 조건 확인
      const fileExists = await fs.pathExists(outputPath);
      const processExited = process.exitCode !== null;

      if (!fileExists) {
        throw new Error('Output file not created');
      }

      if (!processExited) {
        process.kill();  // 정리
      }

      // 최종 검증
      return await this.validateOutput(outputPath);
    });
  }
}
```

##### 각 방법 비교

| Method | 신뢰성 | 실시간성 | 복잡도 | 추천 |
|--------|-------|---------|-------|------|
| File Watcher | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Medium | ✅ MVP |
| Process Exit | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Low | ✅ 기본 |
| Progress File | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | High | 선택 |
| API Promise | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Low | ✅ API 전용 |
| Hybrid | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | High | 🎯 최종 |

##### 실전 구현 예시

```typescript
// Orchestrator에서 사용
class Executor {
  async executeSubtask(subtask: Subtask): Promise<AgentResult> {
    const outputPath = this.getOutputPath(subtask);
    const progressPath = this.getProgressPath(subtask);

    // 1. 에이전트 실행
    const process = await this.spawnAgent(subtask.agent, {
      prompt: subtask.prompt,
      outputPath,
      progressPath
    });

    // 2. 실시간 진행률 모니터링 (UI 업데이트)
    if (progressPath) {
      this.monitorProgress(progressPath).subscribe((progress) => {
        this.emit('progress', { subtask: subtask.id, progress });
      });
    }

    // 3. 완료 대기 (Hybrid)
    const detector = new RobustCompletionDetector();
    const result = await detector.waitForCompletion(
      subtask.agent,
      process,
      outputPath,
      progressPath
    );

    // 4. 결과 검증
    if (result.status === 'failure') {
      // 재시도 로직
      return await this.retrySubtask(subtask);
    }

    return result;
  }
}
```

#### 8. Permission & Approval System (헤드리스 모드)

헤드리스 모드에서 에이전트가 권한이 필요한 작업(파일 수정, 명령 실행 등)을 할 때 사용자 승인을 받는 방법:

##### Permission Types

```typescript
enum PermissionType {
  FILE_WRITE = 'file_write',        // 파일 생성/수정
  FILE_DELETE = 'file_delete',      // 파일 삭제
  COMMAND_EXEC = 'command_exec',    // 시스템 명령 실행
  GIT_OPERATION = 'git_operation',  // git push, commit 등
  API_CALL = 'api_call',            // 외부 API 호출
  PACKAGE_INSTALL = 'package_install', // npm/pip install
}

interface PermissionRequest {
  id: string;
  type: PermissionType;
  description: string;
  details: {
    files?: string[];
    command?: string;
    risk_level: 'low' | 'medium' | 'high';
  };
  requestedBy: string;  // agent name
  timestamp: string;
}
```

##### Method 1: Permission Request File + IPC (Electron에 최적)

에이전트가 권한 요청 파일을 생성하고, Electron이 실시간으로 감지하여 다이얼로그 표시:

```typescript
// 1. 에이전트가 권한 요청 파일 생성
// .ai-al-gaib/permissions/request-{id}.json
{
  "id": "perm-123",
  "type": "file_write",
  "description": "Create JWT utility functions",
  "details": {
    "files": ["src/auth/jwt.ts", "src/auth/types.ts"],
    "risk_level": "low"
  },
  "requestedBy": "claude-code",
  "timestamp": "2026-01-15T12:00:00Z",
  "status": "pending"
}

// 2. Main Process (Node.js)에서 파일 감시
class PermissionManager extends EventEmitter {
  private watcher: chokidar.FSWatcher;

  constructor(private permissionDir: string) {
    this.watcher = chokidar.watch(`${permissionDir}/*.json`);

    this.watcher.on('add', async (path) => {
      const request = await this.loadRequest(path);
      if (request.status === 'pending') {
        // Renderer로 전송
        this.emit('permission-request', request);
      }
    });
  }

  async waitForApproval(requestId: string, timeout = 60000): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Permission request timed out'));
      }, timeout);

      const watcher = chokidar.watch(
        `${this.permissionDir}/request-${requestId}.json`
      );

      watcher.on('change', async () => {
        const request = await this.loadRequest(
          `${this.permissionDir}/request-${requestId}.json`
        );

        if (request.status === 'approved') {
          clearTimeout(timer);
          watcher.close();
          resolve(true);
        } else if (request.status === 'rejected') {
          clearTimeout(timer);
          watcher.close();
          resolve(false);
        }
      });
    });
  }
}

// 3. Renderer (React)에서 다이얼로그 표시
const PermissionDialog = ({ request, onApprove, onReject }) => (
  <Dialog open>
    <DialogTitle>Permission Required</DialogTitle>
    <DialogContent>
      <Typography>
        Agent <strong>{request.requestedBy}</strong> wants to:
      </Typography>
      <Typography variant="body2">{request.description}</Typography>

      <Alert severity={request.details.risk_level === 'high' ? 'error' : 'info'}>
        Risk Level: {request.details.risk_level.toUpperCase()}
      </Alert>

      {request.details.files && (
        <List>
          {request.details.files.map(file => (
            <ListItem key={file}>
              <ListItemIcon><FileIcon /></ListItemIcon>
              <ListItemText primary={file} />
            </ListItem>
          ))}
        </List>
      )}
    </DialogContent>
    <DialogActions>
      <Button onClick={onReject} color="error">Reject</Button>
      <Button onClick={onApprove} color="primary" variant="contained">
        Approve
      </Button>
    </DialogActions>
  </Dialog>
);

// 4. 승인/거부 처리
ipcRenderer.on('permission-request', async (event, request) => {
  const approved = await showPermissionDialog(request);

  // 요청 파일 업데이트
  ipcRenderer.send('permission-response', {
    id: request.id,
    status: approved ? 'approved' : 'rejected'
  });
});
```

##### Method 2: Pre-configured Auto-Approval Rules

미리 설정된 규칙에 따라 자동 승인:

```typescript
// .ai-al-gaib/config/permissions.json
{
  "auto_approve": {
    "file_write": {
      "allowed_patterns": [
        "src/**/*.ts",
        "src/**/*.tsx",
        "!src/**/*.config.*"  // config 파일 제외
      ],
      "max_files": 10
    },
    "command_exec": {
      "whitelist": [
        "npm test",
        "npm run build",
        "git status",
        "git diff"
      ],
      "blacklist": [
        "rm -rf",
        "git push --force",
        "sudo *"
      ]
    }
  },
  "always_ask": [
    "file_delete",
    "git_operation",
    "package_install"
  ]
}

// Auto-approval checker
class AutoApprovalChecker {
  constructor(private config: PermissionConfig) {}

  canAutoApprove(request: PermissionRequest): boolean {
    const rule = this.config.auto_approve[request.type];

    if (!rule) return false;

    switch (request.type) {
      case PermissionType.FILE_WRITE:
        return this.checkFileWriteRule(request, rule);

      case PermissionType.COMMAND_EXEC:
        return this.checkCommandRule(request, rule);

      default:
        return false;
    }
  }

  private checkFileWriteRule(
    request: PermissionRequest,
    rule: FileWriteRule
  ): boolean {
    const files = request.details.files || [];

    // 최대 파일 수 체크
    if (files.length > rule.max_files) {
      return false;
    }

    // 각 파일이 허용된 패턴에 매칭되는지 확인
    return files.every(file =>
      micromatch.isMatch(file, rule.allowed_patterns)
    );
  }

  private checkCommandRule(
    request: PermissionRequest,
    rule: CommandRule
  ): boolean {
    const command = request.details.command || '';

    // Blacklist 체크
    if (rule.blacklist.some(pattern =>
      micromatch.isMatch(command, pattern)
    )) {
      return false;
    }

    // Whitelist 체크
    return rule.whitelist.some(pattern =>
      micromatch.isMatch(command, pattern)
    );
  }
}
```

##### Method 3: Approval Queue (Batch Processing)

권한 요청을 큐에 모아서 일괄 처리:

```typescript
class ApprovalQueue {
  private queue: PermissionRequest[] = [];
  private processing = false;

  async add(request: PermissionRequest): Promise<boolean> {
    // Auto-approval 체크
    if (this.autoApprovalChecker.canAutoApprove(request)) {
      await this.approve(request);
      return true;
    }

    // 큐에 추가
    this.queue.push(request);

    // UI에 알림 (뱃지 카운트)
    this.notifyUI({ queueLength: this.queue.length });

    // 승인 대기
    return await this.waitForApproval(request.id);
  }

  async processBatch(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    // 모든 대기 중인 요청을 UI에 표시
    const results = await this.showBatchApprovalDialog(this.queue);

    // 결과 처리
    for (const [requestId, approved] of Object.entries(results)) {
      const request = this.queue.find(r => r.id === requestId);
      if (request) {
        if (approved) {
          await this.approve(request);
        } else {
          await this.reject(request);
        }
      }
    }

    this.queue = [];
    this.processing = false;
  }
}

// Electron Renderer - Batch Approval UI
const BatchApprovalDialog = ({ requests, onSubmit }) => {
  const [selections, setSelections] = useState({});

  return (
    <Dialog open fullWidth maxWidth="md">
      <DialogTitle>
        Approve Pending Actions ({requests.length})
      </DialogTitle>
      <DialogContent>
        <List>
          {requests.map(req => (
            <ListItem key={req.id}>
              <Checkbox
                checked={selections[req.id] || false}
                onChange={(e) => setSelections({
                  ...selections,
                  [req.id]: e.target.checked
                })}
              />
              <ListItemText
                primary={req.description}
                secondary={`${req.requestedBy} - ${req.type}`}
              />
              <Chip
                label={req.details.risk_level}
                color={req.details.risk_level === 'high' ? 'error' : 'default'}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onSubmit({})}>Reject All</Button>
        <Button onClick={() => {
          const all = {};
          requests.forEach(r => all[r.id] = true);
          onSubmit(all);
        }}>
          Approve All
        </Button>
        <Button
          variant="contained"
          onClick={() => onSubmit(selections)}
        >
          Apply Selected
        </Button>
      </DialogActions>
    </Dialog>
  );
};
```

##### Method 4: Agent Prompt Modification

에이전트 프롬프트에 권한 요청 프로토콜을 명시:

```typescript
const promptWithPermissions = `
${basePrompt}

PERMISSION PROTOCOL:
When you need to perform actions that require user approval:

1. Create a permission request file:
   Path: ${permissionDir}/request-{uuid}.json

2. Format:
\`\`\`json
{
  "id": "unique-id",
  "type": "file_write | file_delete | command_exec | git_operation",
  "description": "Human-readable description",
  "details": {
    "files": ["list", "of", "files"],
    "command": "command to execute",
    "risk_level": "low | medium | high"
  },
  "status": "pending"
}
\`\`\`

3. WAIT for the file to be updated with status "approved" or "rejected"

4. If approved, proceed with the action
   If rejected, skip the action and note it in your output

Example workflow:
- You want to create src/auth/jwt.ts
- Create permission request file
- Wait for approval (max 60 seconds)
- If approved: create the file
- If rejected or timeout: skip and note in output MD

IMPORTANT:
- Always request permission for destructive actions (delete, force push)
- Group related file operations into one request
- Set appropriate risk_level
`;
```

##### Method 5: Sandbox Mode with Post-Review

안전한 샌드박스에서 먼저 실행하고, 결과를 리뷰 후 적용:

```typescript
class SandboxExecutor {
  async executeInSandbox(subtask: Subtask): Promise<SandboxResult> {
    // 1. 임시 디렉토리에 프로젝트 복사
    const sandboxDir = await this.createSandbox();

    // 2. 샌드박스에서 에이전트 실행
    const result = await this.executeAgent(subtask, sandboxDir);

    // 3. 변경 사항 diff 생성
    const changes = await this.computeDiff(sandboxDir, this.projectDir);

    return {
      result,
      changes,
      sandboxDir
    };
  }

  async showChangesForReview(changes: FileChanges[]): Promise<boolean> {
    // Electron UI에 diff 표시
    return new Promise((resolve) => {
      ipcRenderer.send('show-changes-review', changes);

      ipcRenderer.once('changes-review-response', (event, approved) => {
        resolve(approved);
      });
    });
  }

  async applyChanges(changes: FileChanges[]): Promise<void> {
    for (const change of changes) {
      if (change.type === 'create') {
        await fs.copy(change.sandboxPath, change.targetPath);
      } else if (change.type === 'modify') {
        await fs.copy(change.sandboxPath, change.targetPath);
      } else if (change.type === 'delete') {
        await fs.remove(change.targetPath);
      }
    }
  }
}

// 사용
const sandbox = new SandboxExecutor();
const { changes } = await sandbox.executeInSandbox(subtask);

// 변경사항 리뷰
const approved = await sandbox.showChangesForReview(changes);

if (approved) {
  await sandbox.applyChanges(changes);
} else {
  console.log('Changes rejected by user');
}
```

##### 각 방법 비교

| Method | 실시간성 | 안전성 | UX | 복잡도 | 추천 |
|--------|---------|-------|-----|-------|------|
| Permission File + IPC | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Medium | ✅ Electron |
| Auto-Approval Rules | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | Low | ✅ 자동화 |
| Approval Queue | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Medium | 대량 작업 |
| Prompt Protocol | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | Low | ✅ 기본 |
| Sandbox + Review | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | High | 🎯 최고 안전 |

##### 권장 조합 (Hybrid)

```typescript
class PermissionOrchestrator {
  async requestPermission(request: PermissionRequest): Promise<boolean> {
    // 1. Auto-approval 체크
    if (this.autoApprovalChecker.canAutoApprove(request)) {
      await this.logApproval(request, 'auto');
      return true;
    }

    // 2. 실시간 승인 요청 (Electron)
    if (this.isElectronMode) {
      const approved = await this.requestViaIPC(request);
      await this.logApproval(request, approved ? 'user' : 'rejected');
      return approved;
    }

    // 3. CLI 모드 - 승인 큐에 추가
    this.queue.add(request);
    console.log(`Permission required. Run 'ai-al-gaib approve' to review.`);
    return await this.queue.waitForApproval(request.id);
  }
}
```

##### Electron UI 통합 예시

```tsx
// Main Process
const permissionManager = new PermissionManager('./.ai-al-gaib/permissions');

permissionManager.on('permission-request', (request) => {
  mainWindow.webContents.send('permission-request', request);
});

ipcMain.on('permission-response', async (event, { id, approved }) => {
  await permissionManager.respond(id, approved);
});

// Renderer Process
const App = () => {
  const [permissionRequest, setPermissionRequest] = useState(null);

  useEffect(() => {
    ipcRenderer.on('permission-request', (event, request) => {
      setPermissionRequest(request);
    });
  }, []);

  const handleApprove = () => {
    ipcRenderer.send('permission-response', {
      id: permissionRequest.id,
      approved: true
    });
    setPermissionRequest(null);
  };

  const handleReject = () => {
    ipcRenderer.send('permission-response', {
      id: permissionRequest.id,
      approved: false
    });
    setPermissionRequest(null);
  };

  return (
    <>
      {/* Main UI */}
      <MainView />

      {/* Permission Dialog */}
      {permissionRequest && (
        <PermissionDialog
          request={permissionRequest}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </>
  );
};
```

#### 9. File Naming Convention

```
.ai-al-gaib/
├── contexts/
    └── task-{timestamp}-{hash}/
        ├── input.md                    # 원본 사용자 입력
        ├── summary.md                  # 컨텍스트 요약
        ├── plan.md                     # Planner 산출물
        └── results/
            ├── 01-gemini-analysis.md   # 순서 + 에이전트 + 작업
            ├── 02-claude-design.md
            ├── 03-codex-implementation.md
            ├── 04-claude-integration.md
            ├── 05-codex-tests.md
            └── final-summary.md        # 최종 집계
```

#### 8. Error Handling in Prompts

에이전트가 에러를 보고하도록 프롬프트에 명시:

```markdown
# Error Handling

If you encounter any issues:

1. Set `status: failure` in frontmatter
2. Add an `## Errors` section with:
   - Error description
   - What you attempted
   - Suggested resolution
3. Still save the MD file (don't leave it blank)

Example error output:
\`\`\`markdown
---
status: failure
---

# Task Failed

## Errors
- Could not parse the authentication middleware
- File `src/middleware/auth.ts` not found

## Attempted
- Searched for auth middleware in common locations
- Checked imports in related files

## Suggested Resolution
- Verify the project structure
- Provide explicit path to auth middleware
\`\`\`
```

## Data Flow Example

### Example: "Refactor authentication system"

```
1. User Input (CLI)
   └─> "Refactor auth system to use JWT"

2. Orchestrator
   └─> Routes to Planner

3. Planner (Claude Code)
   Input: Full project context (summarized)
   Output: plan.md
   ┌─────────────────────────────────────┐
   │ # Plan                              │
   │ ## Subtasks                         │
   │ 1. Analyze current auth (Gemini)    │
   │ 2. Design JWT structure (Claude)    │
   │ 3. Implement JWT utils (Codex)      │
   │ 4. Update auth middleware (Claude)  │
   │ 5. Write tests (Codex)              │
   └─────────────────────────────────────┘

4. Context Manager
   └─> Creates context files for each subtask
       - subtask-1-context.md (only auth files)
       - subtask-2-context.md (design patterns)
       - ...

5. Executor
   └─> Executes subtasks sequentially/parallel

   5.1. Gemini analyzes → analysis.md (500 tokens)
   5.2. Claude designs → design.md (800 tokens)
   5.3. Codex implements → jwt-utils.ts
   5.4. Claude updates → middleware.ts
   5.5. Codex writes → auth.test.ts

6. Context Manager
   └─> Aggregates results → final-summary.md

7. Orchestrator
   └─> Returns to user with summary
```

## Technology Stack

### Core Dependencies

```json
{
  "dependencies": {
    "commander": "^latest",
    "inquirer": "^latest",
    "chalk": "^latest",
    "ora": "^latest",
    "marked": "^latest",
    "gray-matter": "^latest",
    "zod": "^latest"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsx": "^latest",
    "vitest": "^latest",
    "@types/node": "^latest"
  }
}
```

### Directory Structure

```
ai-al-gaib/
├── src/
│   ├── cli/
│   │   ├── index.ts              # CLI entry point
│   │   └── commands/
│   │       ├── plan.ts
│   │       ├── execute.ts
│   │       └── analyze.ts
│   │
│   ├── orchestrator/
│   │   ├── Orchestrator.ts       # Main orchestrator
│   │   ├── TaskRouter.ts
│   │   └── ResultAggregator.ts
│   │
│   ├── planner/
│   │   ├── Planner.ts
│   │   ├── TaskAnalyzer.ts
│   │   ├── SubtaskDecomposer.ts
│   │   └── AgentSelector.ts
│   │
│   ├── executor/
│   │   ├── Executor.ts
│   │   ├── AgentProcess.ts
│   │   └── DependencyResolver.ts
│   │
│   ├── context/
│   │   ├── ContextManager.ts
│   │   ├── Summarizer.ts
│   │   ├── ContextFilter.ts
│   │   └── MarkdownSerializer.ts
│   │
│   ├── agents/
│   │   ├── base/
│   │   │   ├── Agent.ts          # Abstract base
│   │   │   └── AgentConfig.ts
│   │   ├── claude/
│   │   │   └── ClaudeCodeAdapter.ts
│   │   ├── codex/
│   │   │   └── CodexAdapter.ts
│   │   └── gemini/
│   │       └── GeminiAdapter.ts
│   │
│   ├── types/
│   │   ├── task.ts
│   │   ├── context.ts
│   │   ├── plan.ts
│   │   └── result.ts
│   │
│   └── utils/
│       ├── markdown.ts
│       ├── file.ts
│       └── logger.ts
│
├── .ai-al-gaib/                  # Runtime data
│   ├── contexts/
│   ├── cache/
│   └── logs/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/
│   ├── ARCH.md                   # This file
│   ├── API.md
│   └── EXAMPLES.md
│
├── package.json
├── tsconfig.json
└── README.md
```

## Key Interfaces

### Task

```typescript
interface Task {
  id: string;
  type: TaskType;
  description: string;
  context: ProjectContext;
  constraints?: Constraint[];
  priority?: Priority;
}

enum TaskType {
  CODE_GENERATION = 'code_generation',
  REFACTORING = 'refactoring',
  ANALYSIS = 'analysis',
  DOCUMENTATION = 'documentation',
  TESTING = 'testing',
}
```

### Plan

```typescript
interface Plan {
  id: string;
  taskId: string;
  subtasks: Subtask[];
  dependencies: DependencyGraph;
  estimatedTokens: number;
  createdAt: Date;
}

interface Subtask {
  id: string;
  name: string;
  agent: AgentType;
  priority: number;
  contextFile: string;
  expectedOutput: string;
  dependsOn: string[];
}
```

### Context

```typescript
interface Context {
  id: string;
  summary: ContextSummary;
  files: FileContext[];
  codebase: CodebaseContext;
  history: TaskHistory[];
}

interface ContextSummary {
  oneLiner: string;
  brief: string;
  detailed: string;
  tokenCount: number;
}
```

### Agent Result

```typescript
interface AgentResult {
  agentId: string;
  subtaskId: string;
  status: 'success' | 'failure' | 'partial';
  output: string;
  files: GeneratedFile[];
  tokensUsed: number;
  executionTime: number;
  errors?: Error[];
}
```

## UI/Display Strategies

### Displaying Parallel Planner-Executor Output

CLI에서 Planner와 Executor의 출력을 동시에 보기 위한 여러 전략:

#### Option 1: TUI with Split Panes (권장)

**Library**: `ink` (React for CLI) 또는 `blessed`

**장점**:
- 실시간 분할 화면
- 가장 직관적인 UX
- 각 컴포넌트의 상태를 독립적으로 업데이트

**구현**:
```typescript
import React from 'react';
import { render, Box, Text } from 'ink';

const Dashboard = () => (
  <Box flexDirection="column">
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" padding={1}>
      <Text bold color="cyan">Planner</Text>
      <Text>[●] Analyzing task...</Text>
      <Text>[✓] Created 3 subtasks</Text>
      <Text>[●] Estimating complexity...</Text>
    </Box>

    <Box borderStyle="round" borderColor="green" flexDirection="column" padding={1} marginTop={1}>
      <Text bold color="green">Executor</Text>
      <Text>[⏳] Waiting for plan...</Text>
      <Text>[ ] Subtask 1: Pending</Text>
      <Text>[ ] Subtask 2: Pending</Text>
    </Box>
  </Box>
);
```

**실제 화면**:
```
╭─ Planner ────────────────────────────╮
│ [●] Analyzing task...                │
│ [✓] Created plan with 3 subtasks     │
│ [●] Estimating token usage...        │
│ Tokens: 1,234 / 10,000               │
╰──────────────────────────────────────╯

╭─ Executor ───────────────────────────╮
│ [✓] Claude Code: Ready               │
│ [●] Subtask 1: Analyzing auth.ts     │
│ [ ] Subtask 2: Pending               │
│ [ ] Subtask 3: Pending               │
╰──────────────────────────────────────╯

╭─ Progress ───────────────────────────╮
│ ████████░░░░░░░░░░░░░░░░ 33%         │
╰──────────────────────────────────────╯
```

#### Option 2: Interleaved Output with Prefixes

**Library**: `chalk` + `ora`

**장점**:
- 구현이 간단
- 모든 터미널에서 작동
- 로그 파일로 저장하기 쉬움

**단점**:
- 정보가 섞여서 읽기 어려울 수 있음
- 업데이트가 누적됨 (스크롤 필요)

**구현**:
```typescript
import chalk from 'chalk';
import ora from 'ora';

const plannerSpinner = ora({
  prefixText: chalk.cyan('[Planner]'),
  text: 'Starting...'
});

const executorSpinner = ora({
  prefixText: chalk.green('[Executor]'),
  text: 'Initializing...'
});

// Parallel updates
plannerSpinner.start();
executorSpinner.start();

plannerSpinner.text = 'Analyzing task...';
executorSpinner.text = 'Waiting for plan...';
```

**실제 화면**:
```
[Planner]  ⠋ Analyzing task structure...
[Executor] ⠙ Waiting for plan...
[Planner]  ✓ Task analyzed (2.3s)
[Planner]  ⠋ Creating subtasks...
[Executor] ⠙ Initializing agents...
[Planner]  ✓ Created 3 subtasks (1.1s)
[Executor] ✓ Claude Code ready (0.8s)
[Executor] ⠋ Executing subtask 1...
```

#### Option 3: Sequential with Expandable Sections

**Library**: `inquirer` + `chalk`

**장점**:
- 깔끔한 인터페이스
- 완료된 섹션은 축소 가능
- 진행 중인 것만 강조

**구현**:
```typescript
console.log(chalk.cyan('▼ Planner') + chalk.gray(' (completed in 2.3s)'));
console.log('  ✓ Task analyzed');
console.log('  ✓ 3 subtasks created');
console.log('  ✓ Token estimate: 1,234');
console.log('');
console.log(chalk.green('▶ Executor') + chalk.yellow(' (running...)'));
console.log('  ⏳ Subtask 1: In progress');
console.log('  ⏸  Subtask 2: Pending');
console.log('  ⏸  Subtask 3: Pending');
```

**실제 화면**:
```
▼ Planner (completed in 2.3s)
  ✓ Task analyzed
  ✓ 3 subtasks created
  ✓ Token estimate: 1,234

▶ Executor (running...)
  ⏳ Subtask 1: Analyzing auth.ts (30%)
     ├─ Reading file...
     ├─ Calling Claude Code API...
     └─ Waiting for response...
  ⏸  Subtask 2: Update middleware
  ⏸  Subtask 3: Write tests
```

#### Option 4: Tabs Interface

**Library**: `blessed-contrib`

**장점**:
- 각 컴포넌트를 탭으로 분리
- 상세 로그를 볼 때 유용
- 키보드로 전환 가능

**실제 화면**:
```
┌───────────────────────────────────────────────────┐
│ [1] Overview  [2] Planner  [3] Executor  [4] Logs │
├───────────────────────────────────────────────────┤
│                                                   │
│  Task: Refactor authentication system            │
│                                                   │
│  Status: Planning Complete, Executing...         │
│                                                   │
│  Planner:   ✓ Complete (2.3s)                    │
│  Executor:  ⏳ Running (45% - 1m 23s elapsed)    │
│                                                   │
│  Current: Subtask 2/3 - Updating middleware      │
│                                                   │
│  ████████████░░░░░░░░░░░░ 45%                    │
│                                                   │
└───────────────────────────────────────────────────┘

Press Tab to switch views, Ctrl+C to cancel
```

#### Option 5: Electron Desktop App (강력 추천!)

**Library**: Electron + React + shadcn/ui + Tailwind CSS

**장점**:
- 터미널 출력 + MD 파일 미리보기를 **동시에** 볼 수 있음
- 네이티브 파일 시스템 접근
- VS Code와 유사한 현대적이고 깔끔한 UX (shadcn/ui 기반)
- 오프라인 작동
- 멀티 패널 레이아웃
- Markdown 실시간 렌더링

**단점**:
- 번들 사이즈 (100MB+)
- 개발 복잡도 증가
- 배포 프로세스 필요

**구현**:
```bash
# CLI에서 Electron 앱 실행
ai-al-gaib auto "task" --ui

# 또는 독립 실행형
ai-al-gaib-ui
```

**실제 화면** (Electron):
```
┌─────────────────────────────────────────────────────────────────┐
│  File  View  Task  Help                    [_] [□] [×]          │
├─────────────────────────────────────────────────────────────────┤
│ ┌─ Explorer ──────┬─ Terminal Output ──────┬─ Context Preview ─┤
│ │                 │                         │                   │
│ │ 📁 .ai-al-gaib  │ [Planner] ✓ Complete   │ # Execution Plan  │
│ │  ├─ contexts/   │ Created 3 subtasks      │                   │
│ │  │  ├─ task-1/  │                         │ ## Subtasks       │
│ │  │  │  📄 plan  │ [Executor] Running...   │                   │
│ │  │  │  📄 summ  │ ⏳ Subtask 1/3         │ 1. Analyze auth   │
│ │  │  │  📁 results│   Claude Code          │    Agent: Gemini  │
│ │  │  │     📄 c1 │   Analyzing auth.ts     │                   │
│ │  │  │     📄 fin│   Reading imports...    │ 2. Design JWT     │
│ │                 │   Parsing functions...  │    Agent: Claude  │
│ │ 📁 Project      │                         │                   │
│ │  └─ src/        │ Tokens: 1,234 / 50K    │ 3. Implement      │
│ │     └─ auth/    │ Time: 00:23            │    Agent: Codex   │
│ │                 │                         │                   │
│ └─────────────────┴─────────────────────────┴───────────────────┤
│ ╭─ Progress ──────────────────────────────────────────────────╮ │
│ │ Subtask 1: Analyzing authentication  ████████░░░░ 67%      │ │
│ ╰─────────────────────────────────────────────────────────────╯ │
└─────────────────────────────────────────────────────────────────┘
```

**주요 기능**:

1. **3-Panel Layout**:
   ```
   [Explorer] [Terminal] [Preview]
      30%        40%        30%
   ```

2. **File Explorer**:
   - `.ai-al-gaib/contexts/` 자동 감지
   - 클릭하면 우측 Preview에 렌더링
   - 실시간 파일 변경 감지

3. **Terminal Output**:
   - `xterm.js`로 실제 터미널 에뮬레이션
   - Planner/Executor 출력 색상 구분
   - 스크롤 가능, 검색 가능

4. **Context Preview**:
   - Markdown 실시간 렌더링 (`react-markdown`)
   - 코드 스니펫 하이라이팅 (`prismjs`)
   - 목차 자동 생성
   - 파일 참조 링크 클릭 가능

**기술 스택**:
```json
{
  "dependencies": {
    "electron": "^28.0.0",
    "react": "^18.0.0",
    "shadcn-ui": "^latest",      // UI Components
    "tailwind-css": "^latest",    // Styling for shadcn
    "lucide-react": "^latest",    // Icons
    "xterm": "^5.3.0",
    "react-markdown": "^9.0.0",
    "prismjs": "^1.29.0",
    "chokidar": "^3.5.0",         // File watching
    "split-pane-react": "^0.1.0"  // Resizable panels
  }
}
```

#### Option 6: VS Code Extension (최고의 통합!)

**Library**: VS Code Extension API

**장점**:
- 개발자들이 이미 사용하는 환경
- 번들 사이즈 걱정 없음
- VS Code의 모든 기능 활용 가능
- 파일 에디터와 완벽 통합
- 배포가 쉬움 (Marketplace)

**구현**:
```bash
# VS Code에서 실행
Cmd+Shift+P → "AI Al-Gaib: Execute Task"
```

**실제 화면** (VS Code):
```
┌─────────────────────────────────────────────────────────────────┐
│  Explorer  Search  AI-Al-Gaib  Extensions                       │
├───────────┬─────────────────────────────────────────────────────┤
│ EXPLORER  │  📝 plan.md                                          │
│           │  ┌──────────────────────────────────────────────┐   │
│ ▼ SRC     │  │ # Execution Plan                             │   │
│   auth.ts │  │                                               │   │
│   app.ts  │  │ ## Subtasks                                   │   │
│           │  │                                               │   │
│ ▼ AI-GAIB │  │ ### 1. Analyze authentication                │   │
│   ▼ task-1│  │ - Agent: Gemini                              │   │
│     plan  │  │ - Status: ✓ Complete                         │   │
│     summ  │  │ - Output: [View Results](./results/gemini.md)│   │
│     ▼ res │  │                                               │   │
│       gem │  │ ### 2. Design JWT structure                  │   │
│       cla │  │ - Agent: Claude Code                         │   │
│       fin │  │ - Status: ⏳ Running (45%)                   │   │
│           │  └──────────────────────────────────────────────┘   │
├───────────┴─────────────────────────────────────────────────────┤
│ ▼ OUTPUT                                                         │
│ [Planner] ✓ Task analyzed (2.3s)                                │
│ [Planner] ✓ Created 3 subtasks                                  │
│ [Executor] ✓ Gemini analysis complete                           │
│ [Executor] ⏳ Calling Claude Code API...                        │
│                                                                  │
│ ▼ TERMINAL                                                       │
│ $ ai-al-gaib auto "refactor auth"                               │
│ Planning... ████████████████████ 100%                           │
│ Executing... ████████░░░░░░░░░░░ 45%                           │
└──────────────────────────────────────────────────────────────────┘
```

**주요 기능**:

1. **Custom Sidebar**:
   - AI Al-Gaib 전용 사이드바
   - Task 히스토리
   - Context 파일 트리

2. **Output Channel**:
   - Planner/Executor 로그
   - 색상 구분 출력

3. **Webview**:
   - Markdown 미리보기
   - 인터랙티브 대시보드

4. **Commands**:
   - `AI Al-Gaib: Execute Task`
   - `AI Al-Gaib: View Plan`
   - `AI Al-Gaib: Open Dashboard`

5. **File Decorators**:
   - Context 파일에 아이콘 표시
   - Status badge (✓ complete, ⏳ running)

**Extension Structure**:
```
vscode-ai-al-gaib/
├── package.json
├── src/
│   ├── extension.ts          # Extension entry
│   ├── commands/
│   │   ├── executeTask.ts
│   │   └── viewPlan.ts
│   ├── views/
│   │   ├── sidebar.ts        # Custom sidebar
│   │   └── dashboard.ts      # Webview dashboard
│   └── providers/
│       ├── taskProvider.ts   # Tree view provider
│       └── outputProvider.ts
└── media/
    └── dashboard.html
```

#### Option 7: Web Dashboard

**Library**: Express + Socket.io + React

**장점**:
- 여러 브라우저/탭에서 동시 모니터링
- 팀 협업에 유리
- 원격 서버에서 실행 가능

**구현**:
```bash
ai-al-gaib auto "task" --web-dashboard
# Opens http://localhost:3000
```

### Recommended Approach

**Phase 1 (MVP)**: Option 2 - Interleaved Output
- 빠른 구현
- 안정적
- 디버깅 쉬움

**Phase 2**: Option 5 - Electron Desktop App
- 터미널 + MD 파일 동시 조회
- 최고의 UX
- 파일 시스템 완벽 통합

**Alternative**: Option 6 - VS Code Extension
- 개발자 친화적
- 배포 간편
- VS Code 에코시스템 활용

**Phase 3**: 추가 기능
- 웹 대시보드 (팀 협업)
- CLI 개선
- AI 학습 기능

### Display Mode Configuration

```typescript
interface DisplayConfig {
  mode: 'simple' | 'tui' | 'dashboard';
  updateInterval: number;  // ms
  showTokenUsage: boolean;
  showTimestamp: boolean;
  logToFile: boolean;
}

// CLI flags
// ai-al-gaib auto "task" --display=tui
// ai-al-gaib auto "task" --display=simple --log
// ai-al-gaib auto "task" --dashboard
```

### Technology Stack for UI

```json
{
  "dependencies": {
    "ink": "^4.0.0",              // React for CLI (TUI)
    "chalk": "^5.0.0",            // Colors
    "ora": "^6.0.0",              // Spinners
    "cli-table3": "^0.6.0",       // Tables
    "boxen": "^7.0.0",            // Boxes
    "figures": "^5.0.0",          // Unicode symbols
    "log-update": "^5.0.0"        // Update previous lines
  }
}
```

## Execution Modes

### 1. Interactive Mode
```bash
ai-al-gaib interactive
# Step-by-step execution with user confirmation
```

### 2. Auto Mode
```bash
ai-al-gaib auto "refactor auth system"
# Fully automated execution
```

### 3. Plan-Only Mode
```bash
ai-al-gaib plan "add payment integration"
# Generate plan without execution
```

### 4. Execute-Plan Mode
```bash
ai-al-gaib execute ./plan.md
# Execute a pre-generated plan
```

## Context Management Details

### Token Budget Allocation

```typescript
const TOKEN_BUDGETS = {
  // Per agent limits
  CLAUDE_CODE: 50_000,
  CODEX: 8_000,
  GEMINI: 30_000,

  // Per context type
  FULL_CONTEXT: 10_000,
  SUMMARY_CONTEXT: 2_000,
  MINIMAL_CONTEXT: 500,
};
```

### Summarization Levels

1. **Level 0: Full** - 원본 그대로 (개발 초기 단계)
2. **Level 1: Filtered** - 불필요한 부분 제거
3. **Level 2: Summarized** - AI 요약 적용
4. **Level 3: Minimal** - 핵심만 추출

## Error Handling

### Retry Strategy

```typescript
interface RetryConfig {
  maxAttempts: 3;
  backoff: 'exponential' | 'linear';
  fallbackAgent?: AgentType;
}
```

### Error Recovery

1. **Agent Failure**: 다른 에이전트로 폴백
2. **Context Too Large**: 자동 요약 레벨 증가
3. **Dependency Failure**: 의존 서브태스크 재실행
4. **Timeout**: 작업 분할 후 재시도

## Performance Considerations

### Optimization Strategies

1. **Parallel Execution**: 독립적인 서브태스크 병렬 처리
2. **Caching**: 반복되는 분석 결과 캐싱
3. **Lazy Loading**: 필요한 시점에만 컨텍스트 로드
4. **Streaming**: 대용량 결과 스트리밍 처리

### Metrics to Track

- 토큰 사용량 per agent
- 평균 실행 시간 per task type
- 컨텍스트 압축률
- 에이전트 성공률
- 사용자 만족도 (thumbs up/down)

## Security Considerations

1. **API Key Management**: 환경 변수 + keychain 통합
2. **Code Execution**: 샌드박스 환경 실행 옵션
3. **File Access**: 프로젝트 루트 제한
4. **Audit Log**: 모든 에이전트 작업 기록

## Future Extensions

1. **Custom Agents**: 사용자 정의 에이전트 추가
2. **Plugin System**: 확장 가능한 플러그인 아키텍처
3. **Web UI**: 브라우저 기반 인터페이스
4. **Team Collaboration**: 팀원 간 플랜 공유
5. **Learning System**: 과거 실행 패턴 학습

## References

- [Claude Code Documentation](https://docs.anthropic.com/claude/docs)
- [OpenAI Codex API](https://platform.openai.com/docs)
- [Google Gemini API](https://ai.google.dev/docs)
- [Planner-Executor Pattern](https://arxiv.org/abs/2305.04091)

---

**Version**: 0.1.0
**Last Updated**: 2026-01-15
**Status**: Design Phase
