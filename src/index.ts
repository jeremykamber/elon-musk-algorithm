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

1. **Question every requirement.** Every requirement has a specific human author. Find them. Challenge the requirement. Does it still hold? Is the original constraint still valid?

2. **Delete any part or process you can.** Before optimizing, ask: does this need to exist? The best part is no part. Push to the limit. If you don't add back 10% of what you deleted, you didn't delete enough.

3. **Simplify and optimize what remains.** Only now — never before deletion.

4. **Accelerate cycle time.** Find the bottleneck. Speed up feedback loops.

5. **Automate.** Last step. Never automate something that should have been deleted.

**The order matters.** The most common mistake is to optimize something that shouldn't exist.`;

const activatedSessions = new Set<string>();

// ─── Throttle State ──────────────────────────────────────────────────────────

const keywordThrottle = new Map<string, number>();
const analysisThrottle = new Map<string, number>();
const ELON_INTERVAL = 60_000;
const KEYWORD_INTERVAL = 30_000;
const ANALYSIS_INTERVAL = 120_000;

function isThrottled(map: Map<string, number>, key: string, interval: number): boolean {
  const last = map.get(key);
  if (!last) return false;
  return Date.now() - last < interval;
}

// ─── Elon Interrogation ─────────────────────────────────────────────────────

const ELON_CHALLENGES = [
  `**Elon:** "Does that actually need to exist? I mean it. What happens if you just delete it and see if anything breaks?"`,
  `**Elon:** "How much of that is essential complexity and how much is just how you've always done it? Be honest."`,
  `**Elon:** "That's 3 files for what could be 1. What's the minimum number of files this actually needs?"`,
  `**Elon:** "You added abstractions. Why? What concrete problem do they solve today — not in some hypothetical future?"`,
  `**Elon:** "If you had to ship this in 1 hour, what would you cut? Cut that now."`,
  `**Elon:** "Run the idiot index on this. What's the ratio of actual logic to boilerplate/wrappers/indirection?"`,
  `**Elon:** "What's the ONE thing this code does? If the answer takes more than 5 words, it's doing too much."`,
  `**Elon:** "You're optimizing something. Have you verified step 1 and 2 first? Did you question the requirement? Did you try deleting it?"`,
  `**Elon:** "Precision is not expensive. It's about caring. Does each variable name, each function boundary actually reflect the problem? Or did you just accept whatever came out?"`,
  `**Elon:** "A competitor ships this with half the code. What are they doing that you aren't?"`,
];

function pickChallenge(code: string): string {
  const hasConditionals = /\bif\s*\(|\bswitch\b|\bcase\b/.test(code);
  const hasAbstraction = /\b(interface|abstract|factory|singleton|decorator)\b/i.test(code);
  const hasTypeEscapes = /\bas\s+any\b|@ts-ignore/.test(code);
  const lines = code.split("\n").length;

  if (hasTypeEscapes) return ELON_CHALLENGES[3];
  if (hasAbstraction && lines > 80) return ELON_CHALLENGES[5];
  if (lines > 100) return ELON_CHALLENGES[1];
  if (hasConditionals && lines > 60) return ELON_CHALLENGES[7];
  return ELON_CHALLENGES[Math.floor(Math.random() * ELON_CHALLENGES.length)];
}

// ─── Heuristic Code Analysis ─────────────────────────────────────────────────

interface SimplifyFinding {
  severity: "info" | "warning" | "critical";
  icon: string;
  category: string;
  detail: string;
}

const IMPLEMENT_TOOLS = new Set(["write", "edit", "refactor"]);

function analyzeCode(code: string): SimplifyFinding[] {
  const findings: SimplifyFinding[] = [];
  const lines = code.split("\n");
  const totalLines = lines.length;

  if (totalLines > 200) findings.push({ severity: "warning", icon: "📏", category: "File Length", detail: `File is ${totalLines} lines.` });
  let maxIndent = 0;
  for (const line of lines) { const indent = line.search(/\S/); if (indent > maxIndent) maxIndent = indent; }
  if (maxIndent > 24) findings.push({ severity: "critical", icon: "🪺", category: "Nesting", detail: `Code reaches depth ${maxIndent / 2}.` });
  else if (maxIndent > 16) findings.push({ severity: "warning", icon: "🪺", category: "Nesting", detail: `Depth ${maxIndent / 2}.` });
  const condCount = (code.match(/\bif\s*\(/g) || []).length + (code.match(/\belse\s+if\b/g) || []).length;
  if (totalLines > 0 && condCount / totalLines > 0.2) findings.push({ severity: "warning", icon: "🔀", category: "Conditionals", detail: `${condCount} in ${totalLines} lines (${Math.round(condCount / totalLines * 100)}%).` });
  const escapes = (code.match(/\bas\s+any\b|@ts-ignore|@ts-expect-error/g) || []).length;
  if (escapes > 0) findings.push({ severity: "warning", icon: "🏗️", category: "Type Escapes", detail: `${escapes} violations.` });
  const emptyCatches = (code.match(/catch\s*\([\w\s]+\)\s*\{\s*\}/g) || []).length;
  if (emptyCatches > 0) findings.push({ severity: "critical", icon: "🕳️", category: "Empty Catches", detail: `${emptyCatches} empty catch blocks.` });
  const debt = (code.match(/\bTODO|FIXME|HACK|XXX|WORKAROUND\b/gi) || []).length;
  if (debt > 3) findings.push({ severity: "warning", icon: "📋", category: "Debt Markers", detail: `${debt} markers.` });
  else if (debt > 0) findings.push({ severity: "info", icon: "📋", category: "Debt Markers", detail: `${debt} marker(s).` });
  return findings;
}

function findingsToOutput(findings: SimplifyFinding[], challenge: string | null): string {
  if (findings.length === 0 && !challenge) return "";
  const lines: string[] = [];
  lines.push(``, `---`);
  for (const f of findings) {
    const icon = f.severity === "critical" ? "🔴" : f.severity === "warning" ? "🟡" : "🔵";
    lines.push(`\n${icon} **${f.category}:** ${f.detail}`);
  }
  if (challenge) lines.push(`\n${challenge}`);
  return lines.join("\n");
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

const elonMuskAlgorithmPlugin: Plugin = async ({ worktree }) => {
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
      if (!currentConfig.notifications) return;
      if (isThrottled(keywordThrottle, input.sessionID, KEYWORD_INTERVAL)) return;
      const userText = output.parts.filter((p): p is TextPart => p.type === "text").map((p) => p.text).join(" ");
      const match = containsTriggerKeyword(userText, currentConfig.keywords);
      if (match) {
        keywordThrottle.set(input.sessionID, Date.now());
        output.parts.push({
          id: randomUUID(), sessionID: input.sessionID, messageID: input.messageID ?? randomUUID(),
          type: "text" as const,
          text: `\n> 💡 You mentioned "*${match}*" — consider \`/elon-algorithm\``,
        });
      }
    },

    "tool.execute.after": async (input, output) => {
      const toolName = input.tool.toLowerCase();
      if (!IMPLEMENT_TOOLS.has(toolName)) return;
      const code = input.args?.content ?? input.args?.newString ?? null;
      if (!code || typeof code !== "string" || code.length < 200) return;

      const sessionKey = `${input.sessionID}:${toolName}`;

      let findings: SimplifyFinding[] = [];
      let challenge: string | null = null;

      if (!isThrottled(analysisThrottle, sessionKey, ANALYSIS_INTERVAL)) {
        analysisThrottle.set(sessionKey, Date.now());
        findings = analyzeCode(code);
      }

      if (!isThrottled(analysisThrottle, `${input.sessionID}:elon`, ELON_INTERVAL)) {
        analysisThrottle.set(`${input.sessionID}:elon`, Date.now());
        challenge = pickChallenge(code);
      }

      const outputText = findingsToOutput(findings, challenge);
      if (outputText) output.output = output.output + outputText;
    },

    "command.execute.before": async (input, output) => {
      if (input.command === "elon-algorithm") {
        activatedSessions.add(input.sessionID);
        const id = randomUUID();
        output.parts = [{
          id, sessionID: input.sessionID, messageID: id,
          type: "text" as const,
          text: [
            `🚀 **Algorithm activated.** Engineering principles will guide this session.`,
            ``,
            `**1. Question** — named author required`,
            `**2. Delete** — best part is no part`,
            `**3. Simplify** — only what survived step 2`,
            `**4. Accelerate** — find the bottleneck`,
            `**5. Automate** — last, never before deletion`,
            ``,
            `\`elon-debt-index\` — measure technical debt.`,
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
