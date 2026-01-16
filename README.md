# AI Al-Gaib

![img.png](img.png)

> Multi-Agent AI Orchestration System - Claude, Gemini, Codex를 하나의 인터페이스에서 통합 관리

## Overview

AI Al-Gaib는 여러 AI 에이전트(Claude, Gemini, Codex)를 통합하여 복잡한 작업을 계획하고 실행하는 오케스트레이션 시스템입니다. Planner가 작업을 분석하고 Executor가 실행하는 구조로, 각 에이전트의 강점을 활용할 수 있습니다.

## Architecture

AI Al-Gaib는 Planner/Executor 조합을 중심으로 한 단순한 파이프라인 위에 CLI, Electron UI, Skill 시스템을 얹은 구조입니다.

- **Planner**: 사용자 입력을 받아 Subtask로 쪼개고 필요한 스킬을 선정
- **Executor**: Planner가 만든 Subtask를 순차적으로 실행하고 결과를 기록
- **Skill Layer**: 각 에이전트별 스킬을 로딩·주입하여 일관된 실행 경험 제공
- **Interface Layer**: CLI와 Electron 앱이 동일한 orchestrator를 공유하여 어디서든 동일한 계획/실행 파이프라인 사용

이 계층화 덕분에 에이전트/스킬/인터페이스를 교체하거나 확장해도 핵심 오케스트레이션 로직은 그대로 유지됩니다.

## Features

### Multi-Agent Orchestration
- **Planner/Executor 분리**: Planner가 작업을 subtask로 분해하고, Executor가 순차적으로 실행
- **에이전트 선택 가능**: Planner와 Executor를 각각 Claude, Gemini, Codex 중 선택
- **실시간 스트리밍**: 작업 진행 상황을 실시간으로 확인

### Skills System
각 에이전트의 Skills를 통합 관리:

| Agent | Skills 위치 | 조회 방식 |
|-------|------------|----------|
| Claude | `.claude/skills/` | `claude /skills` |
| Gemini | `.gemini/skills/` | 프롬프트 질의 |
| Codex | `.codex/skills/` | 프롬프트 질의 |

- **Skill Generator**: UI에서 새로운 스킬을 AI로 생성
- **Skill 선택**: 작업 실행 시 사용할 스킬 선택 가능
- **프롬프트 주입**: 선택된 스킬이 Planner에 자동 주입

### Agent Strengths
- **Claude**: 상대적으로 작은 컨텍스트 윈도우를 가지지만 복잡한 추론과 멀티스텝 계획에 강함
- **Codex**: 큰 토큰 한도를 제공하고 코드 작성/수정에서 준수한 성능을 보여 대량의 코드 생성을 빠르게 수행
- **Gemini**: 매우 큰 컨텍스트 윈도우를 지원하여 대규모 리팩터링이나 긴 규격 문서를 다루는 작업에 유리

### Desktop Application (Electron)
- **Explorer**: 워크스페이스 파일 탐색
- **Terminal**: 작업 로그 실시간 출력
- **Plan View**: 현재 실행 중인 Plan과 Subtask 표시
- **Permission Dialog**: 파일 쓰기, 명령어 실행 등 권한 요청 처리

## Installation

```bash
# 의존성 설치
npm install

# 빌드 (Backend + UI)
npm run build

# Electron 앱 실행
npm run electron
```

## Usage

### CLI

```bash
# 작업 계획만 생성
ai-al-gaib plan "Create a REST API with Express"

# 계획 생성 후 즉시 실행
ai-al-gaib plan "Add user authentication" -r

# Planner와 Executor 지정
ai-al-gaib plan "Refactor database layer" -p claude -e gemini -r
```

**Options:**
- `-p, --planner <agent>`: Planner 에이전트 (claude, gemini, codex)
- `-e, --executor <agent>`: Executor 에이전트 (claude, gemini, codex)
- `-r, --run`: 계획 생성 후 즉시 실행

### Desktop App

1. **워크스페이스 선택**: 상단 Browse 버튼으로 프로젝트 폴더 선택
2. **에이전트 설정**: 헤더에서 Planner/Executor 드롭다운으로 선택
3. **스킬 선택**: 좌측 패널 하단 Skills 섹션에서 사용할 스킬 체크
4. **작업 입력**: 하단 터미널에 작업 설명 입력 후 Run

### Skill Generator

1. **Menu → Generate Skill** 클릭
2. 스킬 이름과 설명 입력
3. Target Agent (스킬을 사용할 에이전트) 선택
4. Generator Agent (스킬을 생성할 에이전트) 선택
5. Generate 클릭

생성된 스킬은 `{workspace}/.{agent}/skills/{name}/SKILL.md`에 저장됩니다.

## Project Structure

```
ai-al-gaib/
├── src/
│   ├── cli/              # CLI 엔트리포인트
│   ├── electron/         # Electron main process
│   ├── orchestrator/     # Planner-Executor 오케스트레이션
│   ├── planner/          # 작업 계획 생성
│   ├── agents/           # 에이전트 어댑터
│   ├── skills/           # 스킬 로더 & 생성기
│   ├── types/            # TypeScript 타입 정의
│   └── utils/            # 유틸리티
├── ui/                   # React UI (Vite)
└── release/              # 빌드된 앱
```

## Scripts

```bash
npm run build        # 전체 빌드 (Backend + UI)
npm run build:backend # Backend만 빌드
npm run build:ui     # UI만 빌드
npm run electron     # Electron 앱 실행
npm run app:dev      # 개발 모드 (HMR)
npm run dist         # 배포용 패키징
npm run dist:mac     # macOS 빌드
npm run dist:win     # Windows 빌드
npm run dist:linux   # Linux 빌드
```

## Configuration

### SKILL.md Format

```markdown
---
name: skill-name
description: 스킬 설명 (언제 사용하는지 포함)
---

# Skill Name

## Instructions
1. 단계별 지침
2. ...

## Examples
구체적인 사용 예시
```

### Context Storage

작업 결과는 `.ai-al-gaib/contexts/{task-id}/`에 저장됩니다:
- `planning-instruction.md`: Planner에 전달된 프롬프트
- `results/`: 각 Subtask의 실행 결과

## Requirements

- Node.js 18+
- 다음 CLI 중 하나 이상 설치:
  - [Claude Code](https://claude.ai/code) (`claude`)
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli) (`gemini`)
  - [OpenAI Codex](https://openai.com/codex) (`codex`)

## License

MIT
