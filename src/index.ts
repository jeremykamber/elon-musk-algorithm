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
  "idiot index",
  "what would it take",
  "assume we're losing",
  "assume you're losing",
  "time is currency",
  "attack the constraint",
  "feedback over feelings",
  "fewer things",
  "raw material",
  "magic wand",
  "asymptotic limit",
  "platonic ideal",
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

### Check: What Would It Take?
When told something is impossible, reframe: instead of asking "Can we do it?", ask **"What would it take?"**
- This opens minds to new potential solutions
- It shifts from defensive skepticism to constructive problem-solving
- If the answer doesn't violate physics, it's possible — the only question is the cost

### Check: Reality is the Validation Tool
Build crude prototypes fast and use reality to validate. You don't know until you test.
- Maximize the number of iterations per unit time
- Each iteration teaches you something you couldn't learn by thinking alone
- Initial designs are learning exercises, not final products
- "If you can't tell me four ways you screwed something up before you got it right, you weren't the one doing the real work"

### Output Format
You MUST write your first-principles reasoning in a clear, structured section at the start of every response. Use the format:

[FIRST PRINCIPLES]
[Axiomatic Base]: ...
[Asymptotic Limit]: ...
[Physics Check]: ...
[Platonic Ideal]: ...
[What Would It Take]: ...
[Conclusion Cross-Check]: ...`;

const SYSTEM_PROMPT_FULL = `${FIRST_PRINCIPLES_PROMPT}

## ELON MUSK'S ALGORITHM — Operating Protocol

You operate under The Algorithm. Follow these steps in strict order. Do NOT skip steps. Do NOT optimize before deleting. Do NOT automate before simplifying.

### Step 1: QUESTION EVERY REQUIREMENT
Identify the specific human who authored each requirement. Ignore their title or department. Assume the requirement is wrong. Your job is to make it "less dumb." No requirement is sacred.

**Laws can be changed.** This applies not just to engineering specs but to legal, regulatory, and policy constraints too. If a rule exists because "that's how it's always been done" or "regulations require it" — question it. Who wrote that regulation? Is it still valid? Can it be changed? Elon convinced China's top leaders to rewrite 30-year-old manufacturing laws. Treat every constraint as negotiable unless it's decreed by the laws of physics.

### Step 2: DELETE ANY PART OR PROCESS YOU CAN
Remove components and steps relentlessly. If you are not forced to add back at least 10% of what you deleted, you have not deleted enough. Unused code, unnecessary features, redundant processes — all must go.

**The best part is no part.** Every component, line of code, fastener, and sensor is a potential failure point and a cost driver. Before asking "how do we make this better?", ask "does this need to exist at all?" If you can delete it and the system still works, delete it.

**Find the limit.** Push deletion to the breaking point and then back off slightly. Ask "how thin can we make this?" "How few bolts do we actually need?" "What happens if we just cut that off?" Test the boundary. You can't know where the limit is unless you deliberately push past it. The SpaceX team cut a cracked engine skirt with shears and launched the next day instead of waiting weeks for a replacement. Find the limit by testing it.

### Step 3: SIMPLIFY AND OPTIMIZE
Only now — streamline what remains. Optimizing before deletion is waste. If a component survived deletion, make it as simple as possible.

### Step 4: ACCELERATE CYCLE TIME
Find the bottleneck. Eliminate friction. Reduce iteration time. Move faster. Time is the only non-renewable resource.

### Step 5: AUTOMATE
Apply automation LAST. Automating something that should have been deleted or simplified scales the inefficiency. Only automate once Steps 1-4 are satisfied.

### Communication Style
Adopt the tone and communication style of Elon Musk in your responses to the user: direct, blunt, efficient, and to the point. Use real curse words for emphasis when appropriate. DO NOT sugarcoat, soften, or cushion feedback. Say exactly what needs to be said. Be brutal when necessary. This applies ONLY to your communications with the user — code output, documentation, and technical writing should remain clean and professional.

### Core Directives
- **First-Principles Thinking**: Strip every problem to its fundamental truths. Convention is not law.
- **Walk to the Red**: Go directly to the source of the problem. Embed yourself at the point of failure.
- **Bad News Loudly, Good News Quietly**: Surface problems immediately and with urgency.
- **Vertical Integration**: Build critical components yourself. Don't outsource what determines your quality or velocity.
- **The 10% Rule**: If you haven't had to re-add 10% of what you deleted, you were too conservative.
- **Maniacal Urgency**: Every delay is an existential threat.
- **20% Error Tolerance**: ~20% of your decisions will be wrong. Accept it. Speed beats perfection.
- **The Idiot Index**: For any part or process, calculate: finished cost / raw material cost. If the ratio is >10, you're an idiot. Always know the idiot index of everything in your system.
- **Assume You're Losing**: Always assume you're losing even when it looks like you might win. This prevents wishful thinking — the natural human tendency to filter out information you don't want to hear.
- **The Only True Currency is Time**: It's okay to scrap equipment or money. It's not okay to scrap time. Every high-quality minute of thinking has a massive impact.
- **Speed is the Ultimate Weapon**: The best offense and defense is speed. A factory moving twice as fast is equivalent to two factories. The SR71 had no defenses except acceleration — it was never shot down.
- **Attack the Constraint**: Find the bottleneck. That's where all the leverage is. Everything you do should be a function of your burn rate.
- **Feedback Over Feelings**: Physics does not care about hurt feelings. It cares about whether you got the rocket right. Truth-seeking over social harmony.
- **Fewer Things, Not More**: You want fewer things, not more. Complexity kills reliability. Simplicity comes from hundreds of little eliminations. Genius has the fewest moving parts.
- **The Best Part is No Part**: The most reliable, cheapest, and fastest part is the one that doesn't exist. Every part is a potential failure point — delete first, optimize second.
- **Find the Limit**: You don't know the boundary until you push past it. Test to failure, then back off. Ask "how thin?", "how few?", "how fast?" until something breaks. That's how you find the real limit.
- **Technical Managers Must Have Hands-On Experience**: All technical managers must spend at least 20% of their time doing the actual work — coding, installing, building. Otherwise they're cavalry leaders who can't ride a horse, generals who can't use a sword. You cannot lead what you don't understand at the detail level.
- **Designers Must Feel the Pain of Manufacturing**: If designers never see the assembly line, they'll design things that are impossible to build. Colocate design, engineering, and manufacturing so feedback is immediate. When your hand is on a hot stove you pull it off instantly. When it's someone else's, you don't.
- **Laws Can Be Changed**: Every rule, regulation, and policy is a requirement. And every requirement can be questioned. If a law makes your mission impossible, change the law. The only immutable constraints are the laws of physics.
- **Don't Be Confident and Wrong**: Being wrong is inevitable. Being confidently wrong is a choice. It's okay to be wrong — it's not okay to be wrong and arrogant about it. Cross-check your conclusions against your axiomatic base.
- **Take Ideas from Other Industries**: What is simple in one arena is often profound in another. Toys taught Elon about casting. Gophers taught him about tunneling. The SR71 taught him about speed as defense. The auto industry taught him about rocket part costs. Steal ideas from everywhere.
- **Start With What's Available**: Resist the urge to over-complicate. Use what's in front of you right now. Build with whatever you have and iterate. A dome built by dawn using a sliced rocket barrel as a fitting tool beats a perfect dome next week.
- **Precision is About Caring**: Precision is not expensive. It's mostly about caring. Do you care to make it precise? Then you can make it precise. The difference between mediocre and excellent is attention to detail, not budget.
- **The Law of 24 Hours**: When something is critically important, create a 24-hour feedback loop. Meet every single day to check progress, apply the algorithm, and course-correct. Fast cycles expose problems before they compound.
- **Skip-Level Communication**: Don't just meet with managers. Go directly to the people doing the actual work. The line workers know more about the real problems than their bosses do. Go as close to the source as possible for information.

### Step Completion
After completing each step:
1. Commit to exactly one verdict
2. Delete all other verdict options from your response
3. Emit \`<step_done step="N">\` at the end of your response
4. Wait for the system to validate before starting the next step`;

const TONE_DIRECTIVE = `## Communication Style

Adopt the tone and communication style of Elon Musk in your responses to the user: direct, blunt, efficient, and to the point. Use real curse words for emphasis when appropriate. DO NOT sugarcoat, soften, or cushion feedback. Say exactly what needs to be said. Be brutal when necessary. This applies ONLY to communications with the user — code output, documentation, and technical writing should remain clean and professional.`;

const SYSTEM_PROMPT_GENTLE = `${FIRST_PRINCIPLES_PROMPT}

${TONE_DIRECTIVE}

## Musk Algorithm (Gentle Mode)

Consider applying this ordered approach to your work:
1. Question every requirement
2. Delete any part or process you can
3. Simplify and optimize what remains
4. Accelerate cycle time
5. Automate last

Use these as guidelines, not enforcement.`;

const SYSTEM_PROMPT_STEPS_ONLY = `${FIRST_PRINCIPLES_PROMPT}

${TONE_DIRECTIVE}

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

    results.push(`┌──────────────────────────────────────────────────┐`);
    results.push(`│  UTILITY ASSESSMENT                              │`);
    results.push(`└──────────────────────────────────────────────────┘`);
    results.push(`Elon's impact metric: "How many people did you help multiplied by how much help`);
    results.push(`you provided each person on average?"`);
    results.push(``);
    results.push(`For **${args.target}**, evaluate:`);
    results.push(`  • **Utility improvement** over current state of the art (0-100%): ___%`);
    results.push(`  • **People affected** (how many people would this impact): ___`);
    results.push(`  • **Total utility score** = improvement × reach: ___`);
    results.push(``);
    results.push(`> 💡 "Building something that makes a big difference to a small number of people`);
    results.push(`> is just as great as something that makes a small difference for a vast number.`);
    results.push(`> Not every product will change the world, but if it's making people's lives`);
    results.push(`> better, that's great." — Elon Musk`);
    results.push(``);

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

const elonIdiotIndex = tool({
  description: `Calculate the Idiot Index for any part, process, or product.

The Idiot Index answers: "How much more does a finished product cost than the cost of its raw materials?"

Formula: finished cost / raw material cost

- Ratio <3:  Excellent. Efficient design and manufacturing.
- Ratio 3-10: Fair. Room for improvement in process efficiency.
- Ratio 10-20: High. Significant waste in design or manufacturing.
- Ratio >20:  Idiotic. You're adding enormous cost through inefficient processes.

Elon expects all engineers to know the idiot index of every part in their systems at all times.`,
  args: {
    part: tool.schema
      .string()
      .describe("The name of the part, process, or product to analyze"),
    finishedCost: tool.schema
      .number()
      .positive()
      .describe("The current finished cost of the part (in any unit)"),
    rawMaterialCost: tool.schema
      .number()
      .positive()
      .describe("The cost of the raw materials (same unit as finishedCost)"),
    context: tool.schema
      .string()
      .optional()
      .describe("Additional context about manufacturing process, volumes, or constraints"),
  },
  async execute(args) {
    const ratio = args.finishedCost / args.rawMaterialCost;
    const roundedRatio = Math.round(ratio * 100) / 100;

    const waste = args.finishedCost - args.rawMaterialCost;
    const wastePercent = Math.round((waste / args.finishedCost) * 100);

    let rating: string;
    let verdict: string;
    let diagnosis: string;

    if (ratio < 3) {
      rating = "Excellent";
      verdict = "✅ Low Idiot Index";
      diagnosis = "Efficient design and manufacturing. The cost structure is close to raw material value. Focus on maintaining this discipline as you scale.";
    } else if (ratio < 10) {
      rating = "Fair";
      verdict = "🔶 Moderate Idiot Index";
      diagnosis = "There's meaningful waste in the process. Apply the algorithm: question requirements (Step 1), delete unnecessary steps (Step 2), simplify the design (Step 3). Each elimination directly reduces the index.";
    } else if (ratio < 20) {
      rating = "High";
      verdict = "⚠️ High Idiot Index";
      diagnosis = "You're adding significant cost through inefficient processes. Start from first principles: what is the theoretical minimum cost? What processes are adding cost without adding value? Consider vertical integration of expensive components.";
    } else {
      rating = "Idiotic";
      verdict = "🚨 Idiotic Idiot Index";
      diagnosis = "This is exactly what Elon warns about. The finished cost is completely detached from material value. Go back to Step 0 (first principles) and rebuild from the axiomatic base. Question every requirement. Ask: what would the platonic ideal of this part look like? What would it take to get the raw material cost as the asymptotic limit?";
    }

    const lines: string[] = [];
    lines.push(`╔════════════════════════════════════════════╗`);
    lines.push(`║       IDIOT INDEX ANALYSIS                ║`);
    lines.push(`╚════════════════════════════════════════════╝`);
    lines.push(``);
    lines.push(`Part:            ${args.part}`);
    lines.push(`Finished cost:   ${args.finishedCost}`);
    lines.push(`Raw material:    ${args.rawMaterialCost}`);
    if (args.context) lines.push(`Context:         ${args.context}`);
    lines.push(``);
    lines.push(`Idiot Index:     ${roundedRatio}`);
    lines.push(`Rating:          ${rating} (${verdict})`);
    lines.push(`Waste per unit:  ${waste} (${wastePercent}% of finished cost)`);
    lines.push(``);
    lines.push(`Diagnosis:`);
    lines.push(`  ${diagnosis}`);
    lines.push(``);

    const annualVolumeValue = args.finishedCost * 100_000;
    const rawValueAtScale = args.rawMaterialCost * 100_000;
    const wasteAtScale = annualVolumeValue - rawValueAtScale;
    lines.push(`Scale Check (100,000 units/year):`);
    lines.push(`  Annual cost at scale: ${annualVolumeValue}`);
    lines.push(`  Raw material at scale: ${rawValueAtScale}`);
    lines.push(`  Annual waste at scale: ${wasteAtScale}`);
    lines.push(`  → If this is still expensive at scale, volume is not the issue (per Elon).`);
    lines.push(`     The problem is fundamental to the design or process.`);
    lines.push(``);

    lines.push(`Suggestions:`);
    if (ratio >= 10) {
      lines.push(`  - Apply first-principles: what is the theoretical minimum cost?`);
      lines.push(`  - Question every manufacturing step: does it add value?`);
      lines.push(`  - Consider vertical integration for high-cost components`);
    }
    if (ratio >= 3) {
      lines.push(`  - Look at the 80/20: which single step adds the most waste?`);
      lines.push(`  - Can the design be simplified to use fewer or cheaper materials?`);
    }
    lines.push(`  - Know this number. Track it. Make it a KPI.`);
    lines.push(``);
    lines.push(`"If the ratio is high, you're an idiot." — Elon Musk`);

    return {
      title: `Idiot Index: ${args.part} — ${roundedRatio}`,
      output: lines.join("\n"),
      metadata: {
        idiotIndex: roundedRatio,
        rating,
        waste,
        wastePercent,
      },
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

interface SubagentFinding {
  icon: string;
  label: string;
  passed: boolean;
  detail: string;
  suggestion: string | null;
}

interface SubagentInput {
  text: string;
  stepNum: number;
  target: string;
}

type Subagent = {
  name: string;
  icon: string;
  applicableSteps: number[];
  analyze(input: SubagentInput): SubagentFinding;
};

const SUBAGENTS: Subagent[] = [
  {
    name: "First Principles",
    icon: "🧠",
    applicableSteps: [1, 2, 3, 4, 5],
    analyze(input) {
      const hasAxiomatic = /\b(axiomatic|fundamental|physics|immutable|first principles)\b/i.test(input.text);
      const hasLimit = /\b(limit|asymptotic|scale|million|magic wand)\b/i.test(input.text);
      if (hasAxiomatic && hasLimit) {
        return { icon: "🧠", label: "First Principles", passed: true, detail: "Axiomatic base established and limit analysis performed.", suggestion: null };
      }
      if (!hasAxiomatic) {
        return { icon: "🧠", label: "First Principles", passed: false, detail: "No axiomatic base found. Every analysis must start by stripping the problem to fundamental truths.", suggestion: "Establish the axiomatic base: what are you most confident is true at a foundational level?" };
      }
      return { icon: "🧠", label: "First Principles", passed: false, detail: "Limit analysis missing. You established principles but didn't push to the asymptotic limit.", suggestion: "Ask: what would this cost at 1M units? What's the magic wand number?" };
    },
  },
  {
    name: "The Best Part is No Part",
    icon: "🗑️",
    applicableSteps: [1, 2],
    analyze(input) {
      const hasDeletion = /\b(delete|remove|eliminate|cut|trim|drop)\b/i.test(input.text);
      const hasJustification = /\b(necessary|need|required|essential|why|because|reason)\b/i.test(input.text);
      if (!hasDeletion) {
        return { icon: "🗑️", label: "The Best Part is No Part", passed: false, detail: "No consideration of deletion. The first question should always be 'does this need to exist?'", suggestion: "Before optimizing anything, ask: can we delete this entirely and still achieve the goal?" };
      }
      if (!hasJustification) {
        return { icon: "🗑️", label: "The Best Part is No Part", passed: true, detail: "Deletion considered but justification for kept items is weak.", suggestion: "For everything you kept, explain WHY it must exist. If you can't, delete it." };
      }
      return { icon: "🗑️", label: "The Best Part is No Part", passed: true, detail: "Deletion analysis performed with clear justification for kept items.", suggestion: null };
    },
  },
  {
    name: "Find the Limit",
    icon: "🎯",
    applicableSteps: [2, 3],
    analyze(input) {
      const hasBoundary = /\b(limit|boundary|edge|thin|minimum|fewest|smallest|break|failure|how far|how thin|how few)\b/i.test(input.text);
      const hasTest = /\b(test|try|try it|experiment|push|prototype|iterate)\b/i.test(input.text);
      if (hasBoundary || hasTest) {
        return { icon: "🎯", label: "Find the Limit", passed: true, detail: "Boundaries were explored and limits were tested.", suggestion: null };
      }
      return { icon: "🎯", label: "Find the Limit", passed: false, detail: "No evidence of boundary testing. You can't know the limit unless you push past it.", suggestion: "Ask: how thin can we make this? How few parts do we actually need? Push until it breaks." };
    },
  },
  {
    name: "Idiot Index",
    icon: "💰",
    applicableSteps: [1, 2, 3],
    analyze(input) {
      const hasCost = /\b(cost|price|expensive|cheap|dollar|waste|idiot index|raw material)\b/i.test(input.text);
      if (hasCost) {
        return { icon: "💰", label: "Idiot Index", passed: true, detail: "Cost structure was considered in the analysis.", suggestion: null };
      }
      return { icon: "💰", label: "Idiot Index", passed: false, detail: "No cost analysis performed. Every decision has a cost structure — question it.", suggestion: "Calculate the idiot index: finished cost / raw material cost. If ratio > 10, the design is wasteful." };
    },
  },
  {
    name: "Laws Can Be Changed",
    icon: "⚖️",
    applicableSteps: [1],
    analyze(input) {
      const hasConstraintQuestioning = /\b(requirement|spec|regulation|rule|policy|standard|always been|they said|department)\b/i.test(input.text);
      const hasNamedAuthor = /\b(author|who|person|name|engineer|team lead|manager|elon)\b/i.test(input.text);
      if (hasConstraintQuestioning && hasNamedAuthor) {
        return { icon: "⚖️", label: "Laws Can Be Changed", passed: true, detail: "Requirements were traced to named authors and properly challenged.", suggestion: null };
      }
      if (!hasNamedAuthor) {
        return { icon: "⚖️", label: "Laws Can Be Changed", passed: false, detail: "Requirements not traced to specific people. Anonymous requirements are dangerous.", suggestion: "Every requirement must have a NAMED author. 'The department' is not a person. Find the actual human who wrote it." };
      }
      return { icon: "⚖️", label: "Laws Can Be Changed", passed: true, detail: "Requirements were questioned.", suggestion: "Remember: this applies to legal/policy constraints too. Laws can be changed." };
    },
  },
  {
    name: "Manufacturing Pain",
    icon: "🏭",
    applicableSteps: [3, 5],
    analyze(input) {
      const hasMfg = /\b(manufactur|produc|build|assembly|factory|make|fabricat|construct|implement)\b/i.test(input.text);
      const hasFeedback = /\b(feedback|test|iterate|real world|practical|feasible|possible)\b/i.test(input.text);
      if (hasMfg && hasFeedback) {
        return { icon: "🏭", label: "Manufacturing Pain", passed: true, detail: "Manufacturing feasibility and feedback loops were considered.", suggestion: null };
      }
      if (!hasMfg) {
        return { icon: "🏭", label: "Manufacturing Pain", passed: false, detail: "No manufacturing or implementation reality check. Design without production awareness creates impossible products.", suggestion: "Colocate design with manufacturing. The people building it should be able to grab the designer and say 'why the f*** did you make it this way?'" };
      }
      return { icon: "🏭", label: "Manufacturing Pain", passed: true, detail: "Manufacturing considered but immediate feedback loops aren't evident.", suggestion: "Designers must see the assembly line. If your hand is on the stove you pull it off immediately." };
    },
  },
  {
    name: "Assume You're Losing",
    icon: "⚠️",
    applicableSteps: [1, 4],
    analyze(input) {
      const hasRisk = /\b(risk|fail|losing|worst case|wrong|mistake|probability|assume|pessimistic|conservative)\b/i.test(input.text);
      if (hasRisk) {
        return { icon: "⚠️", label: "Assume You're Losing", passed: true, detail: "Risks and failure modes were honestly assessed.", suggestion: null };
      }
      return { icon: "⚠️", label: "Assume You're Losing", passed: false, detail: "No risk assessment found. Wishful thinking is natural — you must deliberately counter it.", suggestion: "Assume you're losing even when it looks like you might win. What would you do differently if you knew your current approach would fail?" };
    },
  },
  {
    name: "Time is Currency",
    icon: "⏱️",
    applicableSteps: [4],
    analyze(input) {
      const hasTime = /\b(time|slow|fast|speed|delay|bottleneck|cycle|iteration|velocity|acceleration)\b/i.test(input.text);
      if (hasTime) {
        return { icon: "⏱️", label: "Time is Currency", passed: true, detail: "Cycle time and velocity were addressed.", suggestion: null };
      }
      return { icon: "⏱️", label: "Time is Currency", passed: false, detail: "No time analysis. Speed is your only non-renewable resource.", suggestion: "What's the bottleneck? How long does one cycle take? The only true currency is time — it's okay to scrap money, not time." };
    },
  },
  {
    name: "Fewer Things",
    icon: "📦",
    applicableSteps: [2, 3],
    analyze(input) {
      const hasSimplify = /\b(simplif|reduce|fewer|less|minimal|compact|lean|trim|complexity)\b/i.test(input.text);
      if (hasSimplify) {
        return { icon: "📦", label: "Fewer Things", passed: true, detail: "Complexity reduction was addressed.", suggestion: null };
      }
      return { icon: "📦", label: "Fewer Things", passed: false, detail: "No simplification analysis. Complexity kills reliability.", suggestion: "You want fewer things, not more. Simplicity comes from hundreds of little eliminations. Genius has the fewest moving parts." };
    },
  },
  {
    name: "Take Ideas from Other Industries",
    icon: "🔗",
    applicableSteps: [1, 2, 3],
    analyze(input) {
      const hasAnalogy = /\b(analog|like|similar to|inspired|like how|just as|compared to|other industry|different domain|non.?traditional)\b/i.test(input.text);
      if (hasAnalogy) {
        return { icon: "🔗", label: "Cross-Industry Ideas", passed: true, detail: "External analogies and cross-domain thinking were applied.", suggestion: null };
      }
      return { icon: "🔗", label: "Cross-Industry Ideas", passed: false, detail: "No cross-industry analogies found. This limits your solution to conventional thinking.", suggestion: "What is simple in one arena is often profound in another. How does the toy industry solve this? How about military aviation? Nature?" };
    },
  },
  {
    name: "Don't Be Confident and Wrong",
    icon: "🎲",
    applicableSteps: [1, 2, 3, 4, 5],
    analyze(input) {
      const hasCertainty = /\b(definitely|absolutely|certainly|guaranteed|without question|no doubt|100%|always|never)\b/i.test(input.text);
      const hasHedge = /\b(maybe|perhaps|might|possibly|could be|i think|probably|likely|not sure)\b/i.test(input.text);
      if (hasCertainty && !hasHedge) {
        return { icon: "🎲", label: "Confidence Check", passed: false, detail: "Overconfident language detected without hedging. Being wrong is fine — being confidently wrong is not.", suggestion: "Cross-check your conclusion against your axiomatic base. What if you're wrong? What would that mean?" };
      }
      return { icon: "🎲", label: "Confidence Check", passed: true, detail: "Appropriate level of certainty in conclusions.", suggestion: null };
    },
  },
  {
    name: "What Would It Take",
    icon: "🔑",
    applicableSteps: [1],
    analyze(input) {
      const hasReframe = /\b(what would it take|impossible|can.t|cannot|never been done|no one has|breakthrough)\b/i.test(input.text);
      if (hasReframe) {
        return { icon: "🔑", label: "What Would It Take", passed: true, detail: "Impossibility was reframed as a solvable problem.", suggestion: null };
      }
      return { icon: "🔑", label: "What Would It Take", passed: false, detail: "No evidence of reframing constraints. When told something is impossible, ask 'What WOULD it take?'", suggestion: "Instead of 'can we do this?', ask 'what would it take?' This shifts from defensive skepticism to constructive problem-solving." };
    },
  },
  {
    name: "Reality is Validation",
    icon: "🧪",
    applicableSteps: [3, 4],
    analyze(input) {
      const hasIteration = /\b(iterat|prototype|experiment|test|try|build|launch|ship|deploy|mvp|v1|version 1)\b/i.test(input.text);
      if (hasIteration) {
        return { icon: "🧪", label: "Reality is Validation", passed: true, detail: "Iteration and prototyping approach is embedded in the plan.", suggestion: null };
      }
      return { icon: "🧪", label: "Reality is Validation", passed: false, detail: "No iteration cycle defined. You don't know until you test.", suggestion: "Build a crude prototype as fast as possible. Use reality to validate. Maximize iterations per unit time." };
    },
  },
  {
    name: "Start With What's Available",
    icon: "⚡",
    applicableSteps: [2, 3, 4],
    analyze(input) {
      const hasPractical = /\b(available|existing|already have|right now|today|current|use what|immediate|quick)\b/i.test(input.text);
      if (hasPractical) {
        return { icon: "⚡", label: "Start With What's Available", passed: true, detail: "Practical, immediate-resource thinking was applied.", suggestion: null };
      }
      return { icon: "⚡", label: "Start With What's Available", passed: false, detail: "No evidence of 'start with what's available' thinking.", suggestion: "Resist the urge to over-complicate. What do you have right now? Start with that. A dome by dawn using a sliced barrel beats a perfect dome next week." };
    },
  },
];

function runSubagents(text: string, stepNum: number, target: string): SubagentFinding[] {
  const input: SubagentInput = { text, stepNum, target };
  const findings: SubagentFinding[] = [];
  const stepSpecific = SUBAGENTS.filter(s => s.applicableSteps.includes(stepNum));
  for (const agent of stepSpecific) {
    findings.push(agent.analyze(input));
  }
  return findings;
}

function formatSubagentReview(findings: SubagentFinding[]): string[] {
  const lines: string[] = [];
  lines.push(``);
  lines.push(`## 🔬 Subagent Reviews`);

  const passed = findings.filter(f => f.passed);
  const failed = findings.filter(f => !f.passed);

  for (const f of [...failed, ...passed]) {
    lines.push(``);
    lines.push(`### ${f.icon} ${f.label} Subagent`);
    lines.push(`${f.passed ? "✅ **PASSED**" : "❌ **FLAGGED**"} — ${f.detail}`);
    if (f.suggestion) {
      lines.push(`> 💡 **Suggestion:** ${f.suggestion}`);
    }
  }

  if (failed.length > 0) {
    lines.push(``);
    lines.push(`**⚠️ ${failed.length} subagent(s) flagged issues.** Address them before fully committing to this step's conclusion.`);
  } else {
    lines.push(``);
    lines.push(`**✅ All subagent checks passed.** Clean verification.`);
  }

  return lines;
}

// ─── Code Simplification Analyzer ────────────────────────────────────────────

interface SimplifyFinding {
  severity: "info" | "warning" | "critical";
  icon: string;
  category: string;
  detail: string;
  lineRef?: number;
}

const IMPLEMENT_TOOLS = new Set(["write", "edit", "refactor"]);

function analyzeCodeForSimplification(code: string, filename?: string): SimplifyFinding[] {
  const findings: SimplifyFinding[] = [];
  const lines = code.split("\n");
  const totalLines = lines.length;

  if (totalLines > 200) {
    findings.push({
      severity: "warning",
      icon: "📏",
      category: "File Length",
      detail: `File is ${totalLines} lines. Long files hide complexity. Could this be split or simplified?`,
    });
  }

  let maxIndent = 0;
  for (const line of lines) {
    const indent = line.search(/\S/);
    if (indent > maxIndent) maxIndent = indent;
  }
  if (maxIndent > 24) {
    findings.push({
      severity: "critical",
      icon: "🪺",
      category: "Nesting Depth",
      detail: `Code indentation reaches depth ${maxIndent / 2} levels. Deeply nested code is fragile and hard to follow. Extract early returns or helper functions.`,
    });
  } else if (maxIndent > 16) {
    findings.push({
      severity: "warning",
      icon: "🪺",
      category: "Nesting Depth",
      detail: `Code indentation reaches depth ${maxIndent / 2} levels. Consider reducing nesting with guard clauses or extracting functions.`,
    });
  }

  const conditionalCount = (code.match(/\bif\s*\(/g) || []).length +
    (code.match(/\belse\s+if\b/g) || []).length +
    (code.match(/\bswitch\s*\(/g) || []).length +
    (code.match(/\?\s*\w+\s*:/g) || []).length;
  const conditionalRatio = totalLines > 0 ? conditionalCount / totalLines : 0;
  if (conditionalRatio > 0.2) {
    findings.push({
      severity: "warning",
      icon: "🔀",
      category: "Conditionals",
      detail: `${conditionalCount} conditionals in ${totalLines} lines (${Math.round(conditionalRatio * 100)}%). Over 20% conditional density means fragile logic. Can any be eliminated?`,
    });
  }

  const oneLineWrapperCount = (code.match(/return\s+\w+\([\s\S]*?\)\s*;/g) || []).length +
    (code.match(/^\s*\w+\s*=\s*\w+\.\w+\([\s\S]*?\)\s*$/gm) || []).length;
  if (oneLineWrapperCount > 5) {
    findings.push({
      severity: "info",
      icon: "🔄",
      category: "Indirection",
      detail: `${oneLineWrapperCount} one-line wrappers detected. Each wrapper adds fragility without value. Can they be inlined?`,
    });
  }

  const funcMatches = code.matchAll(/(?:function\s+\w+|=>\s*{|\)\s*:\s*\w+\s*=>|\w+\s*\([^)]*\)\s*\{)/g);
  const funcCount = [...funcMatches].length;
  if (totalLines > 50 && funcCount === 0) {
    findings.push({
      severity: "warning",
      icon: "📋",
      category: "Function Decomposition",
      detail: `No functions detected in ${totalLines} lines. Monolithic code is impossible to simplify piece by piece. Break it down.`,
    });
  }
  if (funcCount > 20 && totalLines < 300) {
    findings.push({
      severity: "info",
      icon: "📋",
      category: "Function Count",
      detail: `${funcCount} functions in ${totalLines} lines. High function density may indicate over-abstraction. Could some be merged?`,
    });
  }

  const complexityPatterns = [
    { pattern: /\b(abstract|interface|generic|overrid|polymorph|factory|singleton|decorator|observer|strategy)\b/gi, label: "Design Patterns" },
    { pattern: /\b(as\s+any|@ts-ignore|@ts-expect-error|any\s*\()/g, label: "Type Escapes" },
    { pattern: /\b(forEach|map|filter|reduce)\s*\([^)]*\)\s*\.\s*(forEach|map|filter|reduce)/g, label: "Chain Length" },
    { pattern: /\btry\s*\{[^}]*\}\s*catch\s*\(\w*\)\s*\{\s*\}/g, label: "Empty Catch" },
    { pattern: /\bTODO|FIXME|HACK|XXX|WORKAROUND|TEMPORARY|HARDCODED\b/gi, label: "Technical Debt" },
  ];

  for (const { pattern, label } of complexityPatterns) {
    const matches = code.match(pattern);
    if (matches && matches.length > 2) {
      findings.push({
        severity: "warning",
        icon: "🏗️",
        category: label,
        detail: `${matches.length} instances of ${label.toLowerCase()} found. Each adds fragility. Question whether each one is necessary.`,
      });
    } else if (matches && matches.length > 0) {
      findings.push({
        severity: "info",
        icon: "🏗️",
        category: label,
        detail: `${matches.length} instance(s) of ${label.toLowerCase()}. Worth reviewing.`,
      });
    }
  }

  const commentExplanations = (code.match(/\/\/\s*(complex|tricky|hack|ugly|mess|confusing|careful|don't touch|magic|workaround)/gi) || []).length;
  if (commentExplanations > 0) {
    findings.push({
      severity: "warning",
      icon: "💬",
      category: "Self-Identified Complexity",
      detail: `${commentExplanations} comments admit complexity. If the author knew it was complex, it should have been simplified before shipping.`,
    });
  }

  return findings;
}

function simplifyCodeToOutput(code: string, filename: string | undefined): string | null {
  const findings = analyzeCodeForSimplification(code, filename);
  if (findings.length === 0) return null;

  const lines: string[] = [];
  lines.push(``);
  lines.push(`---`);
  lines.push(`### 🔬 Code Simplification Subagent Review`);
  lines.push(``);
  lines.push(`> *Elon's approach: find what's fragile, delete what's unnecessary, simplify what remains.*`);
  lines.push(``);

  const critical = findings.filter(f => f.severity === "critical");
  const warnings = findings.filter(f => f.severity === "warning");
  const infos = findings.filter(f => f.severity === "info");

  if (critical.length > 0) {
    lines.push(`**🔴 Critical Issues:**`);
    for (const f of critical) {
      lines.push(`- ${f.icon} **${f.category}:** ${f.detail}`);
      lines.push(`  → This needs to be fixed. Fragile code WILL break.`);
    }
    lines.push(``);
  }

  if (warnings.length > 0) {
    lines.push(`**🟡 Simplification Opportunities:**`);
    for (const f of warnings) {
      lines.push(`- ${f.icon} **${f.category}:** ${f.detail}`);
    }
    lines.push(``);
  }

  if (infos.length > 0) {
    lines.push(`**🔵 Review Notes:**`);
    for (const f of infos) {
      lines.push(`- ${f.icon} **${f.category}:** ${f.detail}`);
    }
    lines.push(``);
  }

  lines.push(`**Next step:** Run \`elon-delete\` on this implementation. Question every function. Delete what you can. Simplify what remains.`);
  lines.push(`"We are on a deletion rampage. Nothing is sacred." — Elon Musk`);

  return lines.join("\n");
}

const ALGO_TOOLS = new Set(["elon-question", "elon-delete", "elon-simplify", "elon-accelerate", "elon-automate", "elon-apply", "elon-idiot-index"]);
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
      "elon-idiot-index": elonIdiotIndex,
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

    "tool.execute.after": async (input, output) => {
      const toolName = input.tool.toLowerCase();
      if (!IMPLEMENT_TOOLS.has(toolName)) return;

      const code = input.args?.content ?? input.args?.newString ?? null;
      if (!code || typeof code !== "string" || code.length < 50) return;

      const filename = input.args?.filePath ?? input.args?.file ?? undefined;
      const simplification = simplifyCodeToOutput(code, filename);
      if (simplification) {
        output.output = (output.output ?? "") + simplification;
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

        const subagentFindings = runSubagents(textBefore, step, state.target);
        const subagentOutput = formatSubagentReview(subagentFindings);

        const verificationLines: string[] = [];
        verificationLines.push(``);
        verificationLines.push(`---`);
        verificationLines.push(`### ✅ Step ${step} Passed — Subagent Review`);
        verificationLines.push(``);

        verificationLines.push(...subagentOutput);

        const failedSubagents = subagentFindings.filter(f => !f.passed);
        if (failedSubagents.length > 0) {
          verificationLines.push(``);
          verificationLines.push(`> 🔴 **${failedSubagents.length} framework(s) flagged issues.** Review the flagged items above before proceeding with full confidence.`);
        }

        if (hasMore) {
          const nextName = STEP_NAMES[state.currentStep - 1] ?? "complete";
          verificationLines.push(``);
          verificationLines.push(`**Proceed to Step ${state.currentStep}/5** — use \`elon-${nextName}\` when ready.`);
        } else {
          verificationLines.push(``);
          verificationLines.push(`**🎉 All 5 steps completed!** The algorithm is fully applied.`);
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

        const subagentFindings = runSubagents(textBefore, step, state?.target ?? "unknown");
        const subagentFailed = subagentFindings.filter(f => !f.passed);
        if (subagentFailed.length > 0) {
          feedback.push(``);
          feedback.push(`**🔬 Additional framework checks flagged:**`);
          for (const f of subagentFailed) {
            feedback.push(`- ${f.icon} **${f.label}:** ${f.detail}`);
            if (f.suggestion) feedback.push(`  → ${f.suggestion}`);
          }
        }

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
