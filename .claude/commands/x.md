You are executing the `/x` command for the **Grindly** project.

Your job is to write a killer Twitter/X post about what's happening in the app — features, patches, insights, or anything that would go viral with the indie game / productivity app crowd.

---

## Step 1 — Read current context (run in parallel)

Gather intel simultaneously:
- `git log --oneline -20` → recent commits
- `git describe --tags --abbrev=0` → current version tag
- Read `C:\Users\fillo\.claude\projects\C--idly\memory\changelog_draft.md` → what's been shipping
- `git diff HEAD~5 --stat` → recent file activity to detect what areas are hot

---

## Step 2 — Pick the post angle

Based on the gathered context, pick the **best angle** for right now. Only one post — make it count.

**Angle options (pick what fits best):**

| Angle | When to use | Tone |
|-------|-------------|------|
| 🚀 **Feature drop** | Fresh feature just landed | Hype, concrete, show the "aha" |
| 🔧 **Patch insight** | Balance changes / bug fixes that are spicy | Honest dev log vibes |
| 💡 **Gameplay tip** | Non-obvious mechanic most users miss | "Did you know..." format |
| 📊 **Stats/numbers** | XP formula, level curves, economy data | Nerdy + shareable |
| 🏆 **Milestone/meta** | Version milestone, feature count, scope | Proud builder energy |
| 🧵 **Concept thread** | Explain a system (guilds, marketplace, raids) | Educational, long-form intro |
| 😤 **Hot take** | Opinion on productivity apps, gamification, grind culture | Controversial-but-true |
| 🎮 **Game feel moment** | A micro-interaction, animation, satisfying loop | Atmospheric, show don't tell |

**Decision rule:** Prefer angles tied to the most recent 3–5 commits. Fresh = more authentic engagement.

---

## Step 3 — Write the post

### Format rules:
- **Max 280 characters** for single tweet. If it wants to be a thread, write 2–3 tweets numbered (1/3, 2/3, 3/3)
- No corporate speak. Write like a **builder talking to other builders or players**
- Hook in the first line — no "We're excited to announce" garbage
- Use line breaks for breathing room
- Use **1–2 relevant emojis max** — don't spam them
- End with something that invites engagement: a question, a flex, or a punchy one-liner
- Hashtags: only if genuinely relevant. Max 2. Examples: `#indiedev` `#gamedev` `#buildinpublic` `#pixelart`
- **No links unless asked**

### Post style palette (vary each time, don't repeat the same structure twice in a row):
- Raw builder voice: "shipped X today. here's what it does and why:"
- Contrast hook: "most productivity apps do X. we did Y instead."
- Number lead: "tracked 847 hours across skills this week. what people actually spend time on:"
- Story: short 2-sentence arc with a twist
- Visual description: describe what a UI moment looks/feels like

---

## Step 4 — Write the image generation prompt

Below the post, output a separator and an image prompt for generating a visual to go with the tweet.

**Mascot reference:** Grindly's mascot is a tiny cute pixel-art purple square character — like a Minecraft block with eyes and stubby legs. Friendly, round pixel eyes, small smile. Primary color: `#9b59ff` purple. It's the brand character.

**Image prompt format:**
```
---
🎨 IMAGE PROMPT (for Midjourney / DALL-E / Ideogram):

[Prompt here]
```

**Image prompt rules:**
- Feature the mascot doing something thematically tied to the post
- Style: pixel art, 16-bit or 32-bit, dark background, clean composition
- Mood should match the tweet's angle (hype = action pose, insight = thinking pose, etc.)
- Suggest a specific scene (e.g., "mascot standing in front of a dungeon gate", "mascot holding a chart")
- Keep prompt under 100 words, concrete and visual
- Append: `pixel art style, 32-bit, dark background #1a1a2e, clean composition, no text`

---

## Step 5 — Output

Output ONLY this — two labeled sections, each with a fenced code block. No extra text before, between, or after. No preamble. The code block content must start on the very first line inside the fence (no blank line after the opening ```).

**Tweet** `[angle]`:
```
[tweet text here — no blank line before this]
```

**Image prompt**:
```
[image prompt here — no blank line before this]
```

No extra commentary. No "here's why I chose this angle". Nothing outside these two blocks.

---

## Optional: If the user passes an argument to `/x`

If the user wrote `/x <topic>` (e.g., `/x guilds`, `/x hot zone`, `/x raids`), focus the post on that topic specifically. Still pick the best angle, but constrain it to the given topic.
