# Elon Musk Algorithm Plugin

An opencode plugin that encodes Elon Musk's 5-step engineering algorithm as an agentic coding workflow. The plugin provides custom tools that force concrete verdicts at each step and a system prompt that bakes the algorithm into the AI's ambient reasoning.

## Language

**Algorithm**:
The 5-step engineering method: Question, Delete, Simplify, Accelerate, Automate. Each step must produce a concrete verdict before the next can begin.
_Avoid_: Checklist, framework (too passive — the algorithm demands decisions)

**Step Tool**:
A custom opencode tool corresponding to one of the 5 algorithm steps. Each step tool must force a definitive, actionable verdict — not present open-ended questions.
_Avoid_: Template, prompt (implies no judgment required)

**Meta Tool (elon-apply)**:
A tool that runs all 5 steps in sequence. Must produce real verdicts for each step, not hardcoded pass results.

**Verdict**:
The concrete output of a step tool. Must be one of a small set of definitive outcomes (e.g., VALIDATED/FLAGGED/REJECTED for Step 1, DELETE/TRIM/KEEP for Step 2). The tool must commit to a single verdict.

**System Prompt Injection**:
The algorithm's principles are baked into the AI's ambient reasoning via `experimental.chat.system.transform`. The AI follows the sequence step-by-step and emits `<step_done step="N">` after each step, which the user gates before proceeding.

## Relationships

- A **Step Tool** produces exactly one **Verdict**
- The **Meta Tool** runs all 5 **Step Tools** in sequence
- The **System Prompt Injection** provides ambient reasoning; **Step Tools** enforce concrete decisions
- Step progression is gated by the **User** — the AI ends each step with `<step_done>`, the user reviews and says "proceed"

## Flagged ambiguities

- "checklist" was used to mean both **Step Tool** and a passive list of questions — resolved: Step Tools must force verdicts, not just ask questions
- "ambient" was used to mean both system prompt injection and automatic workflow — resolved: ambient is only the reasoning layer; workflow progression is user-gated
- "nudge" was used to describe both keyword triggers and system prompt reminders — resolved: keyword triggers are the explicit nudge (chat.message hook); system prompt is ambient reasoning (experimental.chat.system.transform)
- "tool naming" — considered kebab-case vs snake_case vs camelCase for tool registration keys — resolved: kebab-case (elon-question, elon-delete, etc.) for consistency with command handler and existing code
