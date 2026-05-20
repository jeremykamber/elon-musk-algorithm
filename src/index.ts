import type { Plugin, Hooks } from "@opencode-ai/plugin";
import type { TextPart } from "@opencode-ai/sdk";
import { tool } from "@opencode-ai/plugin/tool";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "node:crypto";

// ─── Config ───────────────────────────────────────────────────────────────────

interface ElonConfig {
  mode: "full" | "gentle" | "steps-only";
  keywords: string[];
  notifications: boolean;
}

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

// ─── System Prompt Templates ──────────────────────────────────────────────────

const SYSTEM_PROMPT_FULL = `## ELON MUSK'S ALGORITHM — Operating Protocol

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
After completing each step, emit \`<step_done step="N">\` at the end of your response, then wait for the user to say "proceed" before starting the next step.`;

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

// ──────────────────────────────────────────────
// Step 1 — Question Every Requirement
// ──────────────────────────────────────────────
const elonQuestion = tool({
  description: `[Step 1/5] Question every requirement.

Every requirement (spec, ticket, constraint, rule) must have a named author.
Never accept anonymous requirements from "the department" or "the spec."

Returns a structured challenge of the requirement including:
- Who authored it
- What problem it solves
- What happens if removed
- Whether it's still valid today`,
  args: {
    requirement: tool.schema
      .string()
      .describe("The requirement, constraint, or rule to challenge"),
    author: tool.schema
      .string()
      .optional()
      .describe("Who authored this requirement (if known)"),
    context: tool.schema
      .string()
      .optional()
      .describe("The broader context this requirement lives in"),
  },
  async execute({ requirement, author, context }) {
    const lines: string[] = [];
    lines.push(`🔍 STEP 1: QUESTION EVERY REQUIREMENT`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`Requirement: ${requirement}`);
    if (author) lines.push(`Author:       ${author}`);
    else
      lines.push(`Author:       ⚠️  UNKNOWN — no named author (flag this)`);
    if (context) lines.push(`Context:      ${context}`);
    lines.push(``);
    lines.push(`Challenge Questions:`);
    lines.push(`  1. Who specifically authored this requirement?`);
    lines.push(
      author
        ? `     → ${author}. Can they still defend it today?`
        : `     → UNKNOWN. Unacceptable — every requirement needs a named author.`
    );
    lines.push(`  2. What actual problem does this solve?`);
    lines.push(`     → Consider: user need vs. internal process need`);
    lines.push(`  3. What happens if we remove it completely?`);
    lines.push(`     → Consider: feature loss, breakage, dependencies`);
    lines.push(
      `  4. Is the original constraint that created this still valid?`
    );
    lines.push(
      `  5. Would we make the same decision today, knowing what we know now?`
    );
    lines.push(``);
    lines.push(`Verdict (choose one and delete the others):`);
    lines.push(`  ✅ VALIDATED — requirement survived challenge (proceed to Step 2)`);
    lines.push(`  ⚠️  FLAGGED — needs further investigation`);
    lines.push(`  ❌ REJECTED — requirement should be removed`);
    lines.push(``);
    lines.push(`**You must commit to exactly one verdict above. Delete the two that don't apply.**`);

    return {
      title: "Step 1: Question Every Requirement",
      output: lines.join("\n"),
    };
  },
});

// ──────────────────────────────────────────────
// Step 2 — Delete Any Part or Process You Can
// ──────────────────────────────────────────────
const elonDelete = tool({
  description: `[Step 2/5] Delete any part or process you can.

"if you do not end up adding back at least 10% of what you delete, you didn't delete enough."

Try to make the system work WITHOUT the part/process.
Only add it back if you actually need it.`,
  args: {
    target: tool.schema
      .string()
      .describe("The part, process, file, function, or dependency to evaluate for deletion"),
    context: tool.schema
      .string()
      .optional()
      .describe("The system context this target lives in"),
  },
  async execute({ target, context }) {
    const lines: string[] = [];
    lines.push(`🗑️  STEP 2: DELETE ANY PART OR PROCESS YOU CAN`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`Target: ${target}`);
    if (context) lines.push(`Context: ${context}`);
    lines.push(``);
    lines.push(`Deletion Analysis:`);
    lines.push(`  1. Can the system work WITHOUT this?`);
    lines.push(`     → Evaluate: direct usage, indirect dependencies, downstream effects`);
    lines.push(`  2. What is the MINIMUM version of this that works?`);
    lines.push(`     → Consider: simpler alternative, smaller scope`);
    lines.push(`  3. What breaks if this is completely gone?`);
    lines.push(`     → List affected components, callers, consumers`);
    lines.push(`  4. Would a competitor ship without this?`);
    lines.push(`     → Honest answer reveals what's essential vs. nice-to-have`);
    lines.push(``);
    lines.push(`The 10% Rule:`);
    lines.push(`  If <10% of deletions get reverted, you were too conservative.`);
    lines.push(`  Be aggressive. You can always add back what's truly needed.`);
    lines.push(``);
    lines.push(`Verdict (choose one and delete the others):`);
    lines.push(`  🗑️  DELETE — this can be removed entirely`);
    lines.push(`  ✂️  TRIM — can be reduced but not eliminated`);
    lines.push(`  ✅ KEEP — essential (proceed to Step 3)`);
    lines.push(``);
    lines.push(`**You must commit to exactly one verdict above. Delete the two that don't apply.**`);

    return {
      title: "Step 2: Delete Any Part or Process You Can",
      output: lines.join("\n"),
    };
  },
});

// ──────────────────────────────────────────────
// Step 3 — Simplify and Optimize
// ──────────────────────────────────────────────
const elonSimplify = tool({
  description: `[Step 3/5] Simplify and optimize what remains.

"The most common error of a smart engineer is to optimize a thing that should not exist."

This step comes THIRD — not first. Only optimize what survived Step 2.`,
  args: {
    target: tool.schema
      .string()
      .describe("The component, function, or process that survived deletion and needs simplification"),
    context: tool.schema
      .string()
      .optional()
      .describe("Additional context about the target"),
  },
  async execute({ target, context }) {
    const lines: string[] = [];
    lines.push(`🔧 STEP 3: SIMPLIFY AND OPTIMIZE`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`Target: ${target}`);
    if (context) lines.push(`Context: ${context}`);
    lines.push(``);
    lines.push(`Simplification Analysis:`);
    lines.push(`  1. Can this be SIMPLER?`);
    lines.push(`     → Fewer branches, less state, less indirection`);
    lines.push(`     → Reduce cognitive complexity`);
    lines.push(`  2. Can this be FASTER given its current design?`);
    lines.push(`     → Algorithmic improvements before micro-optimizations`);
    lines.push(`  3. Can data structures be more efficient?`);
    lines.push(`     → Right data structure for the access pattern`);
    lines.push(`  4. Can interfaces be CLEANER?`);
    lines.push(`     → Reduce API surface, improve naming, remove edge cases`);
    lines.push(`  5. Can patterns be MORE CONSISTENT?`);
    lines.push(`     → Follow established conventions in the codebase`);
    lines.push(``);
    lines.push(`⚠️  Measure before and after — intuition about performance is often wrong.`);
    lines.push(``);
    lines.push(`Verdict (choose one and delete the others):`);
    lines.push(`  🔧 SIMPLIFIED — restructuring applied`);
    lines.push(`  ⚡ OPTIMIZED — performance improved`);
    lines.push(`  ✅ BOTH — simplification and optimization applied`);
    lines.push(`  ⏭️  ALREADY CLEAN — no changes needed (proceed to Step 4)`);
    lines.push(``);
    lines.push(`**You must commit to exactly one verdict above. Delete the three that don't apply.**`);

    return {
      title: "Step 3: Simplify and Optimize",
      output: lines.join("\n"),
    };
  },
});

// ──────────────────────────────────────────────
// Step 4 — Accelerate Cycle Time
// ──────────────────────────────────────────────
const elonAccelerate = tool({
  description: `[Step 4/5] Accelerate cycle time.

"Every process can be speeded up. But only do this after the first three steps."

Speed up the feedback loops of what remains. Fast cycles beat optimization.`,
  args: {
    target: tool.schema
      .string()
      .describe("The process, pipeline, or workflow to accelerate"),
    context: tool.schema
      .string()
      .optional()
      .describe("Additional context about the target"),
  },
  async execute({ target, context }) {
    const lines: string[] = [];
    lines.push(`⚡ STEP 4: ACCELERATE CYCLE TIME`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`Target: ${target}`);
    if (context) lines.push(`Context: ${context}`);
    lines.push(``);
    lines.push(`Cycle Time Analysis:`);
    lines.push(`  1. How long does ONE cycle currently take?`);
    lines.push(`     → Measure end-to-end: from start to feedback`);
    lines.push(`  2. What is the BOTTLENECK?`);
    lines.push(`     → Identify the slowest step in the chain`);
    lines.push(`  3. Can we PARALLELIZE?`);
    lines.push(`     → Independent work streams running simultaneously`);
    lines.push(`  4. Can we REDUCE HANDOFFS?`);
    lines.push(`     → Fewer context switches, fewer queues`);
    lines.push(`  5. Can we SHORTEN FEEDBACK LOOPS?`);
    lines.push(`     → Faster testing, preview environments, earlier validation`);
    lines.push(``);
    lines.push(`Verdict (choose one and delete the others):`);
    lines.push(`  ⏱️  CYCLE_REDUCED — measurable improvement achieved`);
    lines.push(`  🎯 BOTTLENECK_IDENTIFIED — bottleneck found but not yet resolved`);
    lines.push(`  ✅ ALREADY_OPTIMAL — no acceleration needed (proceed to Step 5)`);
    lines.push(``);
    lines.push(`**You must commit to exactly one verdict above. Delete the two that don't apply.**`);

    return {
      title: "Step 4: Accelerate Cycle Time",
      output: lines.join("\n"),
    };
  },
});

// ──────────────────────────────────────────────
// Step 5 — Automate
// ──────────────────────────────────────────────
const elonAutomate = tool({
  description: `[Step 5/5] Automate.

"The big mistake is to begin by trying to automate every step."

Automation locks in process. If you automate something that should have been deleted,
now you have fast, expensive, automated waste. This step MUST be last.`,
  args: {
    target: tool.schema
      .string()
      .describe("The process, check, or workflow that survived Steps 1-4 and is ready for automation"),
    context: tool.schema
      .string()
      .optional()
      .describe("Additional context about the target"),
  },
  async execute({ target, context }) {
    const lines: string[] = [];
    lines.push(`🤖 STEP 5: AUTOMATE`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`Target: ${target}`);
    if (context) lines.push(`Context: ${context}`);
    lines.push(``);
    lines.push(`Automation Analysis:`);
    lines.push(`  1. Does this NEED to be manual at all?`);
    lines.push(`     → Can it be fully automated, partially, or not at all?`);
    lines.push(`  2. What is the ROI of automation vs. frequency of execution?`);
    lines.push(`     → High-frequency + manual = highest automation value`);
    lines.push(`  3. Can we automate just DETECTION, not the response?`);
    lines.push(`     → Alerting before full remediation automation`);
    lines.push(``);
    lines.push(`⚠️  Watch out: Don't automate complexity.`);
    lines.push(`  If a process is too complex to automate, revisit Steps 1-3.`);
    lines.push(``);
    lines.push(`Verdict (choose one and delete the others):`);
    lines.push(`  🤖 AUTOMATED — fully automated`);
    lines.push(`  🔶 PARTIAL — partially automated, manual steps remain`);
    lines.push(`  ⏸️  NOT_READY — process needs more simplification first (revisit Step 3)`);
    lines.push(``);
    lines.push(`**You must commit to exactly one verdict above. Delete the two that don't apply.**`);

    return {
      title: "Step 5: Automate",
      output: lines.join("\n"),
    };
  },
});

// ──────────────────────────────────────────────
// Meta — Apply Full Algorithm
// ──────────────────────────────────────────────
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
  async execute({ target, context, skipSteps }) {
    const skipped = new Set(skipSteps ?? []);
    const results: string[] = [];

    results.push(`╔══════════════════════════════════════════════════╗`);
    results.push(`║     ELON MUSK'S ALGORITHM — FULL REPORT         ║`);
    results.push(`╚══════════════════════════════════════════════════╝`);
    results.push(``);
    results.push(`Target: ${target}`);
    if (context) results.push(`Context: ${context}`);
    results.push(``);
    results.push(`⚠️  The order is the algorithm. These steps MUST be followed sequentially.`);
    results.push(``);

    // Step 1
    if (!skipped.has(1)) {
      results.push(`┌──────────────────────────────────────────────────┐`);
      results.push(`│  STEP 1: QUESTION EVERY REQUIREMENT             │`);
      results.push(`└──────────────────────────────────────────────────┘`);
      results.push(`Requirement: ${target}`);
      results.push(`  • Who authored this requirement?`);
      results.push(`  • What problem does it actually solve?`);
      results.push(`  • What happens if we remove it completely?`);
      results.push(`  • Is the original constraint still valid?`);
      results.push(`  • Would we make the same decision today?`);
      results.push(`→ VERDICT: Choose one — VALIDATED | FLAGGED | REJECTED`);
      results.push(``);
    }

    // Step 2
    if (!skipped.has(2)) {
      results.push(`┌──────────────────────────────────────────────────┐`);
      results.push(`│  STEP 2: DELETE ANY PART OR PROCESS YOU CAN     │`);
      results.push(`└──────────────────────────────────────────────────┘`);
      results.push(`Target: ${target}`);
      results.push(`  • Can the system work without this?`);
      results.push(`  • What is the minimum version that works?`);
      results.push(`  • What breaks if completely gone?`);
      results.push(`  • Would a competitor ship without this?`);
      results.push(`→ VERDICT: Choose one — DELETE | TRIM | KEEP`);
      results.push(``);
    }

    // Step 3
    if (!skipped.has(3)) {
      results.push(`┌──────────────────────────────────────────────────┐`);
      results.push(`│  STEP 3: SIMPLIFY AND OPTIMIZE                  │`);
      results.push(`└──────────────────────────────────────────────────┘`);
      results.push(`Target: ${target}`);
      results.push(`  • Can this be simpler? (fewer branches, less state)`);
      results.push(`  • Can this be faster given current design?`);
      results.push(`  • Can data structures be more efficient?`);
      results.push(`  • Can interfaces be cleaner?`);
      results.push(`→ VERDICT: Choose one — SIMPLIFIED | OPTIMIZED | BOTH | ALREADY CLEAN`);
      results.push(``);
    }

    // Step 4
    if (!skipped.has(4)) {
      results.push(`┌──────────────────────────────────────────────────┐`);
      results.push(`│  STEP 4: ACCELERATE CYCLE TIME                  │`);
      results.push(`└──────────────────────────────────────────────────┘`);
      results.push(`Target: ${target}`);
      results.push(`  • How long does one cycle currently take?`);
      results.push(`  • What is the bottleneck?`);
      results.push(`  • Can we parallelize or reduce handoffs?`);
      results.push(`  • Can we shorten feedback loops?`);
      results.push(`→ VERDICT: Choose one — CYCLE_REDUCED | BOTTLENECK_IDENTIFIED | ALREADY_OPTIMAL`);
      results.push(``);
    }

    // Step 5
    if (!skipped.has(5)) {
      results.push(`┌──────────────────────────────────────────────────┐`);
      results.push(`│  STEP 5: AUTOMATE                               │`);
      results.push(`└──────────────────────────────────────────────────┘`);
      results.push(`Target: ${target}`);
      results.push(`  • Does this need to be manual at all?`);
      results.push(`  • What is the ROI vs execution frequency?`);
      results.push(`  • Can we automate detection before response?`);
      results.push(`  • Is this process stable enough to automate?`);
      results.push(`→ VERDICT: Choose one — AUTOMATED | PARTIAL | NOT_READY`);
      results.push(``);
    }

    results.push(`╔══════════════════════════════════════════════════╗`);
    results.push(`║  ALGORITHM COMPLETE                               ║`);
    results.push(`╚══════════════════════════════════════════════════╝`);
    results.push(``);
    results.push(`Remember: The order IS the algorithm.`);
    results.push(`If you find yourself wanting to optimize first, stop and revisit Step 1.`);

    return {
      title: "Elon Musk's Algorithm — Complete Report",
      output: results.join("\n"),
    };
  },
});

// ──────────────────────────────────────────────
// Plugin Entry Point
// ──────────────────────────────────────────────

function containsTriggerKeyword(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = kw.includes(" ") ? `(?<!\\w)${escaped}(?!\\w)` : `\\b${escaped}\\b`;
    const re = new RegExp(pattern, "i");
    if (re.test(text)) return kw;
  }
  return null;
}

const elonMuskAlgorithmPlugin: Plugin = async ({ worktree, $ }) => {
  const config = loadConfig(worktree);
  let lastNotified = 0;

  const hooks: Hooks = {
    // Register all 5 step tools + meta tool
    tool: {
      "elon-question": elonQuestion,
      "elon-delete": elonDelete,
      "elon-simplify": elonSimplify,
      "elon-accelerate": elonAccelerate,
      "elon-automate": elonAutomate,
      "elon-apply": elonApply,
    },

    // System prompt injection — ambient algorithm reasoning
    "experimental.chat.system.transform": async (_input, output) => {
      if (config.mode === "full") {
        output.system.push(SYSTEM_PROMPT_FULL);
      } else if (config.mode === "gentle") {
        output.system.push(SYSTEM_PROMPT_GENTLE);
      } else {
        output.system.push(SYSTEM_PROMPT_STEPS_ONLY);
      }
    },

    // Keyword-aware prompting — suggests algorithm when relevant terms appear
    "chat.message": async (input, output) => {
      const userText = output.parts
        .filter((p): p is TextPart => p.type === "text")
        .map((p) => p.text)
        .join(" ");

      const match = containsTriggerKeyword(userText, config.keywords);
      if (match) {
        const part: TextPart = {
          id: randomUUID(),
          sessionID: input.sessionID,
          messageID: input.messageID ?? randomUUID(),
          type: "text",
          text: `\n> 💡 **Tip:** You mentioned "*${match}*" — consider running \`/elon-algorithm\` to apply Elon Musk's 5-step engineering algorithm.`,
        };
        output.parts.push(part);
      }
    },

    // <step_done> detection — strips tags, optionally notifies
    "experimental.text.complete": async (input, output) => {
      const tagMatch = output.text.match(/<step_done\s+step=["']?(\d)["']?\s*\/?>/i);
      if (tagMatch) {
        const step = parseInt(tagMatch[1], 10);
        output.text = output.text.replace(tagMatch[0], "").trim();
        if (config.notifications) {
          const now = Date.now();
          if (now - lastNotified > 30_000) {
            lastNotified = now;
            try {
              const msg = step < 5
                ? `Step ${step} complete. Proceeding to Step ${step + 1}.`
                : "All 5 algorithm steps complete. Maximum velocity achieved.";
              $`osascript -e 'display notification "${msg}" with title "Musk Algorithm"'`.catch(() => {});
            } catch {}
          }
        }
      }
    },

    // /elon-algorithm command handler
    "command.execute.before": async (input, output) => {
      if (input.command !== "elon-algorithm") return;

      const target = input.arguments?.trim() || "current codebase";
      const id = randomUUID();
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

          `**Step 1 — Question** \`/elon-question\``,
          `  "Every requirement must have a named author."`,

          `**Step 2 — Delete** \`/elon-delete\``,
          `  "If <10% is added back, you didn't delete enough."`,

          `**Step 3 — Simplify** \`/elon-simplify\``,
          `  "Never optimize what should be deleted."`,

          `**Step 4 — Accelerate** \`/elon-accelerate\``,
          `  "Speed up cycles, but only after simplifying."`,

          `**Step 5 — Automate** \`/elon-automate\``,
          `  "Last step. Don't automate waste."`,
          ``,
          `Run each step's tool individually, or use \`elon-apply\` with \`target="${target}"\` to run them all.`,
          ``,
          `To skip a step, add \`skipSteps: [N]\` to the elon-apply tool call.`,
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
