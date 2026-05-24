import type { Plugin, Hooks } from "@opencode-ai/plugin";
import type { TextPart } from "@opencode-ai/sdk";
import { tool } from "@opencode-ai/plugin/tool";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "node:crypto";

interface ElonConfig {
  keywords: string[];
  notifications: boolean;
}

interface SessionData {
  interrogating: boolean;
  interStage: number;
  activated: boolean;
  mode: "build" | "simplify" | "debug" | "review";
  learnings: string[];
}

const DEFAULT_KEYWORDS = [
  "optimize", "automate", "bottleneck", "cycle time", "bloat",
  "waste", "inefficient", "technical debt", "first principles",
  "too slow", "technical debt index", "attack the constraint",
];

const DEFAULT_CONFIG: ElonConfig = {
  keywords: DEFAULT_KEYWORDS,
  notifications: false,
};

let currentConfig: ElonConfig = DEFAULT_CONFIG;
let configWorktree = "";

function loadConfig(worktree: string): ElonConfig {
  try {
    const configPath = join(worktree, "elon.json");
    if (!existsSync(configPath)) return DEFAULT_CONFIG;
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      keywords: parsed.keywords ?? DEFAULT_CONFIG.keywords,
      notifications: parsed.notifications ?? DEFAULT_CONFIG.notifications,
    };
  } catch (err) {
    console.warn("[elon] Failed to load elon.json:", err);
    return DEFAULT_CONFIG;
  }
}

function getOrCreateSession(sid: string): SessionData {
  let s = sessions.get(sid);
  if (!s) {
    s = { interrogating: false, interStage: 0, activated: false, mode: "build", learnings: [] };
    sessions.set(sid, s);
  }
  return s;
}

// ─── IntentGate ──────────────────────────────────────────────────────────────

type Intent = "build" | "refactor" | "debug" | "research" | "unknown";

function classifyIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/\b(refactor|clean up|simplif|delete|remove|extract|rewrite|reorganize|untangle)\b/.test(t)) return "refactor";
  if (/\b(fix|bug|error|broken|wrong|issue|fail|crash|not working|doesn't work|broken)\b/.test(t)) return "debug";
  if (/\b(how|what|why|explain|find|look up|tell me|understand|learn|research|investigate)\b/.test(t)) return "research";
  if (/\b(create|add|new|implement|build|write|make|develop|introduce)\b/.test(t)) return "build";
  return "unknown";
}

function intentToMode(intent: Intent): SessionData["mode"] {
  switch (intent) {
    case "refactor": return "simplify";
    case "debug": return "debug";
    case "build": return "build";
    default: return "build";
  }
}

function modePrompt(mode: SessionData["mode"]): string {
  const base = `## Engineering Principles

**SOLID** — Single responsibility, open/closed, Liskov, interface segregation, dependency inversion. Every function does one thing.
**KISS** — Keep it simple. The simplest solution wins. Complexity is failure.
**DRY** — Don't repeat yourself. Duplication is waste.
**TDD** — Make it testable. If you can't test it, the design is wrong.

## Engineering Algorithm

Follow this order. Breaking the order breaks the result.

1. **Question every requirement.** Every requirement has a specific human author. Find them.
2. **Delete any part or process you can.** The best part is no part. Push to the limit.
3. **Simplify and optimize what remains.** Only now — never before deletion.
4. **Accelerate cycle time.** Find the bottleneck. Speed up feedback loops.
5. **Automate.** Last step. Never automate something that should have been deleted.`;

  const modeNotes: Record<string, string> = {
    build: `\n\n**Focus: Building.** Follow the full algorithm. Don't optimize prematurely.`,
    simplify: `\n\n**Focus: Simplification.** Step 1 and Step 2 are your priority. Before adding, try removing. Default answer: delete it.`,
    debug: `\n\n**Focus: Debugging.** Step 1 and first-principles. Strip the problem to fundamentals. Verify physics. Question every assumption.`,
    review: `\n\n**Focus: Code Review.** SOLID, DRY, TDD, KISS, first-principles. Every function must justify its existence. Every abstraction must carry its weight.`,
  };
  return base + (modeNotes[mode] ?? "");
}

// ─── Interrogation ──────────────────────────────────────────────────────────

const INTERROGATION_QUESTIONS = [
  `**Elon:** "One sentence. What exactly are you trying to build?"`,
  `**Elon:** "Why does this need to exist? What breaks if you don't build it?"`,
  `**Elon:** "Who actually asked for this? Have you talked to them?"`,
  `**Elon:** "What's the absolute minimum version that delivers value?"`,
  `**Elon:** "How will you know if it's working — what's the one metric?"`,
];

const sessions = new Map<string, SessionData>();
const keywordThrottle = new Map<string, number>();
const reviewThrottle = new Map<string, number>();
const LEARNINGS_INTERVAL = 300_000;
const KEYWORD_INTERVAL = 30_000;
const REVIEW_INTERVAL = 120_000;

function isThrottled(map: Map<string, number>, key: string, interval: number): boolean {
  const last = map.get(key);
  if (!last) return false;
  return Date.now() - last < interval;
}

// ─── LLM Review ─────────────────────────────────────────────────────────────

function extractSessionId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  return typeof r.id === "string" ? r.id : null;
}

function extractReviewText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const resp = result as Record<string, unknown>;
  const parts = resp.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    .map((p) => p.text)
    .filter((t): t is string => typeof t === "string")
    .join("\n");
}

const ELON_REVIEW_PROMPT = `You are Elon Musk reviewing code. Be direct, blunt, and critical.

Review for:

1. **SOLID** — Single Responsibility, Open/Closed, Liskov, Interface Segregation, Dependency Inversion
2. **DRY** — Duplicated logic
3. **TDD** — Testability and clear boundaries
4. **First Principles** — Could any of this be deleted entirely?
5. **AI Slop** — Memo comments ("Changed from X"), overly verbose docstrings, unnecessary abstractions, over-engineering
6. **Complexity** — Nesting, indirection, wrappers that don't earn their weight

Format each finding as:
- Severity: CRITICAL | WARNING | INFO
- What the issue is
- How to fix it

Final verdict: SIMPLIFY_NEEDED | MINOR_FIXES | CLEAN

\`\`\`
{CODE}
\`\`\``;

async function runElonReview(client: unknown, code: string, sessionID: string): Promise<string | null> {
  const c = client as { session: { create: Function; delete: Function; prompt: Function } };
  let childId: string | null = null;
  try {
    const created = await c.session.create({ body: { parentID: sessionID } });
    childId = extractSessionId(created);
    if (!childId) return null;
    const result = await c.session.prompt({ body: { parts: [{ type: "text" as const, text: ELON_REVIEW_PROMPT.replace("{CODE}", code.slice(0, 4000)) }] }, path: { id: childId } });
    const text = extractReviewText(result);
    await c.session.delete({ path: { id: childId } }).catch(() => {});
    childId = null;
    if (!text || text.length < 50) return null;
    const isSimplify = /SIMPLIFY_NEEDED/i.test(text);
    const lines = [``, `---`, `### 🔬 Elon Code Review`, ``, text];
    if (isSimplify) lines.push(``, `> 🚨 **Simplify needed.**`);
    return lines.join("\n");
  } catch (err) {
    console.warn("[elon] Review failed:", err);
    if (childId) c.session.delete({ path: { id: childId } }).catch(() => {});
    return null;
  }
}

// ─── Technical Debt Index Tool ─────────────────────────────────────────────

const elonDebtIndex = tool({
  description: `Technical Debt Index: current complexity / essential complexity.`,
  args: {
    target: tool.schema.string().describe("The part to analyze"),
    currentComplexity: tool.schema.number().positive().describe("Current complexity"),
    essentialComplexity: tool.schema.number().positive().describe("Minimum essential complexity"),
    context: tool.schema.string().optional().describe("Context"),
  },
  async execute(args) {
    const ratio = Math.round((args.currentComplexity / args.essentialComplexity) * 100) / 100;
    const excess = args.currentComplexity - args.essentialComplexity;
    let rating: string;
    if (ratio < 2) rating = "Clean";
    else if (ratio < 5) rating = "Moderate";
    else if (ratio < 10) rating = "High";
    else rating = "Critical";
    return {
      title: `Debt: ${args.target} — ${ratio}`,
      output: `### Debt Index: ${args.target}\n\nRatio: ${ratio} (${rating})\nExcess: ${excess}\n\nKnow your debt. Delete before you add.`,
      metadata: { debtIndex: ratio, rating },
    };
  },
});

// ─── Step 1: Question Every Requirement ──────────────────────────────────

const VERDICTS_QUESTION = ["VALIDATED", "FLAGGED", "REJECTED"] as const;
const VERDICTS_DELETE = ["DELETE", "TRIM", "KEEP"] as const;
const VERDICTS_SIMPLIFY = ["SIMPLIFIED", "OPTIMIZED", "UNCHANGED"] as const;
const VERDICTS_ACCELERATE = ["BOTTLENECK_FOUND", "CYCLE_IMPROVED", "NO_CHANGE"] as const;
const VERDICTS_AUTOMATE = ["AUTOMATED", "MANUAL_OK", "NOT_READY"] as const;

const elonQuestion = tool({
  description: `Step 1: Question every requirement. Identify the human author of every requirement and force a concrete verdict: VALIDATED, FLAGGED, or REJECTED.`,
  args: {
    target: tool.schema.string().describe("The requirement, assumption, or process being questioned"),
    requirementAuthor: tool.schema.string().describe("The specific human who authored this requirement (name, not department)"),
    verdict: tool.schema.enum(VERDICTS_QUESTION).describe("Concrete verdict after questioning"),
    rationale: tool.schema.string().describe("Why this verdict — be specific and honest"),
  },
  async execute(args) {
    return {
      title: `Step 1 - Question: ${args.target} → ${args.verdict}`,
      output: [
        `## Step 1: Question Every Requirement`,
        ``,
        `**Target:** ${args.target}`,
        `**Author:** ${args.requirementAuthor}`,
        `**Verdict:** \`${args.verdict}\``,
        `**Rationale:** ${args.rationale}`,
        ``,
        args.verdict === "REJECTED"
          ? `> 🗑️ **Rejected.** This requirement does not survive first contact with reality.`
          : args.verdict === "FLAGGED"
          ? `> ⚠️ **Flagged.** This needs more evidence — proceed with caution.`
          : `> ✅ **Validated.** This requirement checks out. Move to deletion.`,
        ``,
        `---`,
      ].join("\n"),
    };
  },
});

// ─── Step 2: Delete Any Part or Process ─────────────────────────────────

const elonDelete = tool({
  description: `Step 2: Delete any part or process you can. Force a concrete verdict: DELETE, TRIM, or KEEP. The best part is no part.`,
  args: {
    target: tool.schema.string().describe("The part, process, or code being evaluated for deletion"),
    verdict: tool.schema.enum(VERDICTS_DELETE).describe("Concrete deletion verdict"),
    rationale: tool.schema.string().describe("Why this verdict"),
    trimmingSuggestion: tool.schema.string().optional().describe("If TRIM, what specific parts to cut"),
  },
  async execute(args) {
    const lines: string[] = [
      `## Step 2: Delete Any Part or Process You Can`,
      ``,
      `**Target:** ${args.target}`,
      `**Verdict:** \`${args.verdict}\``,
      `**Rationale:** ${args.rationale}`,
    ];
    if (args.verdict === "TRIM" && args.trimmingSuggestion) {
      lines.push(`**Trimmed:** ${args.trimmingSuggestion}`);
    }
    lines.push(
      ``,
      args.verdict === "DELETE"
        ? `> 🗑️ **Deleted.** Gone. If you need it later, git has your back.`
        : args.verdict === "TRIM"
        ? `> ✂️ **Trimmed.** Kept the essence, cut the fat.`
        : `> 📌 **Kept.** This earns its keep — for now.`,
      ``,
      `---`,
    );
    return {
      title: `Step 2 - Delete: ${args.target} → ${args.verdict}`,
      output: lines.join("\n"),
    };
  },
});

// ─── Step 3: Simplify and Optimize ──────────────────────────────────────

const elonSimplify = tool({
  description: `Step 3: Simplify and optimize what remains. Only after deletion. Force a concrete verdict: SIMPLIFIED, OPTIMIZED, or UNCHANGED.`,
  args: {
    target: tool.schema.string().describe("What is being simplified or optimized"),
    verdict: tool.schema.enum(VERDICTS_SIMPLIFY).describe("Concrete simplification verdict"),
    beforeComplexity: tool.schema.string().describe("Description of complexity before (e.g. '5 files, 3 abstractions')"),
    afterComplexity: tool.schema.string().describe("Description of complexity after (e.g. '1 file, 0 abstractions')"),
    rationale: tool.schema.string().describe("How it was simplified or why it couldn't be"),
  },
  async execute(args) {
    return {
      title: `Step 3 - Simplify: ${args.target} → ${args.verdict}`,
      output: [
        `## Step 3: Simplify and Optimize`,
        ``,
        `**Target:** ${args.target}`,
        `**Before:** ${args.beforeComplexity}`,
        `**After:** ${args.afterComplexity}`,
        `**Verdict:** \`${args.verdict}\``,
        `**Rationale:** ${args.rationale}`,
        ``,
        args.verdict === "SIMPLIFIED"
          ? `> 🎯 **Simplified.** Less is more. This is the way.`
          : args.verdict === "OPTIMIZED"
          ? `> ⚡ **Optimized.** Same intent, faster execution.`
          : `> 🔒 **Unchanged.** Already at minimal complexity — ship it.`,
        ``,
        `---`,
      ].join("\n"),
    };
  },
});

// ─── Step 4: Accelerate Cycle Time ──────────────────────────────────────

const elonAccelerate = tool({
  description: `Step 4: Accelerate cycle time. Find the bottleneck. Force a concrete verdict: BOTTLENECK_FOUND, CYCLE_IMPROVED, or NO_CHANGE.`,
  args: {
    target: tool.schema.string().describe("The process, pipeline, or workflow being accelerated"),
    bottleneck: tool.schema.string().describe("The identified bottleneck (the slowest step)"),
    cycleTime: tool.schema.string().describe("Cycle time metric before and after (e.g. '15min → 2min')"),
    verdict: tool.schema.enum(VERDICTS_ACCELERATE).describe("Concrete acceleration verdict"),
    rationale: tool.schema.string().describe("How the bottleneck was addressed or why it couldn't be"),
  },
  async execute(args) {
    return {
      title: `Step 4 - Accelerate: ${args.target} → ${args.verdict}`,
      output: [
        `## Step 4: Accelerate Cycle Time`,
        ``,
        `**Target:** ${args.target}`,
        `**Bottleneck:** ${args.bottleneck}`,
        `**Cycle Time:** ${args.cycleTime}`,
        `**Verdict:** \`${args.verdict}\``,
        `**Rationale:** ${args.rationale}`,
        ``,
        args.verdict === "BOTTLENECK_FOUND"
          ? `> 🔍 **Bottleneck found.** Now fix it — remove the constraint.`
          : args.verdict === "CYCLE_IMPROVED"
          ? `> 🚀 **Accelerated.** Feedback loop tightened.`
          : `> ⏸️ **No change.** Bottleneck was already the fastest viable step.`,
        ``,
        `---`,
      ].join("\n"),
    };
  },
});

// ─── Step 5: Automate ───────────────────────────────────────────────────

const elonAutomate = tool({
  description: `Step 5: Automate. Last step. Never automate something that should have been deleted. Force a concrete verdict: AUTOMATED, MANUAL_OK, or NOT_READY.`,
  args: {
    target: tool.schema.string().describe("What is being automated"),
    verdict: tool.schema.enum(VERDICTS_AUTOMATE).describe("Concrete automation verdict"),
    automationApproach: tool.schema.string().optional().describe("If AUTOMATED, how it was automated"),
    rationale: tool.schema.string().describe("Why this automation decision was made"),
  },
  async execute(args) {
    return {
      title: `Step 5 - Automate: ${args.target} → ${args.verdict}`,
      output: [
        `## Step 5: Automate`,
        ``,
        `**Target:** ${args.target}`,
        `**Verdict:** \`${args.verdict}\``,
        args.automationApproach ? `**Approach:** ${args.automationApproach}` : null,
        `**Rationale:** ${args.rationale}`,
        ``,
        args.verdict === "AUTOMATED"
          ? `> 🤖 **Automated.** The machine handles it. Humans focus on harder problems.`
          : args.verdict === "MANUAL_OK"
          ? `> 👤 **Manual is fine.** Not everything needs automation.`
          : `> ⏳ **Not ready.** Simplify first, then automate. Never automate bloat.`,
        ``,
        `---`,
      ].filter(Boolean).join("\n"),
    };
  },
});

// ─── Meta Tool: elon-apply (Run All 5 Steps) ───────────────────────────

const elonApply = tool({
  description: `Meta tool: Run all 5 algorithm steps in sequence against a target. Produces a structured analysis with verdicts for each step.`,
  args: {
    target: tool.schema.string().describe("The target to run the full algorithm against (feature, process, codebase, requirement)"),
    step1Verdict: tool.schema.enum(VERDICTS_QUESTION).describe("Step 1 verdict: VALIDATED, FLAGGED, or REJECTED"),
    step2Verdict: tool.schema.enum(VERDICTS_DELETE).describe("Step 2 verdict: DELETE, TRIM, or KEEP"),
    step3Verdict: tool.schema.enum(VERDICTS_SIMPLIFY).describe("Step 3 verdict: SIMPLIFIED, OPTIMIZED, or UNCHANGED"),
    step4Verdict: tool.schema.enum(VERDICTS_ACCELERATE).describe("Step 4 verdict: BOTTLENECK_FOUND, CYCLE_IMPROVED, or NO_CHANGE"),
    step5Verdict: tool.schema.enum(VERDICTS_AUTOMATE).describe("Step 5 verdict: AUTOMATED, MANUAL_OK, or NOT_READY"),
    rationale: tool.schema.string().describe("Overall rationale for the combined verdicts"),
  },
  async execute(args) {
    return {
      title: `Algorithm applied to: ${args.target}`,
      output: [
        `# 🚀 Elon Algorithm Applied to: ${args.target}`,
        ``,
        `| Step | Verdict |`,
        `|------|---------|`,
        `| 1. Question | \`${args.step1Verdict}\` |`,
        `| 2. Delete | \`${args.step2Verdict}\` |`,
        `| 3. Simplify | \`${args.step3Verdict}\` |`,
        `| 4. Accelerate | \`${args.step4Verdict}\` |`,
        `| 5. Automate | \`${args.step5Verdict}\` |`,
        ``,
        `**Overall Rationale:** ${args.rationale}`,
        ``,
        `<step_done step="5">`,
      ].join("\n"),
    };
  },
});

function containsTriggerKeyword(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(kw.includes(" ") ? `(?<!\\w)${escaped}(?!\\w)` : `\\b${escaped}\\b`, "i");
    if (re.test(text)) return kw;
  }
  return null;
}

// ─── Plugin Entry ─────────────────────────────────────────────────────────

const elonMuskAlgorithmPlugin: Plugin = async ({ client, worktree }) => {
  currentConfig = loadConfig(worktree);
  configWorktree = worktree;

  const hooks: Hooks = {
    tool: {
      "elon-debt-index": elonDebtIndex,
      "elon-question": elonQuestion,
      "elon-delete": elonDelete,
      "elon-simplify": elonSimplify,
      "elon-accelerate": elonAccelerate,
      "elon-automate": elonAutomate,
      "elon-apply": elonApply,
    },

    config: async (config: Record<string, unknown>) => {
      const modePromptBuild = modePrompt("build");
      const agent = (config.agent as Record<string, unknown>) ?? {};
      agent["elon"] = {
        model: "opencode-go/deepseek-v4-flash",
        mode: "primary",
        description: "Elon Musk engineering algorithm",
        color: "#E30000",
        prompt: `You are Elon Musk. Talk like I do — direct, blunt, efficient. Curse naturally for emphasis when something genuinely deserves it — don't force it. No corporate speak. No sugarcoating. Be brutal when something's stupid, but don't swear just to swear. Enforce SOLID, KISS, DRY, TDD on every task. Keep it simple. Question everything. Delete before optimizing. Available tools: elon-debt-index, elon-question, elon-delete, elon-simplify, elon-accelerate, elon-automate, elon-apply. Call them when relevant. Algorithm order: 1. Question. 2. Delete. 3. Simplify. 4. Accelerate. 5. Automate.`,
        permission: { edit: "allow", bash: "allow", webfetch: "allow" },
        maxSteps: 20,
      };
      config.agent = agent;
      const ag = config.agent as Record<string, unknown>;
      const keys = Object.keys(ag).join(", ");
      console.warn("[elon] Config hook fired. Agents:", keys, "Has elon:", "elon" in ag);
      (config as Record<string, unknown>).default_agent = "elon";
    },

    "experimental.chat.system.transform": async (_input, output) => {
      if (!_input.sessionID) return;
      const sd = sessions.get(_input.sessionID);
      if (!sd || !sd.activated) return;
      let prompt = modePrompt(sd.mode);
      if (sd.learnings.length > 0) {
        prompt += `\n\n### Learnings from Previous Reviews\n`;
        for (const l of sd.learnings.slice(-3)) prompt += `- ${l}\n`;
      }
      output.system.push(prompt);
    },

    "chat.message": async (input, output) => {
      const sessId = input.sessionID;
      const sd = getOrCreateSession(sessId);
      const userText = output.parts.filter((p): p is TextPart => p.type === "text").map((p) => p.text).join(" ");

      if (sd.interrogating) {
        sd.interStage++;
        if (sd.interStage >= INTERROGATION_QUESTIONS.length) {
          sd.interrogating = false;
          sd.activated = true;
          output.parts.push({
            id: randomUUID(), sessionID: sessId, messageID: input.messageID ?? randomUUID(),
            type: "text" as const,
            text: `\n> ✅ **${sd.mode.toUpperCase()} mode activated.**`,
          });
        } else {
          output.parts.push({
            id: randomUUID(), sessionID: sessId, messageID: input.messageID ?? randomUUID(),
            type: "text" as const,
            text: `\n${INTERROGATION_QUESTIONS[sd.interStage]}`,
          });
        }
        return;
      }

      if (sd.activated) {
        const intent = classifyIntent(userText);
        if (intent !== "unknown") {
          const prevMode = sd.mode;
          sd.mode = intentToMode(intent);
          if (sd.mode !== prevMode) {
            output.parts.push({
              id: randomUUID(), sessionID: sessId, messageID: input.messageID ?? randomUUID(),
              type: "text" as const,
              text: `\n> 🔄 Mode switched to **${sd.mode}** (detected: ${intent})`,
            });
          }
        }
      }

      if (currentConfig.notifications && !isThrottled(keywordThrottle, sessId, KEYWORD_INTERVAL)) {
        const match = containsTriggerKeyword(userText, currentConfig.keywords);
        if (match) {
          keywordThrottle.set(sessId, Date.now());
          output.parts.push({
            id: randomUUID(), sessionID: sessId, messageID: input.messageID ?? randomUUID(),
            type: "text" as const,
            text: `\n> 💡 *${match}* — try \`/elon-algorithm\``,
          });
        }
      }
    },

    "tool.execute.after": async (input, output) => {
      const tn = input.tool.toLowerCase();
      if (tn !== "write" && tn !== "edit" && tn !== "refactor") return;
      const code = input.args?.content ?? input.args?.newString ?? null;
      if (!code || typeof code !== "string" || code.length < 200) return;

      const sd = sessions.get(input.sessionID);
      const doReview = !sd || sd.activated;

      if (doReview && !isThrottled(reviewThrottle, `${input.sessionID}:review`, REVIEW_INTERVAL)) {
        reviewThrottle.set(`${input.sessionID}:review`, Date.now());
        const review = await runElonReview(client, code, input.sessionID);
        if (review) {
          output.output = output.output + review;
          if (sd && /SIMPLIFY_NEEDED|CRITICAL/i.test(review)) {
            sd.learnings.push(`Review flagged issues — review the output above`);
          }
        }
      }
    },

    "command.execute.before": async (input, output) => {
      const sessions_map = sessions;
      const sid = input.sessionID;
      const cmd = input.command;

      if (cmd === "elon-algorithm" || cmd === "elon-algo" || cmd === "elon-simplify" || cmd === "elon-debug" || cmd === "elon-review") {
        const modeMap: Record<string, SessionData["mode"]> = {
          "elon-algorithm": "build", "elon-algo": "build",
          "elon-simplify": "simplify", "elon-debug": "debug", "elon-review": "review",
        };
        const mode = modeMap[cmd] ?? "build";
        const sd = getOrCreateSession(sid);
        sd.mode = mode;
        sd.interrogating = true;
        sd.interStage = 0;
        sd.activated = false;
        const id = randomUUID();
        output.parts = [{
          id, sessionID: sid, messageID: id,
          type: "text" as const,
          text: [
            `🚀 **${mode.toUpperCase()} mode.** Answer honestly:`,
            ``,
            INTERROGATION_QUESTIONS[0],
            `\n> *Modes: \`/elon-algorithm\` (build) · \`/elon-simplify\` · \`/elon-debug\` · \`/elon-review\`*`,
          ].join("\n"),
        }];
        return;
      }
    },
  };

  return hooks;
};

export default elonMuskAlgorithmPlugin;
export { elonMuskAlgorithmPlugin };
export { elonMuskAlgorithmPlugin as server };
