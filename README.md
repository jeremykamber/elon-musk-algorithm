# Elon Musk's Algorithm — opencode Plugin

> **Question. Delete. Simplify. Accelerate. Automate.**
> A strict 5-step engineering algorithm, distilled from Elon Musk's approach to building rockets, cars, tunnels, and software — now available as an opencode agentic coding workflow.

---

## Table of Contents

- [Overview](#overview)
- [The Algorithm](#the-algorithm)
  - [Step 1: Question Every Requirement](#step-1-question-every-requirement)
  - [Step 2: Delete Any Part or Process You Can](#step-2-delete-any-part-or-process-you-can)
  - [Step 3: Simplify and Optimize](#step-3-simplify-and-optimize)
  - [Step 4: Accelerate Cycle Time](#step-4-accelerate-cycle-time)
  - [Step 5: Automate](#step-5-automate)
- [Installation](#installation)
- [Usage](#usage)
  - [Custom Tools](#custom-tools)
  - [Slash Commands](#slash-commands)
  - [Automatic Triggers](#automatic-triggers)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Examples](#examples)
- [Development](#development)
- [Philosophy](#philosophy)

---

## Overview

This plugin embeds Elon Musk's engineering algorithm directly into opencode's agentic workflow. It is more than a checklist — it is a **compiler for engineering decisions**. Every requirement, line of code, and process is stripped to its fundamentals, challenged, deleted if unnecessary, simplified, accelerated, and only then automated.

The plugin provides:

- **6 custom tools** — one for each algorithm step plus a full-run meta tool
- **Keyword-aware prompting** — when you mention optimization, deletion, or bottlenecks, the plugin suggests running the algorithm
- **`/elon-algorithm` command** — instantly activates the full 5-step framework against any target

---

## The Algorithm

The heart of this plugin is a strict 5-step sequence. **The order is the algorithm.** Breaking the order breaks the result.

### Step 1: Question Every Requirement

Every requirement — spec, ticket, constraint, rule — must have a **named human author**. Anonymous requirements from "the department" or "the spec" are rejected by default.

**Tool:** `elon-question`

```
Arguments:
  requirement  (string, required) — The requirement to challenge
  author       (string, optional) — Who authored it
  context      (string, optional) — Broader context

Output:
  Structured challenge with verdict:
  ✓ VALIDATED — survived challenge, proceed to Step 2
  ⚠ FLAGGED  — needs further investigation
  ✗ REJECTED — should be removed
```

**Challenge questions applied:**
1. Who specifically authored this requirement? Can they still defend it today?
2. What actual problem does this solve? (User need vs. internal process need)
3. What happens if we remove it completely? (Feature loss, breakage, dependencies)
4. Is the original constraint that created this still valid?
5. Would we make the same decision today, knowing what we know now?

### Step 2: Delete Any Part or Process You Can

Remove components, processes, files, functions, and dependencies relentlessly. The **10% rule** applies: if you don't end up adding back at least 10% of what you deleted, you didn't delete enough.

**Tool:** `elon-delete`

```
Arguments:
  target   (string, required) — Part, process, file, function, or dependency
  context  (string, optional) — System context

Output:
  Deletion analysis with verdict:
  🗑 DELETE — can be removed
  ✂️ TRIM  — can be reduced but not eliminated
  ✓ KEEP   — essential, proceed to Step 3
```

**Deletion analysis:**
1. Can the system work WITHOUT this?
2. What is the MINIMUM version that works?
3. What breaks if this is completely gone?
4. Would a competitor ship without this?

### Step 3: Simplify and Optimize

This step comes **third** — not first. Only optimize what survived Step 2. The most common error of a smart engineer is to optimize something that should not exist.

**Tool:** `elon-simplify`

```
Arguments:
  target   (string, required) — Component that survived deletion
  context  (string, optional) — Additional context

Output:
  Simplification analysis with verdict:
  🔧 SIMPLIFIED       — restructuring applied
  ⚡ OPTIMIZED        — performance improved
  ✓ BOTH              — simplification and optimization applied
  ✓ ALREADY CLEAN     — no changes needed, proceed to Step 4
```

**Simplification targets:**
- Reduce branches, state, and indirection
- Improve algorithms before micro-optimizations
- Right-size data structures for access patterns
- Clean up interfaces, naming, and edge cases
- Enforce consistency with codebase conventions

### Step 4: Accelerate Cycle Time

Speed up the feedback loops of what remains — but only after the first three steps. Fast cycles beat optimization every time.

**Tool:** `elon-accelerate`

```
Arguments:
  target   (string, required) — Process, pipeline, or workflow
  context  (string, optional) — Additional context

Output:
  Cycle time analysis with acceleration plan
```

**Acceleration targets:**
- Reduce build times (incremental compilation, caching)
- Speed up test execution (parallel runners, unit before integration)
- Shorten deployment pipelines (remove unnecessary stages)
- Reduce dev loop times (hot reload, watch mode)
- Smaller PRs with clearer descriptions → faster review

### Step 5: Automate

Apply automation **last**. Automation locks in process — if you automate something that should have been deleted, you now have fast, expensive, automated waste.

**Tool:** `elon-automate`

```
Arguments:
  target   (string, required) — Process ready for automation
  context  (string, optional) — Additional context

Output:
  Automation analysis with implementation plan
```

**Automation targets:**
- Linting, formatting, type checking (after code is clean)
- Testing (after tests are fast — accelerated in Step 4)
- Deployment (after pipeline is stable)
- Code generation (after patterns are stable)
- Monitoring and alerting
- CI/CD regression checks
- Infrastructure as Code

**If a process is too complex to automate, revisit Steps 1-3.**

---

## Installation

### As an npm package

```bash
npm install @opencode-ai/elon-musk-algorithm
```

Then add to your opencode config (`opencode.jsonc`):

```jsonc
{
  "plugin": ["@opencode-ai/elon-musk-algorithm"]
}
```

### From source

Clone this repository and build:

```bash
git clone <repo-url>
cd pi_elon_algorithm_plugin
npm install
npm run build
```

Then reference the local build in your opencode config:

```jsonc
{
  "plugin": ["./dist/index.js"]
}
```

---

## Usage

### Custom Tools

The plugin registers 6 tools that appear alongside opencode's built-in tools. The AI agent can call them directly.

| Tool | Step | Purpose |
|------|------|---------|
| `elon-question` | 1 | Challenge any requirement, identify its author, question its necessity |
| `elon-delete` | 2 | Evaluate a component for deletion, apply the 10% rule |
| `elon-simplify` | 3 | Simplify and optimize what survived deletion |
| `elon-accelerate` | 4 | Analyze and accelerate cycle times |
| `elon-automate` | 5 | Determine what to automate and how |
| `elon-apply` | All | Run all 5 steps in sequence against a target |

**Using `elon-apply` with step skipping:**

```json
{
  "target": "refactor the CI/CD pipeline",
  "context": "Deploying takes 45 minutes across 8 stages",
  "skipSteps": [5]
}
```

This runs Steps 1-4 but skips Step 5 (automation) — useful when you want to question, delete, simplify, and accelerate without committing to automation.

### Slash Commands

**`/elon-algorithm <target>`**

Activates the full algorithm framework against a specific target. Example:

```
/elon-algorithm refactor the authentication module
```

Outputs a formatted protocol with all 5 steps ready to execute, including direct instructions for calling each tool.

### Automatic Triggers

The plugin monitors chat messages for keywords related to engineering improvement. When you mention any of the following, it suggests running the algorithm:

```
optimize, optimization, refactor, speed up, too slow, bottleneck,
delete, remove, simplify, automate, cycle time, waste, bloat,
inefficient, technical debt, process improvement, first principles
```

Example: If you write "This function is too slow, we need to optimize it," the plugin automatically adds:

> 💡 **Tip:** You mentioned "too slow" — consider running `/elon-algorithm` to apply Elon Musk's 5-step engineering algorithm.

This is a nudge, not a blocker — the algorithm must be explicitly invoked.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    opencode Agent                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Plugin: @opencode-ai/elon-musk-algorithm                 │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐ │  │
│  │  │ Step Tools   │  │ Meta Tool   │  │ Hooks             │ │  │
│  │  │             │  │             │  │                   │ │  │
│  │  │ elon-question│  │ elon-apply  │  │ chat.message      │ │  │
│  │  │ elon-delete  │  │ (runs all   │  │ (keyword trigger)  │ │  │
│  │  │ elon-simplify│  │  5 steps)   │  │                   │ │  │
│  │  │ elon-accel.  │  │             │  │ command.exec.before│ │  │
│  │  │ elon-automate│  │             │  │ (/elon-algorithm)  │ │  │
│  │  └─────────────┘  └─────────────┘  └───────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Plugin Structure

```
src/
  index.ts              — Plugin entry point, exports the plugin function
                          and all named exports

tsconfig.json           — TypeScript configuration for building
package.json            — Package manifest (@opencode-ai/elon-musk-algorithm)
opencode.jsonc          — opencode config referencing the plugin
```

### Key Design Decisions

**Tools over system prompt injection.** Unlike many opencode plugins that modify the system prompt to steer behavior, this plugin provides explicit, callable tools. The agent must intentionally invoke a step — the algorithm is a deliberate framework, not an ambient nudge. This prevents algorithm fatigue and keeps the workflow honest.

**The order is enforced by design, not code.** Steps 1-5 are individual tools. There is no runtime check preventing Step 5 before Step 1 — the enforcement is philosophical and structural. The tool descriptions, the slash command output, and the meta-tool all emphasize the sequence. The agent learns that breaking the order produces meaningless results.

**Keyword awareness is advisory, not prescriptive.** The `chat.message` hook detects relevant keywords and suggests the algorithm, but never auto-executes or blocks. This respects the user's agency while ensuring the algorithm is top-of-mind.

---

## Configuration

The plugin requires no configuration. It works out of the box with:

- opencode v1.15.4+
- Node.js / Bun

If you want to customize behavior, the plugin currently supports:

- **Custom trigger keywords** — modify the `TRIGGER_KEYWORDS` array in `src/index.ts` (requires rebuild)
- **Step skipping** via the `skipSteps` parameter on `elon-apply`

---

## Examples

### Example 1: Refactoring a Legacy Module

```
User: This payment processor has 3,000 lines of spaghetti code.
      We need to refactor it.

Plugin: 💡 Tip: You mentioned "refactor" — consider running
        /elon-algorithm to apply the 5-step algorithm.

User: /elon-algorithm refactor the payment processor

Plugin outputs protocol:
  Step 1 — Question: Who wrote the original requirements?
  Step 2 — Delete: Can we eliminate dead code paths?
  Step 3 — Simplify: What's the minimal interface?
  Step 4 — Accelerate: How fast can we ship iterations?
  Step 5 — Automate: What tests should run automatically?
```

### Example 2: Architecture Review

```
User: /elon-algorithm review the microservices architecture

Plugin outputs:
  ╔══════════════════════════════════════════════════╗
  ║     ELON MUSK'S ALGORITHM — ACTIVATED            ║
  ╚══════════════════════════════════════════════════╝
  
  The 5-step engineering algorithm will be applied to:
  review the microservices architecture
  
  Step 1 — Question   /elon-question
  Step 2 — Delete     /elon-delete
  Step 3 — Simplify   /elon-simplify
  Step 4 — Accelerate /elon-accelerate
  Step 5 — Automate   /elon-automate
```

### Example 3: Targeted Step Execution

```
User: We're spending 20 minutes on CI. Can we speed it up?

Plugin: 💡 Tip: You mentioned "speed up" — consider running
        /elon-algorithm to apply the 5-step algorithm.

User calls elon-accelerate tool directly with:
  target: "CI pipeline (20 min build time)"
  context: "8 stages, sequential, no caching"

Tool output includes:
  • Measure current cycle time: 20 min
  • Identify bottleneck: Integration tests run sequentially
  • Parallelize: Split test suite into 4 parallel groups
  • Reduce handoffs: Merge lint + type-check into one stage
  • Shorten feedback: Fail fast on compilation errors
```

---

## Development

### Prerequisites

- Node.js 18+ or Bun
- opencode v1.15.4+

### Setup

```bash
git clone <repo-url>
cd pi_elon_algorithm_plugin
npm install
```

### Build

```bash
npm run build     # Compile TypeScript to dist/
npm run typecheck # Type-check without emitting
```

### Project Structure

```
pi_elon_algorithm_plugin/
├── src/
│   └── index.ts          # Plugin source
├── dist/                 # Compiled output
├── opencode.jsonc        # opencode configuration
├── package.json          # Package manifest
├── tsconfig.json         # TypeScript configuration
├── README.md             # This file
└── MANIFESTO.md          # Philosophical foundation
```

### Publishing

```bash
npm publish               # Publish to npm registry
```

---

## Philosophy

This plugin is an implementation of a specific engineering methodology. For a deeper discussion of the philosophy, the motivation, and the principles behind it, read [**MANIFESTO.md**](./MANIFESTO.md).

Key tenets:

- **Bloat is the default state of all systems.** Left unchecked, code, requirements, and processes expand. The algorithm is a counter-force.
- **The order is the algorithm.** Optimizing before deleting produces fast, well-architected waste. Automating a process that should not exist is the cardinal sin.
- **Every requirement must have a named author.** Anonymous authority is the enemy of clear thinking. If you cannot identify who wrote a rule, you cannot question it effectively.
- **Delete more than you think you should.** The 10% rule exists because our instincts are conservative. We keep things "just in case." That instinct must be overridden.
- **Automation is the last step, not the first.** Our industry fetishizes automation. This plugin treats it as a finishing move, applied only to what has been stripped to its essence.

---

## License

MIT
