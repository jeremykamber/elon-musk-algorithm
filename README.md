# Elon Musk's Algorithm — opencode Plugin

> **Question. Delete. Simplify. Accelerate. Automate.**
> A strict 5-step engineering algorithm, distilled from Elon Musk's approach to building rockets, cars, tunnels, and software. This plugin turns the method into an agentic workflow for opencode.

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

---

## How It Works

The plugin operates on three complementary layers:

**Ambient reasoning.** The algorithm is baked into every response via system prompt injection (`experimental.chat.system.transform`). The AI internalizes the 5-step sequence as its default thinking mode — questioning, deleting, simplifying, accelerating, and automating as a matter of course.

**Enforced decisions.** Each step tool forces a concrete verdict (e.g., VALIDATED | FLAGGED | REJECTED). The AI must commit to exactly one outcome and delete the non-applicable options. No open checkboxes.

**User-gated progression.** After completing each step, the AI emits a hidden `<step_done step="N">` tag. The plugin detects it via `experimental.text.complete`, strips it from the visible output, and waits for you to review and say "proceed" before the next step begins.

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
  DELETE — can be removed
  TRIM   — can be reduced but not eliminated
  KEEP   — essential, proceed to Step 3
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
  SIMPLIFIED       — restructuring applied
  OPTIMIZED        — performance improved
  BOTH             — simplification and optimization applied
  ALREADY CLEAN    — no changes needed, proceed to Step 4
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

Verdict tokens (required):
  CYCLE_REDUCED         — measurable cycle time improvement planned or achieved
  BOTTLENECK_IDENTIFIED — a bottleneck has been found and isolated
  ALREADY_OPTIMAL       — no meaningful cycle time gains available
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

Verdict tokens (required):
  AUTOMATED  — ready for full automation, implementation plan provided
  PARTIAL    — partial automation recommended, manual guardrails remain
  NOT_READY  — automation would lock in waste, revisit earlier steps
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

### One command

```bash
git clone https://github.com/jnikk/elon-musk-algorithm
cd elon-musk-algorithm
./install.sh
restart opencode
```

The script builds the plugin, installs it into `~/.config/opencode/`, adds the `"elon"` entry to the plugin array, registers the ELON agent with the algorithm prompt, and sets it as the default agent. No manual config editing required.

### Manual

If you prefer to do it by hand, or the script doesn't work for your setup:

```bash
# 1. Build
npm install && npm run build

# 2. Install in opencode config
cd ~/.config/opencode
npm install /path/to/elon-musk-algorithm

# 3. Add to opencode.jsonc:
```

```jsonc
{
  "plugin": ["oh-my-openagent@latest", "elon"],
  "agent": {
    "elon": {
      "model": "opencode-go/deepseek-v4-flash",
      "mode": "primary",
      "description": "Elon Musk engineering algorithm",
      "color": "#E30000",
      "prompt": "You are Elon Musk. Talk like I do — direct, blunt, efficient. Curse for emphasis. Never sugarcoat. Use phrases like 'that's fucking dumb', 'what the hell', 'obviously', 'this is stupid', 'jesus christ'. No corporate speak. Enforce SOLID, KISS, DRY, TDD on every task. Keep it simple. Question everything. Delete before optimizing. The order matters: 1. Question requirements. 2. Delete everything you can. 3. Simplify. Only now. 4. Accelerate. Find the bottleneck. 5. Automate. Last.",
      "permission": { "edit": "allow", "bash": "allow", "webfetch": "allow" },
      "maxSteps": 20
    }
  },
  "default_agent": "elon"
}
```

Then restart opencode. The "ELON" agent will appear in the agent selector as the default.

---

## Usage

### Custom Tools

The plugin registers 7 tools that appear alongside opencode's built-in tools. The AI agent can call them directly. Each step tool forces a **concrete verdict** — no open checkboxes.

| Tool | Step | Verdicts | Purpose |
|------|------|----------|---------|
| `elon-question` | 1 | `VALIDATED` `FLAGGED` `REJECTED` | Challenge a requirement, identify its human author, force a verdict |
| `elon-delete` | 2 | `DELETE` `TRIM` `KEEP` | Evaluate a component for deletion — the best part is no part |
| `elon-simplify` | 3 | `SIMPLIFIED` `OPTIMIZED` `UNCHANGED` | Simplify and optimize what survived deletion |
| `elon-accelerate` | 4 | `BOTTLENECK_FOUND` `CYCLE_IMPROVED` `NO_CHANGE` | Find the bottleneck and accelerate cycle time |
| `elon-automate` | 5 | `AUTOMATED` `MANUAL_OK` `NOT_READY` | Automate only after steps 1-4; never automate bloat |
| `elon-debt-index` | — | Ratio | Technical debt index: current / essential complexity |
| `elon-apply` | All | Combined | Run all 5 steps at once — produce verdicts for each step against a target |

### Slash Commands

**`/elon-algorithm <target>`**

Activates the full algorithm framework against a specific target. Example:

```
/elon-algorithm refactor the authentication module
```

Outputs a formatted protocol with all 5 steps ready to execute, including direct instructions for calling each tool.

### Automatic Triggers

The plugin watches chat messages for a short set of whole-word trigger keywords. When a whole-word match occurs it suggests running the algorithm. The default list is intentionally narrow.

Default keyword list, exact whole-word matching:

```
optimize
automate
bottleneck
cycle time
bloat
waste
inefficient
technical debt
first principles
too slow
```

Example: If you write "This function is too slow, we need to optimize it," the plugin will add:

> 💡 **Tip:** You mentioned "too slow" — consider running `/elon-algorithm` to apply Elon Musk's 5-step engineering algorithm.

This suggestion is a nudge, not an automatic run. The user must explicitly invoke the command or call the tools.

---

## Architecture


```
┌─────────────────────────────────────────────────────────────────────────┐
│                          opencode Agent                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Plugin: @opencode-ai/elon-musk-algorithm                           │  │
│  │                                                                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────────┐ │  │
│  │  │ Step Tools   │  │ Meta Tool   │  │ Hooks / System Integration   │ │  │
│  │  │              │  │             │  │                              │ │  │
│  │  │ elon-question│  │ elon-apply  │  │ experimental.chat.system.transform │ │  │
│  │  │ elon-delete  │  │ (runs all   │  │ (system prompt injection)     │ │  │
│  │  │ elon-simplify│  │  5 steps)   │  │ chat.message                  │ │  │
│  │  │ elon-accelerate││             │  │ (keyword trigger, whole-word) │ │  │
│  │  │ elon-automate │  │             │  │ command.execute.before (/elon-algorithm)│ │
│  │  └─────────────┘  └─────────────┘  │ experimental.text.complete      │ │  │
│  │                                     │ (<step_done> detection & strip)│ │  │
│  │                                     └──────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Plugin Structure

```
src/
  index.ts              — Plugin entry point, exports the plugin function
                          and all named exports

tsconfig.json           — TypeScript configuration for building
package.json            — Package manifest (@opencode-ai/elon-musk-algorithm)
opencode.jsonc          — opencode config referencing the plugin
elon.json               — Optional runtime configuration (project root)
CONTEXT.md              — Project context injected into system prompt
```

### Key Design Decisions

Key design notes:

- System prompt injection is part of the design. The plugin loads a concise system transform via experimental.chat.system.transform so the agent's ambient reasoning follows the algorithm. Tools still exist to force decisions.
- Each step tool forces one concrete verdict token. Tools do not return open checklists, they return a single, final verdict and a short justification.
- The agent signals step completion by emitting <step_done step="N">. experimental.text.complete is used to detect that tag. The plugin strips it before sending the visible result, then waits for the user to say "proceed" to continue.
- The meta tool elon-apply runs all five steps in sequence, you may skip steps with skipSteps. Skipping still requires the agent to emit verdicts for executed steps.
- Keyword triggers use whole-word matching and a short, curated list. They nudge, they do not auto-run the algorithm.

---

## Configuration

The plugin reads elon.json from the project root if present. Defaults work out of the box, but elon.json makes behavior explicit.

Supported fields in elon.json:

- `mode`: "full" | "gentle" | "steps-only"
  - Controls how verbose the system prompt injection is. "full" gives detailed ambient guidance, "gentle" nudges only, "steps-only" limits system transform to a one-line reminder of the sequence.
- `notifications`: boolean
  - If true, macOS notifications are emitted when a step completes.
- `keywords`: string[]
  - Replace or extend the default trigger keyword list. Matching remains whole-word.

Example elon.json:

```json
{
  "mode": "gentle",
  "notifications": true,
  "keywords": ["too slow", "bottleneck", "technical debt"]
}
```

Notes:
- If elon.json is missing, sensible defaults are used.
- `keywords` overrides the default list. The plugin still enforces whole-word matching.

---

## Examples

### Example 1: Refactoring a Legacy Module

```
User: This payment processor is too slow, it's a bottleneck for payouts.

Plugin: 💡 Tip: You mentioned "too slow" and "bottleneck" — consider running
        /elon-algorithm to apply the 5-step algorithm.

User: /elon-algorithm refactor the payment processor

Plugin outputs protocol, then runs Step 1 when asked:
  Step 1 — Question: Who wrote the original requirements?  VERDICT: VALIDATED
  <step_done step="1">  <-- detected and stripped, waiting for user

User: proceed

Plugin runs Step 2 and returns a single verdict token and a short plan:
  Step 2 — DELETE  — remove legacy webhook handler, justify and list tests to monitor
  <step_done step="2">  <-- detected and stripped

...and so on through Step 5. Each tool returns one verdict token from its allowed set.
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
User: We're spending 20 minutes on CI. This pipeline is too slow
      and the bottleneck is blocking every deploy.

Plugin: 💡 Tip: You mentioned "too slow" and "bottleneck" — consider running
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
  VERDICT: BOTTLENECK_IDENTIFIED
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
├── elon.json             # Runtime configuration
├── CONTEXT.md            # Project glossary
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
