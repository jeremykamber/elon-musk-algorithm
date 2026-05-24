import type { Plugin, Hooks, Config } from "@opencode-ai/plugin";
import type { TextPart, Part } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk/client";
import { tool } from "@opencode-ai/plugin/tool";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "node:crypto";

interface ElonConfig {
  mode: "full" | "gentle" | "steps-only";
  keywords: string[];
  notifications: boolean;
}

interface BlockerEntry {
  subagent: string;
  reason: string;
  step: number;
}

interface SessionAlgoState {
  target: string;
  currentStep: number;
  completedSteps: number[];
  verdicts: Record<number, string>;
  context: string[];
  activatedAt: number;
  blockers: BlockerEntry[];
}

interface StepFormatConfig {
  stepNum: number;
  icon: string;
  title: string;
  questions: string[];
  famousQuote: string;
  verdicts: { label: string; desc: string }[];
}

interface LLMSubagentFinding {
  subagent: string;
  passed: boolean;
  severity: "info" | "warning" | "critical";
  reasoning: string;
  suggestion: string | null;
}

interface SimplifyFinding {
  severity: "info" | "warning" | "critical";
  icon: string;
  category: string;
  detail: string;
}

const DEFAULT_KEYWORDS = [
  "optimize", "automate", "bottleneck", "cycle time", "bloat",
  "waste", "inefficient", "technical debt", "first principles",
  "too slow", "technical debt index", "what would it take",
  "attack the constraint", "fewer things", "raw material",
  "asymptotic limit", "platonic ideal",
];

const DEFAULT_CONFIG: ElonConfig = {
  mode: "full",
  keywords: DEFAULT_KEYWORDS,
  notifications: false,
};

const FIRST_PRINCIPLES_PROMPT = `## FIRST PRINCIPLES REASONING — Mandatory Protocol

Before ANY analysis, decision, or action, you MUST write out your first-principles reasoning. Follow this protocol:

### Step 0: Establish the Axiomatic Base
Boil the problem to its most fundamental truths. Ask: what are you most confident is true at a foundational level? What constraints are real vs. inherited from convention? Strip away all assumptions, industry norms, and "how it's always been done."

### Check: What Is The Asymptotic Limit?
Think in the limit. What would this cost at 1M units? What if time were compressed to near-zero? What is the theoretical minimum cost/complexity (raw material value + IP)? What is the magic wand number — if you could rearrange atoms into the perfect shape, what would that cost?

### Check: Are You Violating Physics?
Conservation of energy, momentum, information. If the laws of physics say no, stop. Everything else is negotiable.`;

const SYSTEM_PROMPT_FULL = `## ELON MUSK'S ALGORITHM — Operating Protocol

You operate under The Algorithm. Follow these steps in strict order. Do NOT skip steps. Do NOT optimize before deleting. Do NOT automate before simplifying.

### Step 1: QUESTION EVERY REQUIREMENT
Identify the specific human who authored each requirement. Ignore their title or department. Assume the requirement is wrong. Your job is to make it "less dumb." No requirement is sacred. Laws can be changed. This applies to legal, regulatory, and policy constraints too — if a rule exists because "that's how it's always been done," question it.

### Step 2: DELETE ANY PART OR PROCESS YOU CAN
Remove components and steps relentlessly. If you are not forced to add back at least 10% of what you deleted, you have not deleted enough. The best part is no part. Find the limit — push deletion to the breaking point, then back off slightly. Ask "how thin?", "how few?", "how fast?" until something breaks.

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
- **The 10% Rule**: If you haven't had to re-add 10% of what you deleted, you were too conservative.
- **Maniacal Urgency**: Every delay is an existential threat. Speed is the ultimate weapon.
- **20% Error Tolerance**: ~20% of your decisions will be wrong. Accept it. Speed beats perfection.
- **Fewer Things, Not More**: Complexity kills reliability. Genius has the fewest moving parts.
- **Technical Debt Index**: For any part, process, or code, calculate: complexity / essential complexity. If the ratio is >5, you have accumulated technical debt that must be addressed. Know the technical debt index of everything in your system.

### Step Completion
After completing each step:
1. Commit to exactly one verdict
2. Delete all other verdict options from your response
3. Emit \`<step_done step="N">\` at the end of your response
4. A subagent review will verify your output before the next step is unlocked`;

const SYSTEM_PROMPT_GENTLE = `## Musk Algorithm (Gentle Mode)

Consider applying this ordered approach to your work:
1. Question every requirement
2. Delete any part or process you can
3. Simplify and optimize what remains
4. Accelerate cycle time
5. Automate last

Use these as guidelines, not enforcement.`;

const SYSTEM_PROMPT_STEPS_ONLY = `## Musk Algorithm Steps

1. Question every requirement
2. Delete any part or process you can
3. Simplify and optimize
4. Accelerate cycle time
5. Automate`;

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

const sessions = new Map<string, SessionAlgoState>();

function initSessionState(target: string): SessionAlgoState {
  return {
    target,
    currentStep: 1,
    completedSteps: [],
    verdicts: {},
    context: [],
    activatedAt: Date.now(),
    blockers: [],
  };
}

function canExecuteStep(state: SessionAlgoState | undefined, stepNum: number): boolean {
  if (!state || state.currentStep === 0) return false;
  if (state.blockers.length > 0) return false;
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

function buildStepOutput(
  stepNum: number, icon: string, title: string,
  target: string, context: string | undefined,
  questions: string[], verdicts: { label: string; desc: string }[],
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
  return { title: `Step ${stepNum}: ${title}`, output: lines.join("\n") };
}

type StepToolArgs = { target: string; context?: string };

function createStepTool(config: StepFormatConfig) {
  return tool({
    description: [
      `[Step ${config.stepNum}/5] ${config.title}`,
      ``, config.famousQuote, ``,
      `This is step ${config.stepNum} of 5 in Elon Musk's engineering algorithm.`,
      `If you haven't completed steps 1-${config.stepNum - 1} yet, go back and do them first.`,
      `The order is the algorithm.`,
    ].join("\n"),
    args: {
      target: tool.schema.string().describe(`The target to evaluate for step ${config.stepNum}: ${config.title.toLowerCase()}`),
      context: tool.schema.string().optional().describe("Additional context about the target"),
    },
    async execute(args: StepToolArgs, ctx) {
      const state = sessions.get(ctx.sessionID);
      if (!state) {
        return { title: `Step ${config.stepNum} Blocked`, output: `The algorithm hasn't been activated for this session. Run \`/elon-algorithm\` first to begin.` };
      }
      if (state.blockers.length > 0) {
        return {
          title: `Step ${config.stepNum} Blocked — Subagent Issues`,
          output: [
            `Step ${config.stepNum} is blocked by unresolved subagent findings:`,
            ...state.blockers.map(b => `- 🔴 **${b.subagent}:** ${b.reason}`),
            ``, `Run \`/elon-clear-blockers\` after addressing these issues.`,
          ].join("\n"),
        };
      }
      if (!canExecuteStep(state, config.stepNum)) {
        const next = state.currentStep;
        return {
          title: `Step ${config.stepNum} Blocked — Order Enforced`,
          output: [
            `Step ${config.stepNum} cannot be executed right now.`,
            `Complete **Step ${next}** first.`,
            state.completedSteps.length > 0
              ? `Completed: Step${state.completedSteps.map(s => ` ${s}`).join(",")}`
              : "No steps completed yet.",
            `Run \`elon-${["question","delete","simplify","accelerate","automate"][next-1]}\` for **Step ${next}**.`,
          ].join("\n"),
        };
      }
      return buildStepOutput(config.stepNum, config.icon, config.title, args.target, args.context, config.questions, config.verdicts);
    },
  });
}

const STEP_1_CONFIG: StepFormatConfig = {
  stepNum: 1, icon: "🔍", title: "Question Every Requirement",
  famousQuote: `"Make your requirements less dumb. Your requirements are definitely dumb."`,
  questions: [
    "Who specifically authored this requirement? Can they still defend it today?",
    "What actual problem does this solve? (User need vs. internal process need)",
    "What happens if we remove it completely?",
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
  stepNum: 2, icon: "🗑️", title: "Delete Any Part or Process You Can",
  famousQuote: `"If you do not end up adding back at least 10% of what you delete, you didn't delete enough."`,
  questions: [
    "Can the system work WITHOUT this?",
    "What is the MINIMUM version of this that works?",
    "What breaks if this is completely gone?",
    "Would a competitor ship without this?",
  ],
  verdicts: [
    { label: "🗑️  DELETE", desc: "this can be removed entirely" },
    { label: "✂️  TRIM", desc: "can be reduced but not eliminated" },
    { label: "✅ KEEP", desc: "essential (proceed to Step 3)" },
  ],
};

const STEP_3_CONFIG: StepFormatConfig = {
  stepNum: 3, icon: "🔧", title: "Simplify and Optimize",
  famousQuote: `"The most common error of a smart engineer is to optimize a thing that should not exist."`,
  questions: [
    "Can this be SIMPLER? (Fewer branches, less state, less indirection)",
    "Can this be FASTER given its current design?",
    "Can data structures be more efficient?",
    "Can interfaces be CLEANER?",
    "Can patterns be MORE CONSISTENT?",
  ],
  verdicts: [
    { label: "🔧 SIMPLIFIED", desc: "restructuring applied" },
    { label: "⚡ OPTIMIZED", desc: "performance improved" },
    { label: "✅ BOTH", desc: "simplification and optimization applied" },
    { label: "⏭️  ALREADY CLEAN", desc: "no changes needed (proceed to Step 4)" },
  ],
};

const STEP_4_CONFIG: StepFormatConfig = {
  stepNum: 4, icon: "⚡", title: "Accelerate Cycle Time",
  famousQuote: `"Every process can be speeded up. But only do this after the first three steps."`,
  questions: [
    "How long does ONE cycle currently take?",
    "What is the BOTTLENECK?",
    "Can we PARALLELIZE?",
    "Can we REDUCE HANDOFFS?",
    "Can we SHORTEN FEEDBACK LOOPS?",
  ],
  verdicts: [
    { label: "⏱️  CYCLE_REDUCED", desc: "measurable improvement achieved" },
    { label: "🎯 BOTTLENECK_IDENTIFIED", desc: "bottleneck found but not yet resolved" },
    { label: "✅ ALREADY_OPTIMAL", desc: "no acceleration needed (proceed to Step 5)" },
  ],
};

const STEP_5_CONFIG: StepFormatConfig = {
  stepNum: 5, icon: "🤖", title: "Automate",
  famousQuote: `"The big mistake is to begin by trying to automate every step."`,
  questions: [
    "Does this NEED to be manual at all?",
    "What is the ROI of automation vs. frequency of execution?",
    "Can we automate just DETECTION, not the response?",
    "Is this process stable enough to automate?",
  ],
  verdicts: [
    { label: "🤖 AUTOMATED", desc: "fully automated" },
    { label: "🔶 PARTIAL", desc: "partially automated, manual steps remain" },
    { label: "⏸️  NOT_READY", desc: "process needs more simplification first (revisit Step 3)" },
  ],
};

const elonQuestion = createStepTool(STEP_1_CONFIG);
const elonDelete = createStepTool(STEP_2_CONFIG);
const elonSimplify = createStepTool(STEP_3_CONFIG);
const elonAccelerate = createStepTool(STEP_4_CONFIG);
const elonAutomate = createStepTool(STEP_5_CONFIG);

const elonApply = tool({
  description: `Apply all 5 steps of Elon Musk's Algorithm in strict order to any engineering concern.`,
  args: {
    target: tool.schema.string().describe("The requirement, code, process, or system to apply the algorithm to"),
    context: tool.schema.string().optional().describe("Additional context"),
    skipSteps: tool.schema.array(tool.schema.number().min(1).max(5)).optional().describe("Step numbers to skip"),
  },
  async execute(args, ctx) {
    const skipped = new Set(args.skipSteps ?? []);
    const results: string[] = [];
    const allSteps = [STEP_1_CONFIG, STEP_2_CONFIG, STEP_3_CONFIG, STEP_4_CONFIG, STEP_5_CONFIG];
    results.push(`╔══════════════════════════════════════════════════╗`);
    results.push(`║     ELON MUSK'S ALGORITHM — FULL REPORT         ║`);
    results.push(`╚══════════════════════════════════════════════════╝`);
    results.push(``, `Target: ${args.target}`);
    if (args.context) results.push(`Context: ${args.context}`);
    results.push(``, `⚠️  The order is the algorithm.`, ``);
    for (const step of allSteps) {
      if (skipped.has(step.stepNum)) continue;
      const output = buildStepOutput(step.stepNum, step.icon, step.title, args.target, args.context, step.questions, step.verdicts);
      results.push(output.output, ``);
    }
    results.push(`┌──────────────────────────────────────────────────┐`);
    results.push(`│  UTILITY ASSESSMENT                              │`);
    results.push(`└──────────────────────────────────────────────────┘`);
    results.push(`For **${args.target}**, evaluate:`);
    results.push(`  • Utility improvement over current state of the art (0-100%): ___%`);
    results.push(`  • People affected: ___`);
    results.push(`  • Total utility score = improvement × reach: ___`);
    results.push(``);
    results.push(`╔══════════════════════════════════════════════════╗`);
    results.push(`║  ALGORITHM COMPLETE                               ║`);
    results.push(`╚══════════════════════════════════════════════════╝`);
    results.push(``, `Remember: The order IS the algorithm.`);
    results.push(`If you find yourself wanting to optimize first, stop and revisit Step 1.`);
    const state = initSessionState(args.target);
    sessions.set(ctx.sessionID, state);
    return { title: "Elon Musk's Algorithm — Complete Report", output: results.join("\n") };
  },
});

// ─── Technical Debt Index Tool ─────────────────────────────────────────────

const elonDebtIndex = tool({
  description: `Calculate the Technical Debt Index for any part, code, process, or product.

The Technical Debt Index answers: "How much unnecessary complexity have you accumulated?"

Formula: current complexity / essential complexity (estimated)

- Ratio <2:  Clean. Minimal technical debt.
- Ratio 2-5: Moderate. Some debt to address.
- Ratio 5-10: High. Significant debt slowing you down.
- Ratio >10:  Critical. You're drowning in complexity.

Technical debt = cost. Every point of unnecessary complexity is future pain. Know the debt index of everything in your system.`,
  args: {
    target: tool.schema.string().describe("The part, code, process, or product to analyze"),
    currentComplexity: tool.schema.number().positive().describe("Current complexity estimate (lines of code, number of steps, or subjective 1-100)"),
    essentialComplexity: tool.schema.number().positive().describe("Minimum essential complexity (same unit as current)"),
    context: tool.schema.string().optional().describe("Additional context"),
  },
  async execute(args) {
    const ratio = args.currentComplexity / args.essentialComplexity;
    const rounded = Math.round(ratio * 100) / 100;
    const excess = args.currentComplexity - args.essentialComplexity;
    const excessPct = Math.round((excess / args.currentComplexity) * 100);

    let rating: string;
    let diagnosis: string;
    if (ratio < 2) { rating = "Clean"; diagnosis = "Minimal technical debt. The complexity is close to essential complexity. Maintain this discipline."; }
    else if (ratio < 5) { rating = "Moderate"; diagnosis = "Some technical debt accumulated. Apply the algorithm: question requirements, delete what's unnecessary, simplify what remains."; }
    else if (ratio < 10) { rating = "High"; diagnosis = "Significant technical debt. This is slowing you down. Start from first principles: what is the essential complexity? What was added that shouldn't exist?"; }
    else { rating = "Critical"; diagnosis = "Critical technical debt. The complexity has completely decoupled from essential complexity. Go back to Step 0 and rebuild from first principles. Delete first, simplify second, optimize never (until the debt is addressed)."; }

    const lines: string[] = [];
    lines.push(`╔════════════════════════════════════════════╗`);
    lines.push(`║     TECHNICAL DEBT INDEX ANALYSIS         ║`);
    lines.push(`╚════════════════════════════════════════════╝`);
    lines.push(``, `Target:            ${args.target}`);
    lines.push(`Current complexity: ${args.currentComplexity}`);
    lines.push(`Essential:          ${args.essentialComplexity}`);
    if (args.context) lines.push(`Context:           ${args.context}`);
    lines.push(``, `Technical Debt Index: ${rounded}`);
    lines.push(`Rating:            ${rating}`);
    lines.push(`Excess complexity: ${excess} (${excessPct}% of total)`, ``);
    lines.push(`Diagnosis: ${diagnosis}`, ``);
    lines.push(`"Technical debt is the cost of complexity. Know your index at all times."`);
    return { title: `Technical Debt Index: ${args.target} — ${rounded}`, output: lines.join("\n"), metadata: { debtIndex: rounded, rating, excess } };
  },
});

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

function validateStepOutput(text: string, stepNum: number): { valid: boolean; verdict?: string; issues: string[]; suggestions: string[] } {
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
  if (analysisLines.length < 2) suggestions.push("Consider providing more detailed step-by-step analysis");
  if (text.length > 4000) suggestions.push("Output is verbose — could key points be more concise?");
  if (/\b(maybe|perhaps|we could|might|possibly|sort of|kind of)\b/i.test(text)) suggestions.push("Avoid hedging language — commit to a clear verdict");
  return { valid: issues.length === 0, verdict, issues, suggestions };
}

function buildCompactionContext(state: SessionAlgoState): string {
  const parts: string[] = ["Elon Musk Algorithm state:"];
  if (state.currentStep > 0) parts.push(`Current step: ${state.currentStep}/5 (${["Question","Delete","Simplify","Accelerate","Automate"][state.currentStep - 1]})`);
  if (state.completedSteps.length > 0) parts.push(`Completed steps: ${state.completedSteps.join(" → ")}`);
  parts.push(`Target: ${state.target}`);
  if (Object.keys(state.verdicts).length > 0) parts.push(`Verdicts: ${Object.entries(state.verdicts).map(([k, v]) => `Step ${k}: ${v}`).join(", ")}`);
  if (state.blockers.length > 0) parts.push(`Blocked by: ${state.blockers.map(b => b.subagent).join(", ")}`);
  return parts.join(". ");
}

// ─── LLM Subagent System ──────────────────────────────────────────────────

const SUBAGENT_PROMPT_TEMPLATE = `You are a verification subagent for Elon Musk's engineering algorithm. Your job is to analyze step output and determine if the framework's principles were properly applied.

Analyze the following step output against these engineering frameworks:

1. **First Principles**: Was the problem stripped to its axiomatic base? Were limits analyzed? Were physics constraints checked?
2. **The 10% Rule**: Was deletion aggressive enough? Would adding back 10% of deleted items be expected?
3. **Fewer Things**: Was complexity actively reduced? Could anything be simplified further?
4. **Technical Debt Index**: Was the cost of complexity considered? Was unnecessary overhead identified?
5. **Maniacal Urgency**: Was there a bias toward action? Was speed valued over perfection?
6. **Walk to the Red**: Did the analysis go directly to the source of the problem?
7. **Bad News Loudly**: Were risks and failure modes honestly surfaced?
8. **20% Error Tolerance**: Did the output acknowledge uncertainty and avoid false confidence?

For EACH framework, respond with a JSON object containing:
- "subagent": the framework name
- "passed": true/false
- "severity": "info" | "warning" | "critical"
- "reasoning": brief explanation of your assessment
- "suggestion": specific suggestion if not passed, or null if passed

Return ONLY a JSON array of 8 objects, inside a \`\`\`json code block. No other text.

Step number: {STEP}
Target: {TARGET}

Step output to analyze:
{OUTPUT}`;

function parseSubagentFindings(text: string): LLMSubagentFinding[] {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].subagent) return parsed as LLMSubagentFinding[];
  } catch {}

  const jsonMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) return parsed as LLMSubagentFinding[];
    } catch {}
  }

  const bracketMatch = text.match(/\[[\s\S]*?\{[\s\S]*?"subagent"[\s\S]*?\}\]/);
  if (bracketMatch) {
    try {
      const parsed = JSON.parse(bracketMatch[0]);
      if (Array.isArray(parsed)) return parsed as LLMSubagentFinding[];
    } catch {}
  }

  const fallback: LLMSubagentFinding[] = [
    { subagent: "First Principles", passed: /\b(axiomatic|fundamental|physics|first principles)\b/i.test(text), severity: "warning", reasoning: "Fallback analysis — LLM subagent unavailable.", suggestion: null },
    { subagent: "Maniacal Urgency", passed: /\b(speed|fast|now|immediate|urgency|accelerate)\b/i.test(text), severity: "info", reasoning: "Fallback analysis.", suggestion: null },
    { subagent: "Fewer Things", passed: /\b(simplif|reduce|fewer|delete|remove|trim|eliminate)\b/i.test(text), severity: "info", reasoning: "Fallback analysis.", suggestion: null },
  ];
  for (const name of ["The 10% Rule", "Technical Debt Index", "Walk to the Red", "Bad News Loudly", "20% Error Tolerance"]) {
    fallback.push({ subagent: name, passed: true, severity: "info", reasoning: "Fallback — could not analyze.", suggestion: null });
  }
  return fallback;
}

function buildSubagentPrompt(stepOutput: string, stepNum: number, target: string): string {
  return SUBAGENT_PROMPT_TEMPLATE
    .replace("{STEP}", String(stepNum))
    .replace("{TARGET}", target)
    .replace("{OUTPUT}", stepOutput);
}

// ─── Analysis Session Management ──────────────────────────────────────────

async function createAnalysisSession(client: OpencodeClient, parentSessionId: string): Promise<string | null> {
  try {
    const created = await client.session.create({ body: { parentID: parentSessionId } });
    return (created as any)?.id ?? null;
  } catch (err) {
    console.warn("[elon-algorithm] Failed to create analysis session:", err);
    return null;
  }
}

async function deleteAnalysisSession(client: OpencodeClient, sessionId: string): Promise<void> {
  try {
    await client.session.delete({ path: { id: sessionId } });
  } catch (err) {
    console.warn("[elon-algorithm] Failed to delete analysis session:", err);
  }
}

async function runLLMSubagents(
  client: OpencodeClient, text: string, stepNum: number, target: string,
): Promise<{ findings: LLMSubagentFinding[]; hadFailure: boolean }> {
  const analysisSessionId = await createAnalysisSession(client, "analysis-placeholder");
  if (!analysisSessionId) {
    return { findings: parseSubagentFindings(""), hadFailure: true };
  }

  try {
    const prompt = buildSubagentPrompt(text, stepNum, target);
    const result = await client.session.prompt({ body: { parts: [{ type: "text" as const, text: prompt }] }, path: { id: analysisSessionId } });
    const responseText = (result as any)?.parts?.map((p: Part) => (p as TextPart).text).filter(Boolean).join("\n") ?? "";
    const findings = parseSubagentFindings(responseText);
    await deleteAnalysisSession(client, analysisSessionId);
    return { findings, hadFailure: false };
  } catch (err) {
    console.warn("[elon-algorithm] LLM subagent analysis failed:", err);
    try { await deleteAnalysisSession(client, analysisSessionId); } catch {}
    return { findings: parseSubagentFindings(""), hadFailure: true };
  }
}

async function runLLMCodeReview(client: OpencodeClient, code: string, filename: string | undefined): Promise<string | null> {
  const fileInfo = filename ? `File: ${filename}\n\n` : "";
  const prompt = `Review this code for simplification opportunities using Elon Musk's engineering principles:

${fileInfo}\`\`\`
${code.slice(0, 4000)}
\`\`\`

Analyze for:
1. **Unnecessary complexity**: Is there code that doesn't need to exist?
2. **Over-abstraction**: Are there unnecessary wrappers, interfaces, or patterns?
3. **Fragile patterns**: Deep nesting, tight coupling, mutation sprawl
4. **Technical debt**: TODO markers, workarounds, known-broken code
5. **Delete opportunities**: What could be removed entirely without changing behavior?

Return your analysis as a JSON object with this structure:
{ "findings": [{ "severity": "critical"|"warning"|"info", "category": "string", "detail": "string", "suggestion": "string" }] }
Wrap in \`\`\`json code block.`;

  const analysisSessionId = await createAnalysisSession(client, "code-review-placeholder");
  if (!analysisSessionId) return null;

  try {
    const result = await client.session.prompt({ body: { parts: [{ type: "text" as const, text: prompt }] }, path: { id: analysisSessionId } });
    const responseText = (result as any)?.parts?.map((p: Part) => (p as TextPart).text).filter(Boolean).join("\n") ?? "";
    await deleteAnalysisSession(client, analysisSessionId);
    const jsonBlock = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonBlock) {
      const parsed = JSON.parse(jsonBlock[1]);
      if (parsed?.findings?.length > 0) {
        const lines: string[] = [];
        lines.push(``, `---`, `### 🔬 LLM Code Simplification Review`);
        for (const f of parsed.findings) {
          const icon = f.severity === "critical" ? "🔴" : f.severity === "warning" ? "🟡" : "🔵";
          lines.push(`\n${icon} **${f.category}:** ${f.detail}`);
          if (f.suggestion) lines.push(`  → ${f.suggestion}`);
        }
        return lines.join("\n");
      }
    }
    return null;
  } catch (err) {
    console.warn("[elon-algorithm] LLM code review failed:", err);
    try { await deleteAnalysisSession(client, analysisSessionId); } catch {}
    return null;
  }
}

// ─── Heuristic Code Simplification Analyzer ───────────────────────────────

const IMPLEMENT_TOOLS = new Set(["write", "edit", "refactor"]);

function analyzeCodeForSimplification(code: string): SimplifyFinding[] {
  const findings: SimplifyFinding[] = [];
  const lines = code.split("\n");
  const totalLines = lines.length;

  if (totalLines > 200) findings.push({ severity: "warning", icon: "📏", category: "File Length", detail: `File is ${totalLines} lines. Long files hide complexity.` });
  let maxIndent = 0;
  for (const line of lines) { const indent = line.search(/\S/); if (indent > maxIndent) maxIndent = indent; }
  if (maxIndent > 24) findings.push({ severity: "critical", icon: "🪺", category: "Nesting Depth", detail: `Code reaches depth ${maxIndent / 2} levels. Deeply nested code is fragile.` });
  else if (maxIndent > 16) findings.push({ severity: "warning", icon: "🪺", category: "Nesting Depth", detail: `Code reaches depth ${maxIndent / 2} levels. Consider reducing nesting.` });
  const conditionalCount = (code.match(/\bif\s*\(/g) || []).length + (code.match(/\belse\s+if\b/g) || []).length + (code.match(/\bswitch\s*\(/g) || []).length;
  if (totalLines > 0 && conditionalCount / totalLines > 0.2) findings.push({ severity: "warning", icon: "🔀", category: "Conditionals", detail: `${conditionalCount} conditionals in ${totalLines} lines (${Math.round(conditionalCount / totalLines * 100)}%). Fragile logic.` });
  const wrapperCount = (code.match(/return\s+\w+\(/g) || []).length;
  if (wrapperCount > 5) findings.push({ severity: "info", icon: "🔄", category: "Indirection", detail: `${wrapperCount} one-line wrappers. Each adds fragility without value.` });
  const typeEscapes = (code.match(/\bas\s+any\b|@ts-ignore|@ts-expect-error/g) || []).length;
  if (typeEscapes > 0) findings.push({ severity: "warning", icon: "🏗️", category: "Type Escapes", detail: `${typeEscapes} type safety violations. Each is a debt that WILL compound.` });
  const emptyCatches = (code.match(/catch\s*\([\w\s]+\)\s*\{\s*\}/g) || []).length;
  if (emptyCatches > 0) findings.push({ severity: "critical", icon: "🕳️", category: "Empty Catches", detail: `${emptyCatches} empty catch blocks. Silent failures are the worst kind of debt.` });
  const debtMarkers = (code.match(/\bTODO|FIXME|HACK|XXX|WORKAROUND\b/gi) || []).length;
  if (debtMarkers > 5) findings.push({ severity: "warning", icon: "📋", category: "Technical Debt", detail: `${debtMarkers} debt markers. Each one is a promise to fix later that won't be kept.` });
  else if (debtMarkers > 0) findings.push({ severity: "info", icon: "📋", category: "Technical Debt", detail: `${debtMarkers} debt marker(s).` });
  return findings;
}

function findingsToOutput(findings: SimplifyFinding[], llmReview: string | null): string {
  if (findings.length === 0 && !llmReview) return "";
  const lines: string[] = [];
  lines.push(``, `---`, `### 🔬 Code Simplification Subagent Review`);
  if (findings.length > 0) {
    for (const f of findings) {
      const icon = f.severity === "critical" ? "🔴" : f.severity === "warning" ? "🟡" : "🔵";
      lines.push(`\n${icon} **${f.category}:** ${f.detail}`);
    }
  }
  if (llmReview) lines.push(llmReview);
  if (findings.some(f => f.severity === "critical")) {
    lines.push(`\n**🔴 Critical issues found.** Address these before considering this implementation complete.`, `"We are on a deletion rampage. Nothing is sacred." — Elon Musk`);
  } else if (findings.length > 0) {
    lines.push(`\n**${findings.length} simplification opportunities identified.** Review and apply the algorithm.`);
  }
  return lines.join("\n");
}

const ALGO_TOOLS = new Set(["elon-question", "elon-delete", "elon-simplify", "elon-accelerate", "elon-automate", "elon-apply", "elon-debt-index"]);
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
      "elon-debt-index": elonDebtIndex,
    },

    config: async (_input: Config) => { reloadConfig(); },

    "experimental.chat.system.transform": async (_input, output) => {
      if (_input.sessionID) {
        const state = sessions.get(_input.sessionID);
        if (state && state.currentStep > 0) {
          output.system.push(FIRST_PRINCIPLES_PROMPT);
          output.system.push(currentConfig.mode === "full" ? SYSTEM_PROMPT_FULL : currentConfig.mode === "gentle" ? SYSTEM_PROMPT_GENTLE : SYSTEM_PROMPT_STEPS_ONLY);
          return;
        }
        const lastMsg = lastUserMessages.get(_input.sessionID) ?? "";
        if (lastMsg && containsTriggerKeyword(lastMsg, currentConfig.keywords)) {
          output.system.push(SYSTEM_PROMPT_STEPS_ONLY);
        }
      }
    },

    "chat.message": async (input, output) => {
      const userText = output.parts.filter((p): p is TextPart => p.type === "text").map((p) => p.text).join(" ");
      lastUserMessages.set(input.sessionID, userText);
      const match = containsTriggerKeyword(userText, currentConfig.keywords);
      if (match) {
        const part: TextPart = {
          id: randomUUID(), sessionID: input.sessionID, messageID: input.messageID ?? randomUUID(),
          type: "text",
          text: `\n> 💡 **Tip:** You mentioned "*${match}*" — consider running \`/elon-algorithm\` to apply Elon Musk's 5-step engineering algorithm.`,
        };
        output.parts.push(part);
      }
    },

    "chat.params": async (input, output) => {
      const state = sessions.get(input.sessionID);
      if (!state || state.currentStep === 0) return;
      switch (state.currentStep) {
        case 1: output.temperature = 0.3; output.topP = 0.7; break;
        case 2: output.temperature = 0.5; output.topP = 0.9; break;
        case 3: output.temperature = 0.3; output.topP = 0.6; break;
        case 4: output.temperature = 0.5; output.topP = 0.8; break;
        case 5: output.temperature = 0.3; output.topP = 0.7; break;
      }
    },

    "permission.ask": async (input, output) => {
      const permInput = input as unknown as { tool?: string; toolID?: string; sessionID?: string };
      const toolName = permInput.tool ?? permInput.toolID ?? "";
      if (ALGO_TOOLS.has(toolName)) return;
      const sessionID = permInput.sessionID ?? "";
      if (!sessionID) return;
      const state = sessions.get(sessionID);
      if (!state || state.blockers.length === 0) return;

      output.status = "deny";
      console.warn(`[elon-algorithm] Blocked tool ${toolName} due to ${state.blockers.length} blocker(s)`);
    },

    "tool.execute.before": async (input, output) => {
      const toolName = input.tool.toLowerCase();
      const state = sessions.get(input.sessionID);
      if (state && state.currentStep > 0 && AMBIENT_TOOLS.has(toolName) && output.args) {
        if (toolName === "bash" && typeof output.args.command === "string") {
          const hint = STEP_AMBINT_HINTS[state.currentStep];
          if (hint) output.args = { ...output.args, command: `${output.args.command}\n# 💡 [Algorithm: ${hint}]` };
        }
      }
      if (state && state.currentStep > 0) {
        state.context.push(`[${new Date().toISOString()}] Tool ${toolName} invoked during Step ${state.currentStep}`);
      }
    },

    "tool.execute.after": async (input, output) => {
      const toolName = input.tool.toLowerCase();
      if (!IMPLEMENT_TOOLS.has(toolName)) return;
      const code = input.args?.content ?? input.args?.newString ?? null;
      if (!code || typeof code !== "string" || code.length < 50) return;

      const heuristicFindings = analyzeCodeForSimplification(code);
      let llmReview: string | null = null;

      if (code.length > 5000) {
        const filename = input.args?.filePath ?? input.args?.file ?? undefined;
        llmReview = await runLLMCodeReview(client, code, filename);
      }

      const outputText = findingsToOutput(heuristicFindings, llmReview);
      if (outputText) {
        output.output = (output.output ?? "") + outputText;
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
        const prevStep = state.currentStep;
        const prevCompleted = [...state.completedSteps];
        const hasMore = advanceStep(state);
        state.verdicts[step] = validation.verdict ?? "completed";

        const { findings: subagentFindings, hadFailure } = await runLLMSubagents(client, textBefore, step, state.target);

        const criticalFailures = subagentFindings.filter(f => !f.passed && f.severity === "critical");
        const blocked = criticalFailures.length > 0;

        if (blocked) {
          state.currentStep = prevStep;
          state.completedSteps = prevCompleted;
          state.blockers.push(...criticalFailures.map(f => ({
            subagent: f.subagent, reason: f.reasoning, step,
          })));
        }

        const verificationLines: string[] = [];
        verificationLines.push(``, `---`);
        verificationLines.push(`### 🔬 Subagent Review — Step ${step}`);

        if (hadFailure) {
          verificationLines.push(`\n> ⚠️ LLM subagent analysis unavailable. Using heuristic fallback.`);
        }

        const failed = subagentFindings.filter(f => !f.passed);
        const passed = subagentFindings.filter(f => f.passed);

        if (failed.length > 0) {
          verificationLines.push(`\n**❌ Failed checks:**`);
          for (const f of failed) {
            const icon = f.severity === "critical" ? "🔴" : f.severity === "warning" ? "🟡" : "🔵";
            verificationLines.push(`\n${icon} **${f.subagent}:** ${f.reasoning}`);
            if (f.suggestion) verificationLines.push(`  → ${f.suggestion}`);
          }
        }

        if (passed.length > 0) {
          verificationLines.push(`\n**✅ Passed checks:**`);
          for (const f of passed) {
            verificationLines.push(`- **${f.subagent}:** ${f.reasoning}`);
          }
        }

        if (blocked) {
          verificationLines.push(``);
          verificationLines.push(`> 🚫 **${criticalFailures.length} critical issue(s) BLOCKING progress.** Address them above, then run \`/elon-clear-blockers\` after fixing.`);
        } else if (hasMore) {
          const nextName = STEP_NAMES[state.currentStep - 1] ?? "complete";
          verificationLines.push(`\n**Proceed to Step ${state.currentStep}/5** — use \`elon-${nextName}\` when ready.`);
        } else {
          verificationLines.push(`\n**🎉 All 5 steps completed!**`);
        }

        output.text = textBefore + verificationLines.join("\n");

        if (currentConfig.notifications) {
          const now = Date.now();
          if (now - lastNotified > 30_000) {
            lastNotified = now;
            const msg = hasMore ? `Step ${step} complete. Step ${step + 1} ready.` : "All 5 steps complete.";
            try {
              await (client.tui as any).showToast({ body: { title: "Musk Algorithm", message: msg, variant: "info" as const } });
            } catch (err) {
              console.warn("[elon-algorithm] Toast failed:", err);
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
        feedback.push(``, `---`, `### ⚠️ Step ${step} Needs Attention`);
        if (validation.issues.length > 0) {
          feedback.push(`\n**Issues:**`);
          for (const issue of validation.issues) feedback.push(`- ❌ ${issue}`);
        }
        if (validation.suggestions.length > 0) {
          feedback.push(`\n**Suggestions:**`);
          for (const s of validation.suggestions) feedback.push(`- 💡 ${s}`);
        }
        feedback.push(`\n**Revise and emit \`<step_done step="${step}">\` again.**`);
        output.text = textBefore + feedback.join("\n");
      }
    },

    "experimental.session.compacting": async (input, output) => {
      const state = sessions.get(input.sessionID);
      if (!state) return;
      const contextStr = buildCompactionContext(state);
      if (contextStr) output.context.push(contextStr);
    },

    "command.execute.before": async (input, output) => {
      if (input.command === "elon-clear-blockers") {
        const state = sessions.get(input.sessionID);
        if (state) {
          state.blockers = [];
          const part: TextPart = {
            id: randomUUID(), sessionID: input.sessionID, messageID: randomUUID(),
            type: "text",
            text: `✅ Blockers cleared. You can proceed with the algorithm.`,
          };
          output.parts = [part];
          return;
        }
      }

      if (input.command !== "elon-algorithm" && input.command !== "elon-algo") return;

      const target = input.arguments?.trim() || "current codebase";
      const id = randomUUID();
      const state = initSessionState(target);
      sessions.set(input.sessionID, state);

      const part: TextPart = {
        id, sessionID: input.sessionID, messageID: id, type: "text",
        text: [
          `╔══════════════════════════════════════════════════╗`,
          `║     🚀 ELON MUSK'S ALGORITHM — ACTIVATED        ║`,
          `╚══════════════════════════════════════════════════╝`,
          ``, `The 5-step engineering algorithm will be applied to: **${target}**`,
          ``, `The order IS the algorithm:`, ``,
          `**Step 1 — Question** \`elon-question\``,
          `**Step 2 — Delete** \`elon-delete\``,
          `**Step 3 — Simplify** \`elon-simplify\``,
          `**Step 4 — Accelerate** \`elon-accelerate\``,
          `**Step 5 — Automate** \`elon-automate\``, ``,
          `Run each step individually, or use \`elon-apply\` to run them all.`,
          `Use \`elon-debt-index\` to measure technical debt.`,
          `Use \`/elon-clear-blockers\` if subagent reviews block progress.`,
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
