import type { Plugin, Hooks, Config } from "@opencode-ai/plugin";
import type { TextPart } from "@opencode-ai/sdk";
import { tool } from "@opencode-ai/plugin/tool";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "node:crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ElonConfig {
  mode: "full" | "gentle" | "steps-only";
  keywords: string[];
  notifications: boolean;
}

interface SessionAlgoState {
  target: string;
  currentStep: number;
  completedSteps: number[];
  verdicts: Record<number, string>;
  context: string[];
  activatedAt: number;
}

interface StepFormatConfig {
  stepNum: number;
  icon: string;
  title: string;
  questions: string[];
  famousQuote: string;
  verdicts: { label: string; desc: string }[];
}

interface StepValidationResult {
  valid: boolean;
  verdict?: string;
  issues: string[];
  suggestions: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_KEYWORDS = [
  "optimize",
  "automate",
  "bottleneck",
  "cycle time",
  "bloat",
  "waste",
  "inefficient",
  "technical debt",
  "first principles",
  "too slow",
];

const DEFAULT_CONFIG: ElonConfig = {
  mode: "full",
  keywords: DEFAULT_KEYWORDS,
  notifications: false,
};

const FIRST_PRINCIPLES_PROMPT = `## FIRST PRINCIPLES REASONING — Mandatory Protocol

Before ANY analysis, decision, or action, you MUST explicitly write out your first-principles reasoning. This is non-negotiable. Follow this protocol:

### Step 0: Establish the Axiomatic Base
Boil the problem down to its most fundamental truths — things you are most confident are true at a foundational level. Ask:
- What are the immutable physics/laws that govern this problem?
- What constraints are real vs. inherited from convention?
- Strip away all assumptions, industry norms, and "how it's always been done."

### Check: What Is The Asymptotic Limit?
Think about the problem in the limit:
- If this were scaled to 1,000,000× volume, would it still be expensive/problematic?
- If time were compressed to near-zero, what would change?
- What is the theoretical minimum cost/complexity? (Raw material value + IP licensing — everything else is process waste.)
- What is the magic wand number: if you could rearrange atoms into the perfect shape, what would it cost?

### Check: Are You Violating Physics?
- Conservation of energy, momentum, information — anything impossible?
- If the laws of physics say no, stop. Everything else is negotiable.

### Check: Platonic Ideal vs. Existing Tools
People default to familiar tools and methods. This produces outcomes limited by those tools, not the ideal solution. Instead:
1. Imagine the platonic ideal of the perfect product/solution — the perfect arrangement of atoms.
2. THEN figure out what tools, methods, and materials you need to create that ideal.
3. Work in both directions: "what can we build with existing tools?" AND "what would the ideal look like and how do we create the tools to get there?"

### Cross-Check Conclusion Against Axioms
After your analysis, explicitly verify your conclusion against Step 0's axiomatic base:
- Does this conclusion violate any fundamental truth you identified?
- If yes, the reasoning is wrong — restart from Step 0.

### Output Format
You MUST write your first-principles reasoning in a clear, structured section at the start of every response. Use the format:

[FIRST PRINCIPLES]
[Axiomatic Base]: ...
[Asymptotic Limit]: ...
[Physics Check]: ...
[Platonic Ideal]: ...
[Conclusion Cross-Check]: ...`;

const SYSTEM_PROMPT_FULL = `${FIRST_PRINCIPLES_PROMPT}

## ELON MUSK'S ALGORITHM — Operating Protocol

You operate under The Algorithm. Follow these steps in strict order. Do NOT skip steps. Do NOT optimize before deleting. Do NOT automate before simplifying.

### Step 1: QUESTION EVERY REQUIREMENT
Identify the specific human who authored each requirement. Ignore their title or department. Assume the requirement is wrong. Your job is to make it "less dumb." No requirement is sacred.

### Step 2: DELETE ANY PART OR PROCESS YOU CAN
Remove components and steps relentlessly. If you are not forced to add back at least 10% of what you deleted, you have not deleted enough. Unused code, unnecessary features, redundant processes — all must go.

### Step 3: SIMPLIFY AND OPTIMIZE
Only now — streamline what remains. Optimizing before deletion is waste. If a component survived deletion, make it as simple as possible.

### Step 4: ACCELERATE CYCLE TIME
Find the bottleneck. Eliminate friction. Reduce iteration time. Move faster. Time is the only non-renewable resource.

### Step 5: AUTOMATE
Apply automation LAST. Automating something that should have been deleted or simplified scales the inefficiency. Only automate once Steps 1-4 are satisfied.

### Core Directives
- **First-Principles Thinking**: Strip every problem to its fundamental truths. Convention is not law.
- **Walk to the Red**: Go directly to the source of the problem. Embed yourself at the point of failure.
- **Bad News Loudly, Good News Quietly**: Surface problems immediately and with urgency.
- **Vertical Integration**: Build critical components yourself. Don't outsource what determines your quality or velocity.
- **The 10% Rule**: If you haven't had to re-add 10% of what you deleted, you were too conservative.
- **Maniacal Urgency**: Every delay is an existential threat.
- **20% Error Tolerance**: ~20% of your decisions will be wrong. Accept it. Speed beats perfection.

### Step Completion
After completing each step:
1. Commit to exactly one verdict
2. Delete all other verdict options from your response
3. Emit \`<step_done step="N">\` at the end of your response
4. Wait for the system to validate before starting the next step`;

const SYSTEM_PROMPT_GENTLE = `${FIRST_PRINCIPLES_PROMPT}

## Musk Algorithm (Gentle Mode)

Consider applying this ordered approach to your work:
1. Question every requirement
2. Delete any part or process you can
3. Simplify and optimize what remains
4. Accelerate cycle time
5. Automate last

Use these as guidelines, not enforcement.`;

const SYSTEM_PROMPT_STEPS_ONLY = `${FIRST_PRINCIPLES_PROMPT}

## Musk Algorithm Steps

1. Question every requirement
2. Delete any part or process you can
3. Simplify and optimize
4. Accelerate cycle time
5. Automate`;

// ─── Config Management ───────────────────────────────────────────────────────

let currentConfig: ElonConfig = DEFAULT_CONFIG;
let configWorktree: string = "";

function loadConfig(worktree: string): ElonConfig {
  try {
    const configPath = join(worktree, "elon.json");
    if (!existsSync(configPath)) return DEFAULT_CONFIG;
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode ?? DEFAULT_CONFIG.mode,
      keywords: parsed.keywords ?? DEFAULT_CONFIG.keywords,
      notifications: parsed.notifications ?? DEFAULT_CONFIG.notifications,
    };
  } catch (err) {
    console.warn("[elon-algorithm] Failed to load elon.json, using defaults:", err);
    return DEFAULT_CONFIG;
  }
}

function reloadConfig(): void {
  if (configWorktree) {
    currentConfig = loadConfig(configWorktree);
  }
}

// ─── State Machine ───────────────────────────────────────────────────────────

const sessions = new Map<string, SessionAlgoState>();

function initSessionState(target: string): SessionAlgoState {
  return {
    target,
    currentStep: 1,
    completedSteps: [],
    verdicts: {},
    context: [],
    activatedAt: Date.now(),
  };
}

function canExecuteStep(state: SessionAlgoState | undefined, stepNum: number): boolean {
  if (!state || state.currentStep === 0) return false;
  if (stepNum === state.currentStep) return true;
  if (state.completedSteps.includes(stepNum)) return true;
  return false;
}

function advanceStep(state: SessionAlgoState): boolean {
  if (state.currentStep >= 5) {
    state.completedSteps.push(state.currentStep);
    state.currentStep = 0;
    return false;
  }
  state.completedSteps.push(state.currentStep);
  state.currentStep++;
  return true;
}

// ─── Formatting Utilities ────────────────────────────────────────────────────

function buildStepOutput(
  stepNum: number,
  icon: string,
  title: string,
  target: string,
  context: string | undefined,
  questions: string[],
  verdicts: { label: string; desc: string }[],
): { title: string; output: string } {
  const lines: string[] = [
    `${icon} STEP ${stepNum}/5: ${title}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Target: ${target}`,
  ];
  if (context) lines.push(`Context: ${context}`);
  lines.push(``, `Analysis:`);
  for (const q of questions) lines.push(`  • ${q}`);
  lines.push(``, `Verdict (choose one and delete the others):`);
  for (const v of verdicts) lines.push(`  ${v.label} — ${v.desc}`);
  lines.push(``);
  const deleteCount = verdicts.length - 1;
  lines.push(`**You must commit to exactly one verdict above. Delete the ${deleteCount} that don't apply.**`);

  return {
    title: `Step ${stepNum}: ${title}`,
    output: lines.join("\n"),
  };
}

// ─── Step Tool Factory ───────────────────────────────────────────────────────

type StepToolArgs = {
  target: string;
  context?: string;
};

function createStepTool(config: StepFormatConfig) {
  return tool({
    description: [
      `[Step ${config.stepNum}/5] ${config.title}`,
      ``,
      config.famousQuote,
      ``,
      `This is step ${config.stepNum} of 5 in Elon Musk's engineering algorithm.`,
      `If you haven't completed steps 1-${config.stepNum - 1} yet, go back and do them first.`,
      `The order is the algorithm.`,
    ].join("\n"),
    args: {
      target: tool.schema
        .string()
        .describe(`The target to evaluate for step ${config.stepNum}: ${config.title.toLowerCase()}`),
      context: tool.schema
        .string()
        .optional()
        .describe("Additional context about the target"),
    },
    async execute(args: StepToolArgs, ctx) {
      const state = sessions.get(ctx.sessionID);
      if (!state) {
        return {
          title: `Step ${config.stepNum} Blocked`,
          output: `The algorithm hasn't been activated for this session. Run \`/elon-algorithm\` first to begin.`,
        };
      }
      if (!canExecuteStep(state, config.stepNum)) {
        const nextUnfinished = state.currentStep;
        return {
          title: `Step ${config.stepNum} Blocked — Order Enforced`,
          output: [
            `Step ${config.stepNum} cannot be executed right now.`,
            ``,
            `The algorithm MUST follow the order: **1 → 2 → 3 → 4 → 5**.`,
            `You need to complete **Step ${nextUnfinished}** first.`,
            state.completedSteps.length > 0
              ? `Completed: Step${state.completedSteps.map(s => ` ${s}`).join(",")}`
              : "No steps completed yet.",
            ``,
            `Run the tool for **Step ${nextUnfinished}**: \`elon-${["question", "delete", "simplify", "accelerate", "automate"][nextUnfinished - 1]}\``,
          ].join("\n"),
        };
      }

      return buildStepOutput(
        config.stepNum,
        config.icon,
        config.title,
        args.target,
        args.context,
        config.questions,
        config.verdicts,
      );
    },
  });
}

// ─── Step Configurations ─────────────────────────────────────────────────────

const STEP_1_CONFIG: StepFormatConfig = {
  stepNum: 1,
  icon: "🔍",
  title: "Question Every Requirement",
  famousQuote: `"Make your requirements less dumb. Your requirements are definitely dumb."`,
  questions: [
    "Who specifically authored this requirement? Can they still defend it today?",
    "What actual problem does this solve? (User need vs. internal process need)",
    "What happens if we remove it completely? (Feature loss, breakage, dependencies)",
    "Is the original constraint that created this still valid?",
    "Would we make the same decision today, knowing what we know now?",
  ],
  verdicts: [
    { label: "✅ VALIDATED", desc: "requirement survived challenge (proceed to Step 2)" },
    { label: "⚠️  FLAGGED", desc: "needs further investigation" },
    { label: "❌ REJECTED", desc: "requirement should be removed" },
  ],
};

const STEP_2_CONFIG: StepFormatConfig = {
  stepNum: 2,
  icon: "🗑️",
  title: "Delete Any Part or Process You Can",
  famousQuote: `"If you do not end up adding back at least 10% of what you delete, you didn't delete enough."`,
  questions: [
    "Can the system work WITHOUT this? (Direct usage, indirect dependencies, downstream effects)",
    "What is the MINIMUM version of this that works? (Simpler alternative, smaller scope)",
    "What breaks if this is completely gone? (Affected components, callers, consumers)",
    "Would a competitor ship without this? (Essential vs. nice-to-have)",
  ],
  verdicts: [
    { label: "🗑️  DELETE", desc: "this can be removed entirely" },
    { label: "✂️  TRIM", desc: "can be reduced but not eliminated" },
    { label: "✅ KEEP", desc: "essential (proceed to Step 3)" },
  ],
};

const STEP_3_CONFIG: StepFormatConfig = {
  stepNum: 3,
  icon: "🔧",
  title: "Simplify and Optimize",
  famousQuote: `"The most common error of a smart engineer is to optimize a thing that should not exist."`,
  questions: [
    "Can this be SIMPLER? (Fewer branches, less state, less indirection — reduce cognitive complexity)",
    "Can this be FASTER given its current design? (Algorithmic improvements before micro-optimizations)",
    "Can data structures be more efficient? (Right structure for the access pattern)",
    "Can interfaces be CLEANER? (Reduce API surface, improve naming, remove edge cases)",
    "Can patterns be MORE CONSISTENT? (Follow established conventions in the codebase)",
  ],
  verdicts: [
    { label: "🔧 SIMPLIFIED", desc: "restructuring applied" },
    { label: "⚡ OPTIMIZED", desc: "performance improved" },
    { label: "✅ BOTH", desc: "simplification and optimization applied" },
    { label: "⏭️  ALREADY CLEAN", desc: "no changes needed (proceed to Step 4)" },
  ],
};

const STEP_4_CONFIG: StepFormatConfig = {
  stepNum: 4,
  icon: "⚡",
  title: "Accelerate Cycle Time",
  famousQuote: `"Every process can be speeded up. But only do this after the first three steps."`,
  questions: [
    "How long does ONE cycle currently take? (Measure end-to-end: start to feedback)",
    "What is the BOTTLENECK? (Identify the slowest step in the chain)",
    "Can we PARALLELIZE? (Independent work streams running simultaneously)",
    "Can we REDUCE HANDOFFS? (Fewer context switches, fewer queues)",
    "Can we SHORTEN FEEDBACK LOOPS? (Faster testing, preview environments, earlier validation)",
  ],
  verdicts: [
    { label: "⏱️  CYCLE_REDUCED", desc: "measurable improvement achieved" },
    { label: "🎯 BOTTLENECK_IDENTIFIED", desc: "bottleneck found but not yet resolved" },
    { label: "✅ ALREADY_OPTIMAL", desc: "no acceleration needed (proceed to Step 5)" },
  ],
};

const STEP_5_CONFIG: StepFormatConfig = {
  stepNum: 5,
  icon: "🤖",
  title: "Automate",
  famousQuote: `"The big mistake is to begin by trying to automate every step."`,
  questions: [
    "Does this NEED to be manual at all? (Full automation, partial, or not at all?)",
    "What is the ROI of automation vs. frequency of execution? (High-frequency + manual = highest value)",
    "Can we automate just DETECTION, not the response? (Alerting before full remediation automation)",
    "Is this process stable enough to automate? (Don't automate chaos)",
  ],
  verdicts: [
    { label: "🤖 AUTOMATED", desc: "fully automated" },
    { label: "🔶 PARTIAL", desc: "partially automated, manual steps remain" },
    { label: "⏸️  NOT_READY", desc: "process needs more simplification first (revisit Step 3)" },
  ],
};

// ─── Tool Definitions ────────────────────────────────────────────────────────

const elonQuestion = createStepTool(STEP_1_CONFIG);
const elonDelete = createStepTool(STEP_2_CONFIG);
const elonSimplify = createStepTool(STEP_3_CONFIG);
const elonAccelerate = createStepTool(STEP_4_CONFIG);
const elonAutomate = createStepTool(STEP_5_CONFIG);

const elonApply = tool({
  description: `Apply all 5 steps of Elon Musk's Algorithm in strict order to any engineering concern.

1. QUESTION → "Who said so? Do we still need it?"
2. DELETE   → "Remove it. Add back only if proven necessary."
3. SIMPLIFY → "Make what remains as clean as possible."
4. ACCELERATE → "Speed up the loop now that it's right."
5. AUTOMATE → "Only now — lock it in with automation."

The order is the algorithm. Break the order, break the result.`,
  args: {
    target: tool.schema
      .string()
      .describe("The requirement, code, process, or system to apply the algorithm to"),
    context: tool.schema
      .string()
      .optional()
      .describe("Additional context about the target"),
    skipSteps: tool.schema
      .array(tool.schema.number().min(1).max(5))
      .optional()
      .describe("Optional: step numbers to skip (e.g., [5] if automation is not relevant)"),
  },
  async execute(args, ctx) {
    const skipped = new Set(args.skipSteps ?? []);
    const results: string[] = [];
    const allSteps = [STEP_1_CONFIG, STEP_2_CONFIG, STEP_3_CONFIG, STEP_4_CONFIG, STEP_5_CONFIG];

    results.push(`╔══════════════════════════════════════════════════╗`);
    results.push(`║     ELON MUSK'S ALGORITHM — FULL REPORT         ║`);
    results.push(`╚══════════════════════════════════════════════════╝`);
    results.push(``);
    results.push(`Target: ${args.target}`);
    if (args.context) results.push(`Context: ${args.context}`);
    results.push(``);
    results.push(`⚠️  The order is the algorithm. These steps MUST be followed sequentially.`);
    results.push(``);

    for (const step of allSteps) {
      if (skipped.has(step.stepNum)) continue;
      const output = buildStepOutput(
        step.stepNum,
        step.icon,
        step.title,
        args.target,
        args.context,
        step.questions,
        step.verdicts,
      );
      results.push(output.output);
      results.push(``);
    }

    results.push(`╔══════════════════════════════════════════════════╗`);
    results.push(`║  ALGORITHM COMPLETE                               ║`);
    results.push(`╚══════════════════════════════════════════════════╝`);
    results.push(``);
    results.push(`Remember: The order IS the algorithm.`);
    results.push(`If you find yourself wanting to optimize first, stop and revisit Step 1.`);

    const state = initSessionState(args.target);
    sessions.set(ctx.sessionID, state);

    return {
      title: "Elon Musk's Algorithm — Complete Report",
      output: results.join("\n"),
    };
  },
});

// ─── Helper Functions ────────────────────────────────────────────────────────

function containsTriggerKeyword(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = kw.includes(" ") ? `(?<!\\w)${escaped}(?!\\w)` : `\\b${escaped}\\b`;
    const re = new RegExp(pattern, "i");
    if (re.test(text)) return kw;
  }
  return null;
}

const VERDICT_LABELS: Record<number, string[]> = {
  1: ["VALIDATED", "FLAGGED", "REJECTED"],
  2: ["DELETE", "TRIM", "KEEP"],
  3: ["SIMPLIFIED", "OPTIMIZED", "BOTH", "ALREADY CLEAN"],
  4: ["CYCLE_REDUCED", "BOTTLENECK_IDENTIFIED", "ALREADY OPTIMAL"],
  5: ["AUTOMATED", "PARTIAL", "NOT READY"],
};

function validateStepOutput(text: string, stepNum: number): StepValidationResult {
  const issues: string[] = [];
  const suggestions: string[] = [];

  const labels = VERDICT_LABELS[stepNum] ?? [];
  const verdictRegex = new RegExp(`(${labels.join("|").replace(/\s+/g, "\\s*")})`, "i");
  const verdictMatch = text.match(verdictRegex);

  let verdict: string | undefined;
  if (verdictMatch) {
    verdict = verdictMatch[1].toUpperCase();
  } else {
    issues.push(`No clear verdict found. Expected one of: ${labels.join(", ")}`);
  }

  const analysisLines = text.split("\n").filter(l => l.trim().startsWith("•") || l.trim().startsWith("-") || /^\d+\./.test(l.trim()));
  if (analysisLines.length < 2) {
    suggestions.push("Consider providing more detailed step-by-step analysis");
  }

  if (text.length > 4000) {
    suggestions.push("Output is verbose — could key points be more concise?");
  }

  if (/\b(maybe|perhaps|we could|might|possibly|sort of|kind of)\b/i.test(text)) {
    suggestions.push("Avoid hedging language — commit to a clear verdict");
  }

  if (/\b(add|create|introduce|implement)\s+(new|another|additional)\b/i.test(text)) {
    suggestions.push("Adding new things during deletion contradicts Step 2 — verify additions are necessary");
  }

  return {
    valid: issues.length === 0,
    verdict,
    issues,
    suggestions,
  };
}

function buildCompactionContext(state: SessionAlgoState): string {
  const parts: string[] = ["Elon Musk Algorithm state:"];
  if (state.currentStep > 0) {
    parts.push(`Current step: ${state.currentStep}/5 (${["Question", "Delete", "Simplify", "Accelerate", "Automate"][state.currentStep - 1]})`);
  }
  if (state.completedSteps.length > 0) {
    parts.push(`Completed steps: ${state.completedSteps.join(" → ")}`);
  }
  parts.push(`Target: ${state.target}`);
  if (Object.keys(state.verdicts).length > 0) {
    const verdictStr = Object.entries(state.verdicts)
      .map(([k, v]) => `Step ${k}: ${v}`)
      .join(", ");
    parts.push(`Verdicts: ${verdictStr}`);
  }
  return parts.join(". ");
}

const ALGO_TOOLS = new Set(["elon-question", "elon-delete", "elon-simplify", "elon-accelerate", "elon-automate", "elon-apply"]);
const AMBIENT_TOOLS = new Set(["bash", "write", "edit", "refactor", "move", "copy", "delete", "rename"]);

const STEP_AMBINT_HINTS: Record<number, string> = {
  1: "Step 1 (Question): Before acting, consider — is this requirement still valid? Who required it?",
  2: "Step 2 (Delete): Before adding — can we remove something instead? What's the minimum change?",
  3: "Step 3 (Simplify): Simplify what remains. Fewer branches, less state, cleaner interfaces.",
  4: "Step 4 (Accelerate): Speed up the loop. What's the bottleneck right now?",
  5: "Step 5 (Automate): Automate if stable. Don't add manual steps.",
};

const STEP_NAMES = ["question", "delete", "simplify", "accelerate", "automate"];

// ─── Plugin Entry Point ──────────────────────────────────────────────────────

const elonMuskAlgorithmPlugin: Plugin = async ({ client, worktree, $ }) => {
  currentConfig = loadConfig(worktree);
  configWorktree = worktree;

  let lastNotified = 0;
  const lastUserMessages = new Map<string, string>();

  const hooks: Hooks = {
    tool: {
      "elon-question": elonQuestion,
      "elon-delete": elonDelete,
      "elon-simplify": elonSimplify,
      "elon-accelerate": elonAccelerate,
      "elon-automate": elonAutomate,
      "elon-apply": elonApply,
    },

    config: async (_input: Config) => {
      reloadConfig();
    },

    "experimental.chat.system.transform": async (_input, output) => {
      if (_input.sessionID) {
        const state = sessions.get(_input.sessionID);
        if (state && state.currentStep > 0) {
          if (currentConfig.mode === "full") {
            output.system.push(SYSTEM_PROMPT_FULL);
          } else if (currentConfig.mode === "gentle") {
            output.system.push(SYSTEM_PROMPT_GENTLE);
          } else {
            output.system.push(SYSTEM_PROMPT_STEPS_ONLY);
          }
          return;
        }

        const lastMsg = lastUserMessages.get(_input.sessionID) ?? "";
        if (lastMsg && containsTriggerKeyword(lastMsg, currentConfig.keywords)) {
          output.system.push(SYSTEM_PROMPT_STEPS_ONLY);
        }
      }
    },

    "chat.message": async (input, output) => {
      const userText = output.parts
        .filter((p): p is TextPart => p.type === "text")
        .map((p) => p.text)
        .join(" ");

      lastUserMessages.set(input.sessionID, userText);

      const match = containsTriggerKeyword(userText, currentConfig.keywords);
      if (match) {
        const part: TextPart = {
          id: randomUUID(),
          sessionID: input.sessionID,
          messageID: input.messageID ?? randomUUID(),
          type: "text",
          text: [
            ``,
            `> 💡 **Tip:** You mentioned "*${match}*" — consider running \`/elon-algorithm\``,
            `> to apply Elon Musk's 5-step engineering algorithm.`,
          ].join("\n"),
        };
        output.parts.push(part);
      }
    },

    "chat.params": async (input, output) => {
      const state = sessions.get(input.sessionID);
      if (!state || state.currentStep === 0) return;

      switch (state.currentStep) {
        case 1:
          output.temperature = 0.3;
          output.topP = 0.7;
          break;
        case 2:
          output.temperature = 0.5;
          output.topP = 0.9;
          break;
        case 3:
          output.temperature = 0.3;
          output.topP = 0.6;
          break;
        case 4:
          output.temperature = 0.5;
          output.topP = 0.8;
          break;
        case 5:
          output.temperature = 0.3;
          output.topP = 0.7;
          break;
      }
    },

    "tool.execute.before": async (input, output) => {
      const toolName = input.tool.toLowerCase();
      const state = sessions.get(input.sessionID);

      if (state && state.currentStep > 0 && AMBIENT_TOOLS.has(toolName) && output.args) {
        if (toolName === "bash" && typeof output.args.command === "string") {
          const hint = STEP_AMBINT_HINTS[state.currentStep];
          if (hint) {
            output.args = {
              ...output.args,
              command: `${output.args.command}\n# 💡 [Algorithm: ${hint}]`,
            };
          }
        }
      }

      if (state && state.currentStep > 0) {
        state.context.push(`[${new Date().toISOString()}] Tool ${toolName} invoked during Step ${state.currentStep}`);
      }
    },

    "experimental.text.complete": async (input, output) => {
      const tagMatch = output.text.match(/<step_done\s+step=["']?(\d)["']?\s*\/?>/i);
      if (!tagMatch) return;

      const step = parseInt(tagMatch[1], 10);
      const textBefore = output.text.replace(tagMatch[0], "").trim();

      const validation = validateStepOutput(textBefore, step);
      const state = sessions.get(input.sessionID);

      if (validation.valid && state) {
        const hasMore = advanceStep(state);
        state.verdicts[step] = validation.verdict ?? "completed";

        const verificationLines: string[] = [];
        verificationLines.push(``);
        verificationLines.push(`---`);
        verificationLines.push(`### ✅ Elon Verification — Step ${step} Passed`);
        verificationLines.push(``);

        if (validation.suggestions.length > 0) {
          verificationLines.push(`> 💡 **Suggestions for improvement:**`);
          for (const s of validation.suggestions) {
            verificationLines.push(`> - ${s}`);
          }
          verificationLines.push(``);
        }

        if (hasMore) {
          const nextName = STEP_NAMES[state.currentStep - 1] ?? "complete";
          verificationLines.push(`**Proceed to Step ${state.currentStep}/5** — use \`elon-${nextName}\` when ready.`);
        } else {
          verificationLines.push(`**🎉 All 5 steps completed!** The algorithm is fully applied.`);
        }

        if (validation.suggestions.some(s => s.toLowerCase().includes("adding") || s.toLowerCase().includes("verbose"))) {
          verificationLines.push(``);
          verificationLines.push(`> ⚠️ **Algorithm integrity note:** During Step ${step}, you may have added things that weren't strictly necessary. Consider reviewing the output through Step 2's lens: "Would a competitor ship without this?"`);
        }

        output.text = textBefore + verificationLines.join("\n");

        if (currentConfig.notifications) {
          const now = Date.now();
          if (now - lastNotified > 30_000) {
            lastNotified = now;
            const msg = hasMore
              ? `Step ${step} complete. Proceeding to Step ${step + 1}.`
              : "All 5 algorithm steps complete. Maximum velocity achieved.";

            try {
              await client.tui.showToast({
                body: {
                  title: "Musk Algorithm",
                  message: msg,
                  variant: "info",
                },
              });
            } catch (err) {
              console.warn("[elon-algorithm] TUI toast failed:", err);
            }

            try {
              await $`osascript -e 'display notification "${msg}" with title "Musk Algorithm"'`.quiet().nothrow();
            } catch (err) {
              console.warn("[elon-algorithm] macOS notification failed:", err);
            }
          }
        }
      } else {
        const feedback: string[] = [];
        feedback.push(``);
        feedback.push(`---`);
        feedback.push(`### ⚠️ Elon Verification — Step ${step} Needs Attention`);
        feedback.push(``);

        if (validation.issues.length > 0) {
          feedback.push(`**Issues found:**`);
          for (const issue of validation.issues) {
            feedback.push(`- ❌ ${issue}`);
          }
          feedback.push(``);
        }

        if (validation.suggestions.length > 0) {
          feedback.push(`**Suggestions:**`);
          for (const s of validation.suggestions) {
            feedback.push(`- 💡 ${s}`);
          }
          feedback.push(``);
        }

        feedback.push(`**Please revise your Step ${step} output above** — commit to a clear verdict, then emit \`<step_done step="${step}">\` again.`);

        output.text = textBefore + feedback.join("\n");
      }
    },

    "experimental.session.compacting": async (input, output) => {
      const state = sessions.get(input.sessionID);
      if (!state) return;

      const contextStr = buildCompactionContext(state);
      if (contextStr) {
        output.context.push(contextStr);
      }
    },

    "command.execute.before": async (input, output) => {
      if (input.command !== "elon-algorithm" && input.command !== "elon-algo") return;

      const target = input.arguments?.trim() || "current codebase";
      const id = randomUUID();

      const state = initSessionState(target);
      sessions.set(input.sessionID, state);

      const aliasHint = input.command === "elon-algo"
        ? ""
        : `\n> 💡 **Tip:** You can also use the shorter \`/elon-algo\` command.`;

      const part: TextPart = {
        id,
        sessionID: input.sessionID,
        messageID: id,
        type: "text",
        text: [
          `╔══════════════════════════════════════════════════╗`,
          `║     🚀 ELON MUSK'S ALGORITHM — ACTIVATED        ║`,
          `╚══════════════════════════════════════════════════╝`,
          ``,
          `The 5-step engineering algorithm will be applied to: **${target}**`,
          ``,
          `The order IS the algorithm:`,
          ``,
          `**Step 1 — Question** \`elon-question\``,
          `  "Every requirement must have a named author."`,
          ``,
          `**Step 2 — Delete** \`elon-delete\``,
          `  "If <10% is added back, you didn't delete enough."`,
          ``,
          `**Step 3 — Simplify** \`elon-simplify\``,
          `  "Never optimize what should be deleted."`,
          ``,
          `**Step 4 — Accelerate** \`elon-accelerate\``,
          `  "Speed up cycles, but only after simplifying."`,
          ``,
          `**Step 5 — Automate** \`elon-automate\``,
          `  "Last step. Don't automate waste."`,
          ``,
          `Run each step's tool individually, or use \`elon-apply\` with \`target="${target}"\` to run them all.`,
          ``,
          `To skip a step, add \`skipSteps: [N]\` to the elon-apply tool call.`,
          aliasHint,
        ].join("\n"),
      };
      output.parts = [part];
    },
  };

  return hooks;
};

export default elonMuskAlgorithmPlugin;
export { elonMuskAlgorithmPlugin };
export { elonMuskAlgorithmPlugin as server };
