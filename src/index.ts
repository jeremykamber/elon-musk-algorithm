import type { Plugin, Hooks } from "@opencode-ai/plugin";
import type { TextPart } from "@opencode-ai/sdk";
import { tool } from "@opencode-ai/plugin/tool";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "node:crypto";

// ─── Config ───────────────────────────────────────────────────────────────────

interface ElonConfig {
  keywords: string[];
  notifications: boolean;
}

const DEFAULT_KEYWORDS = [
  "optimize", "automate", "bottleneck", "cycle time", "bloat",
  "waste", "inefficient", "technical debt", "first principles",
  "too slow", "technical debt index", "attack the constraint", "fewer things",
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
    console.warn("[elon-algorithm] Failed to load elon.json, using defaults:", err);
    return DEFAULT_CONFIG;
  }
}

// ─── Algorithm System Prompt ──────────────────────────────────────────────────

const ALGORITHM_PROMPT = `## Engineering Algorithm

When tackling any engineering problem, consider this ordered approach:

1. **Question every requirement.** Every requirement has a specific human author. Find them. Challenge the requirement. Does it still hold? Is the original constraint still valid?

2. **Delete any part or process you can.** Before optimizing, ask: does this need to exist? The best part is no part. Push to the limit. If you don't add back 10% of what you deleted, you didn't delete enough.

3. **Simplify and optimize what remains.** Only now — never before deletion.

4. **Accelerate cycle time.** Find the bottleneck. Speed up feedback loops.

5. **Automate.** Last step. Never automate something that should have been deleted.

**The order matters.** The most common mistake is to optimize something that shouldn't exist.`;

// ─── Activated Sessions ───────────────────────────────────────────────────────

const activatedSessions = new Set<string>();

// ─── Heuristic Code Analysis ─────────────────────────────────────────────────

interface SimplifyFinding {
  severity: "info" | "warning" | "critical";
  icon: string;
  category: string;
  detail: string;
}

const IMPLEMENT_TOOLS = new Set(["write", "edit", "refactor"]);
const AMBIENT_TOOLS = new Set(["bash", "write", "edit", "refactor"]);

function analyzeCode(code: string): SimplifyFinding[] {
  const findings: SimplifyFinding[] = [];
  const lines = code.split("\n");
  const totalLines = lines.length;

  if (totalLines > 200) findings.push({ severity: "warning", icon: "📏", category: "File Length", detail: `File is ${totalLines} lines.` });
  let maxIndent = 0;
  for (const line of lines) { const indent = line.search(/\S/); if (indent > maxIndent) maxIndent = indent; }
  if (maxIndent > 24) findings.push({ severity: "critical", icon: "🪺", category: "Nesting", detail: `Code reaches depth ${maxIndent / 2}. Deeply nested code is fragile.` });
  else if (maxIndent > 16) findings.push({ severity: "warning", icon: "🪺", category: "Nesting", detail: `Depth ${maxIndent / 2}. Consider reducing nesting.` });
  const condCount = (code.match(/\bif\s*\(/g) || []).length + (code.match(/\belse\s+if\b/g) || []).length;
  if (totalLines > 0 && condCount / totalLines > 0.2) findings.push({ severity: "warning", icon: "🔀", category: "Conditionals", detail: `${condCount} in ${totalLines} lines (${Math.round(condCount / totalLines * 100)}%).` });
  const escapes = (code.match(/\bas\s+any\b|@ts-ignore|@ts-expect-error/g) || []).length;
  if (escapes > 0) findings.push({ severity: "warning", icon: "🏗️", category: "Type Escapes", detail: `${escapes} type safety violations.` });
  const emptyCatches = (code.match(/catch\s*\([\w\s]+\)\s*\{\s*\}/g) || []).length;
  if (emptyCatches > 0) findings.push({ severity: "critical", icon: "🕳️", category: "Empty Catches", detail: `${emptyCatches} silent failure swallowers.` });
  const debt = (code.match(/\bTODO|FIXME|HACK|XXX|WORKAROUND\b/gi) || []).length;
  if (debt > 3) findings.push({ severity: "warning", icon: "📋", category: "Debt Markers", detail: `${debt} markers.` });
  else if (debt > 0) findings.push({ severity: "info", icon: "📋", category: "Debt Markers", detail: `${debt} marker(s).` });
  return findings;
}

function findingsToOutput(findings: SimplifyFinding[]): string {
  if (findings.length === 0) return "";
  const lines: string[] = [];
  lines.push(``, `---`, `### Code Check`);
  for (const f of findings) {
    const icon = f.severity === "critical" ? "🔴" : f.severity === "warning" ? "🟡" : "🔵";
    lines.push(`\n${icon} **${f.category}:** ${f.detail}`);
  }
  if (findings.some(f => f.severity === "critical")) {
    lines.push(`\n🔴 **Critical issues found.** Consider addressing before shipping.`);
  }
  return lines.join("\n");
}

// ─── Technical Debt Index Tool ─────────────────────────────────────────────

const elonDebtIndex = tool({
  description: `Calculate the Technical Debt Index: current complexity / essential complexity. Measures how much unnecessary overhead has accumulated.`,
  args: {
    target: tool.schema.string().describe("The part, code, or process to analyze"),
    currentComplexity: tool.schema.number().positive().describe("Current complexity (LOC, steps, or 1-100)"),
    essentialComplexity: tool.schema.number().positive().describe("Minimum essential complexity (same unit)"),
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
    const lines = [
      `### Technical Debt Index: ${args.target}`,
      ``, `Ratio: ${ratio} (${rating})`, `Excess: ${excess}`,
      ``, `Know your debt. Delete before you add. Simplify before you optimize.`,
    ].join("\n");
    return { title: `Debt: ${args.target} — ${ratio}`, output: lines, metadata: { debtIndex: ratio, rating } };
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

// ─── Plugin Entry ─────────────────────────────────────────────────────────────

const elonMuskAlgorithmPlugin: Plugin = async ({ client, worktree, $ }) => {
  currentConfig = loadConfig(worktree);
  configWorktree = worktree;
  let lastNotified = 0;

  const hooks: Hooks = {
    tool: { "elon-debt-index": elonDebtIndex },

    "experimental.chat.system.transform": async (_input, output) => {
      if (_input.sessionID && activatedSessions.has(_input.sessionID)) {
        output.system.push(ALGORITHM_PROMPT);
      }
    },

    "chat.message": async (input, output) => {
      const userText = output.parts.filter((p): p is TextPart => p.type === "text").map((p) => p.text).join(" ");
      const match = containsTriggerKeyword(userText, currentConfig.keywords);
      if (match) {
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
      if (!code || typeof code !== "string" || code.length < 50) return;
      const findings = analyzeCode(code);
      const outputText = findingsToOutput(findings);
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
            `**1. Question every requirement** — needs a named author`,
            `**2. Delete what you can** — best part is no part`,
            `**3. Simplify & optimize** — only what survived step 2`,
            `**4. Accelerate** — find the bottleneck`,
            `**5. Automate** — last, never before deletion`,
            ``,
            `Use \`elon-debt-index\` to measure technical debt.`,
            `Use \`/elon-algorithm\` again to see this message.`,
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
