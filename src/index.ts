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
  const base = `## Engineering Algorithm

When tackling any engineering problem, consider this ordered approach:

1. **Question every requirement.** Every requirement has a specific human author. Find them.
2. **Delete any part or process you can.** The best part is no part. Push to the limit.
3. **Simplify and optimize what remains.** Only now — never before deletion.
4. **Accelerate cycle time.** Find the bottleneck. Speed up feedback loops.
5. **Automate.** Last step. Never automate something that should have been deleted.`;

  const modeNotes: Record<string, string> = {
    build: `\n\n**Focus: Building.** Follow the full algorithm in order. Don't optimize prematurely.`,
    simplify: `\n\n**Focus: Simplification.** Heavy emphasis on Step 1 (question requirements) and Step 2 (delete). Before adding anything, try removing. Your default answer should be "delete it."`,
    debug: `\n\n**Focus: Debugging.** Heavy emphasis on Step 1 (question every assumption) and first-principles reasoning. Strip the problem to its fundamentals. Verify physics. Question every variable.`,
    review: `\n\n**Focus: Code Review.** Scrutinize everything through SOLID, DRY, TDD, and first-principles lenses. Every function must justify its existence. Every abstraction must carry its weight.`,
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
