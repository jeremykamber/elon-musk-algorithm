import type { Plugin, Hooks } from "@opencode-ai/plugin";
import type { TextPart } from "@opencode-ai/sdk";
import { tool } from "@opencode-ai/plugin/tool";

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
    lines.push(`Verdict:`);
    lines.push(
      `  ⬜ VALIDATED — requirement survived challenge (proceed to Step 2)`
    );
    lines.push(
      `  ⬜ FLAGGED — requirement needs further investigation`
    );
    lines.push(
      `  ⬜ REJECTED — requirement should be removed`
    );

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
    lines.push(`Verdict:`);
    lines.push(`  ⬜ DELETE — this can be removed`);
    lines.push(`  ⬜ TRIM — can be reduced but not eliminated`);
    lines.push(`  ⬜ KEEP — essential (proceed to Step 3)`);

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
    lines.push(`Verdict:`);
    lines.push(`  ⬜ SIMPLIFIED — restructuring applied`);
    lines.push(`  ⬜ OPTIMIZED — performance improved`);
    lines.push(`  ⬜ BOTH — simplification and optimization applied`);
    lines.push(`  ⬜ ALREADY CLEAN — no changes needed (proceed to Step 4)`);

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
    lines.push(`Common Acceleration Targets (code):`);
    lines.push(`  • Reduce build times (incremental compilation, caching)`);
    lines.push(`  • Speed up test execution (parallel runners, unit before integration)`);
    lines.push(`  • Shorten deployment pipelines (remove unnecessary stages)`);
    lines.push(`  • Reduce dev loop times (hot reload, watch mode)`);
    lines.push(`  • Smaller PRs with clearer descriptions → faster review`);

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
    lines.push(`Common Automation Targets (code):`);
    lines.push(`  • Linting, formatting, type checking (after code is clean)`);
    lines.push(`  • Testing (after tests are fast — accelerated in Step 4)`);
    lines.push(`  • Deployment (after pipeline is stable)`);
    lines.push(`  • Code generation (after patterns are stable)`);
    lines.push(`  • Monitoring and alerting`);
    lines.push(`  • CI/CD regression checks`);
    lines.push(`  • Infrastructure as Code`);
    lines.push(``);
    lines.push(`⚠️  Watch out: Don't automate complexity.`);
    lines.push(`  If a process is too complex to automate, revisit Steps 1-3.`);

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
      results.push(`→ VERDICT: Survives challenge. Proceed to Step 2.`);
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
      results.push(`→ VERDICT: Essential. Keep and proceed to Step 3.`);
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
      results.push(`→ VERDICT: Simplify and optimize applied. Proceed to Step 4.`);
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
      results.push(`→ VERDICT: Cycle time accelerated. Proceed to Step 5.`);
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
      results.push(`→ VERDICT: Automation applied.`);
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
const TRIGGER_KEYWORDS = [
  "optimize",
  "optimization",
  "refactor",
  "speed up",
  "too slow",
  "bottleneck",
  "delete",
  "remove",
  "simplify",
  "automate",
  "cycle time",
  "waste",
  "bloat",
  "inefficient",
  "technical debt",
  "process improvement",
  "first principles",
];

function containsTriggerKeyword(text: string): string | null {
  const lower = text.toLowerCase();
  for (const kw of TRIGGER_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

const elonMuskAlgorithmPlugin: Plugin = async (_ctx) => {
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

    "chat.message": async (input, output) => {
      const userText = output.parts
        .filter((p): p is TextPart => p.type === "text")
        .map((p) => p.text)
        .join(" ");

      const match = containsTriggerKeyword(userText);
      if (match) {
        const part: TextPart = {
          id: crypto.randomUUID(),
          sessionID: input.sessionID,
          messageID: input.messageID ?? crypto.randomUUID(),
          type: "text",
          text: `\n> 💡 **Tip:** You mentioned "*${match}*" — consider running \`/elon-algorithm\` to apply Elon Musk's 5-step engineering algorithm.`,
        };
        output.parts.push(part);
      }
    },

    "command.execute.before": async (input, output) => {
      if (input.command !== "elon-algorithm") return;

      const target = input.arguments?.trim() || "current codebase";
      const id = crypto.randomUUID();
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
