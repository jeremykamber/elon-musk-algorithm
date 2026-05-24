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
    console.warn("[elon] Failed to load elon.json, using defaults:", err);
    return DEFAULT_CONFIG;
  }
}

const ALGORITHM_PROMPT = `## Engineering Algorithm

When tackling any engineering problem, consider this ordered approach:

1. **Question every requirement.** Every requirement has a specific human author. Find them. Challenge the requirement. Does it still hold? Is the original constraint still valid? Laws can be changed.

2. **Delete any part or process you can.** Before optimizing, ask: does this need to exist? The best part is no part. Push to the limit. If you don't add back 10% of what you deleted, you didn't delete enough.

3. **Simplify and optimize what remains.** Only now — never before deletion.

4. **Accelerate cycle time.** Find the bottleneck. Speed up feedback loops.

5. **Automate.** Last step. Never automate something that should have been deleted.

**The order matters.** The most common mistake is to optimize something that shouldn't exist.`;

// ─── Interrogation System ────────────────────────────────────────────────────

const INTERROGATION_QUESTIONS = [
  `**Elon:** "Alright. One sentence. What exactly are you trying to build? If it takes more than one sentence, you haven't thought about it enough."`,
  `**Elon:** "Why does this need to exist? Be specific. What breaks if you don't build it? Whose life is worse?"`,
  `**Elon:** "Who actually asked for this? Not 'the market' or 'the users' — a specific person. Have you talked to them? What did they say?"`,
  `**Elon:** "What's the absolute minimum version of this that delivers value? Strip it down. What's the core mechanism?"`,
  `**Elon:** "How will you know if it's working? What's the one metric that tells you this was worth building?"`,
];

interface InterrogationState {
  stage: number;
}

const interrogations = new Map<string, InterrogationState>();
const activatedSessions = new Set<string>();

function startInterrogation(sessionID: string): void {
  interrogations.set(sessionID, { stage: 0 });
  activatedSessions.delete(sessionID);
}

// ─── Throttle State ──────────────────────────────────────────────────────────

const keywordThrottle = new Map<string, number>();
const reviewThrottle = new Map<string, number>();
const ELON_INTERVAL = 60_000;
const KEYWORD_INTERVAL = 30_000;
const REVIEW_INTERVAL = 120_000;

function isThrottled(map: Map<string, number>, key: string, interval: number): boolean {
  const last = map.get(key);
  if (!last) return false;
  return Date.now() - last < interval;
}

// ─── LLM Review Helpers ─────────────────────────────────────────────────────

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

const ELON_REVIEW_PROMPT = `You are Elon Musk reviewing code. Be direct, blunt, and critical. Your job is to find unnecessary complexity, violations of engineering principles, and opportunities to simplify.

Review the following code against these criteria:

1. **S — Single Responsibility**: Does each function/class/module do ONE thing? If it does more, flag it.
2. **O — Open/Closed**: Is it extensible without modification? If it requires changes to add features, flag it.
3. **L — Liskov Substitution**: Are subtypes usable through their base interface? If not, flag it.
4. **I — Interface Segregation**: Are interfaces small and focused? If any are bloated, flag it.
5. **D — Dependency Inversion**: Does it depend on abstractions, not concretions? If not, flag it.
6. **DRY**: Is logic duplicated? Flag exact or near-exact duplication.
7. **TDD**: Does the code look testable? Are there clear boundaries for testing? If not, flag it.
8. **First Principles**: Strip the problem to its fundamentals. Is any of this code solving a problem that shouldn't exist in the first place?
9. **The Best Part is No Part**: What in this code could be deleted entirely without changing behavior?
10. **Fewer Things**: Is there over-abstraction? Wrappers wrapping wrappers? Unnecessary indirection?

For each issue found, include:
- Severity: CRITICAL (must fix), WARNING (should fix), INFO (consider)
- What the issue is
- How to fix it

After your review, give a final verdict:
- SIMPLIFY_NEEDED if the code has CRITICAL issues or is fundamentally over-engineered
- MINOR_FIXES if there are only minor issues
- CLEAN if the code is solid

Keep your review under 400 words. Be direct. Use Elon's voice — blunt, no sugarcoating.

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

    const prompt = ELON_REVIEW_PROMPT.replace("{CODE}", code.slice(0, 4000));
    const result = await c.session.prompt({ body: { parts: [{ type: "text" as const, text: prompt }] }, path: { id: childId } });
    const text = extractReviewText(result);

    await c.session.delete({ path: { id: childId } }).catch(() => {});
    childId = null;

    if (!text || text.length < 50) return null;

        const isSimplifyNeeded = /SIMPLIFY_NEEDED/i.test(text);
    const lines = [
      ``,
      `---`,
      `### 🔬 Elon Code Review`,
      ``,
      text,
    ];
    if (isSimplifyNeeded) {
      lines.push(``, `> 🚨 **Elon's verdict: SIMPLIFY NEEDED.** This code has fundamental issues. Consider a dedicated simplification pass.`);
    }
    return lines.join("\n");
  } catch (err) {
    console.warn("[elon] LLM review failed:", err);
    if (childId) c.session.delete({ path: { id: childId } }).catch(() => {});
    return null;
  }
}

// ─── Technical Debt Index Tool ─────────────────────────────────────────────

const elonDebtIndex = tool({
  description: `Calculate the Technical Debt Index: current complexity / essential complexity.`,
  args: {
    target: tool.schema.string().describe("The part, code, or process to analyze"),
    currentComplexity: tool.schema.number().positive().describe("Current complexity"),
    essentialComplexity: tool.schema.number().positive().describe("Minimum essential complexity"),
    context: tool.schema.string().optional().describe("Additional context"),
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
      output: `### Technical Debt Index: ${args.target}\n\nRatio: ${ratio} (${rating})\nExcess: ${excess}\n\nKnow your debt. Delete before you add. Simplify before you optimize.`,
      metadata: { debtIndex: ratio, rating },
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
    tool: { "elon-debt-index": elonDebtIndex },

    "experimental.chat.system.transform": async (_input, output) => {
      if (_input.sessionID && activatedSessions.has(_input.sessionID)) {
        output.system.push(ALGORITHM_PROMPT);
      }
    },

    "chat.message": async (input, output) => {
      const sessId = input.sessionID;

      const inter = interrogations.get(sessId);
      if (inter !== undefined) {
        const nextStage = inter.stage + 1;
        if (nextStage >= INTERROGATION_QUESTIONS.length) {
            interrogations.delete(sessId);
          activatedSessions.add(sessId);
          output.parts.push({
            id: randomUUID(), sessionID: sessId, messageID: input.messageID ?? randomUUID(),
            type: "text" as const,
            text: `\n> ✅ **Interrogation complete.** The algorithm is now active. Use the engineering principles as your guide.`,
          });
        } else {
          interrogations.set(sessId, { stage: nextStage });
          output.parts.push({
            id: randomUUID(), sessionID: sessId, messageID: input.messageID ?? randomUUID(),
            type: "text" as const,
            text: `\n${INTERROGATION_QUESTIONS[nextStage]}`,
          });
        }
        return;
      }

      if (!currentConfig.notifications) return;
      if (isThrottled(keywordThrottle, sessId, KEYWORD_INTERVAL)) return;
      const userText = output.parts.filter((p): p is TextPart => p.type === "text").map((p) => p.text).join(" ");
      const match = containsTriggerKeyword(userText, currentConfig.keywords);
      if (match) {
        keywordThrottle.set(sessId, Date.now());
        output.parts.push({
          id: randomUUID(), sessionID: sessId, messageID: input.messageID ?? randomUUID(),
          type: "text" as const,
          text: `\n> 💡 You mentioned "*${match}*" — consider \`/elon-algorithm\``,
        });
      }
    },

    "tool.execute.after": async (input, output) => {
      const toolName = input.tool.toLowerCase();
      if (toolName !== "write" && toolName !== "edit" && toolName !== "refactor") return;
      const code = input.args?.content ?? input.args?.newString ?? null;
      if (!code || typeof code !== "string" || code.length < 200) return;

      if (isThrottled(reviewThrottle, `${input.sessionID}:review`, REVIEW_INTERVAL)) return;
      reviewThrottle.set(`${input.sessionID}:review`, Date.now());

      const review = await runElonReview(client, code, input.sessionID);
      if (review) output.output = output.output + review;
    },

    "command.execute.before": async (input, output) => {
      if (input.command === "elon-algorithm") {
        startInterrogation(input.sessionID);
        const id = randomUUID();
        output.parts = [{
          id, sessionID: input.sessionID, messageID: id,
          type: "text" as const,
          text: [
            `🚀 **Algorithm initiated.** Before we start, I need to interrogate you. Answer honestly.`,
            ``,
            INTERROGATION_QUESTIONS[0],
            ``,
            `> *Answer the question above. Each answer leads to the next. After all questions, the algorithm activates.*`,
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
