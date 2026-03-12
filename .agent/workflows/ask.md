---
description: Deep self-interrogation gate — challenge any implementation for optimality, elegance, forward compatibility, and review completeness before presenting
---

# /ask — "Is This the Best I Can Do?"

A structured self-challenge to run **after implementation, before presenting**. Forces you to prove — not just assert — that your solution is optimal, elegant, reviewed, and future-proof.

> [!IMPORTANT]
> This is a **mandatory gate** for non-trivial changes. Do not present work to the user until you can answer YES to every section below.

---

## When to Use

- After completing an implementation or plan, before `notify_user`
- When you feel "done" but haven't challenged your own work
- Anytime you catch yourself rationalizing a shortcut

---

## Steps

### 1. Load Context

Re-read your implementation against:

- `.agent/rules/criticalrules.md` — are any hard boundaries violated?
- `.agent/rules/lessons.md` — are you repeating a past mistake?
- The original requirement — does your solution address the **actual** problem, not a nearby one?

---

### 2. The Optimality Challenge

Ask each question. If the answer is "no" or "I'm not sure", **stop and fix before proceeding**.

| Dimension | Question |
|---|---|
| **Minimal** | Does every line of this change earn its place? Could I delete anything and still satisfy the requirement? |
| **Correct scope** | Am I solving exactly the stated problem, or did I scope-creep into adjacent concerns? |
| **Right abstraction level** | Am I operating at the right level of abstraction, or am I over/under-engineering? |
| **No redundancy** | Does this duplicate logic, data, or structure that already exists elsewhere in the codebase? |
| **Schema-driven** | If an existing artifact (schema, types, config, registry) already encodes this information, am I deriving from it — or hand-writing what a machine could generate? |

---

### 3. The Elegance Challenge

> **"Knowing everything I know now, is there a simpler shape?"**

| Check | Question |
|---|---|
| **Single concept per unit** | Does each function/type/module represent exactly one idea? |
| **One canonical path** | Is there exactly one way to achieve each behavior, or did I create alternatives that could diverge? |
| **No magic values** | Did I introduce sentinel strings, special-case booleans, or implicit conventions that could be eliminated by a structural change? |
| **Minimal surface** | Does this add schema/API surface? Every field agents must learn costs tokens. Is each one justified? |
| **Would I be proud of this?** | If a staff engineer reviewed this cold, would they approve it without "but have you considered..."? |

If the simpler shape exists: **redesign before proceeding**. Don't polish a suboptimal structure.

---

### 4. The Forward-Compatibility Challenge

| Check | Question |
|---|---|
| **Extension without modification** | Can the next person (or the next feature) extend this without modifying existing code? |
| **No implicit contracts** | Are there hidden assumptions that will break when the codebase evolves? (e.g., hardcoded lists that should be derived, ordering dependencies that aren't enforced) |
| **Backwards compatible** | Do existing consumers (MCP clients, tests, examples) continue to work without modification? |
| **Migration path** | If this changes behavior, is there a clear migration path — or does it silently break existing programs? |
| **Automation-friendly** | Could an agent extend this in the future without special instructions, or does it require tribal knowledge? |

---

### 5. The Review Challenge

| Check | Question |
|---|---|
| **Tests prove it** | Do the tests verify the actual requirement — not just that the code runs, but that it does the right thing? |
| **Failure paths covered** | What happens when this fails? Are error paths tested, not just happy paths? |
| **Regression-free** | Have you run the full test suite? Zero regressions, no exceptions? |
| **Self-reviewed** | Have you re-read your own diff as if you were reviewing someone else's PR? |
| **Plan reviewed** | If there was an implementation plan, was `/review` run at least twice on it? |

---

### 6. The Killer Question

After all checks pass, ask one final question:

> **"If I had to mass reject this and start fresh right now, what would I do differently?"**

- If the answer is "nothing" — you're done. Ship it.
- If the answer reveals a better approach — seriously consider whether the improvement justifies the rework.
- If the answer is "I'd do the same thing but..." — apply that "but" before presenting.

---

### 7. Record the Verdict

Append to your implementation plan or walkthrough:

```markdown
## /ask Self-Challenge

| Dimension | Passed | Notes |
|---|---|---|
| Optimality | ✅/❌ | [brief justification or what was fixed] |
| Elegance | ✅/❌ | |
| Forward Compatibility | ✅/❌ | |
| Review Completeness | ✅/❌ | |
| Killer Question | ✅/❌ | |
```

---

## Anti-Patterns

❌ **Rubber-stamping** — running `/ask` as a formality and answering "yes" to everything without actually thinking  
❌ **Perfectionism paralysis** — using `/ask` to endlessly re-iterate when the solution is already good enough  
❌ **Scope expansion** — the challenge reveals an adjacent improvement and you build it instead of shipping  
❌ **Skipping the killer question** — the final question is where the real insight hides  
❌ **Not recording the verdict** — if you didn't write it down, you didn't do it  
