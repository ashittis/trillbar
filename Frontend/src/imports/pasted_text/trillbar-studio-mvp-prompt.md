Got you. I’ll give this in a way you can **paste into Figma AI / Bolt / any UI generator** and get a clean, buildable MVP.

No fluff. Minimal. Functional. Dark. Pro.

---

# TrillBar Studio — MVP Wireframe Prompt (Figma / Bolt Ready)

---

## 🔧 GLOBAL DESIGN SYSTEM (apply first)

**Theme:**

* Dark, studio-grade
* Background: `#0B0B0D`
* Surface: `#111114`
* Elevated: `#18181C`
* Border: `#23232A`

**Text:**

* Primary: `#E6E6EB`
* Secondary: `#9A9AA3`
* Muted: `#6F6F78`

**Accent (functional, not decorative):**

* Active: `#4C8DFF`
* Success: `#3CCB7F`
* Warning: `#FFB020`
* Error: `#FF5C5C`

**Typography:**

* Font: Inter / SF Pro
* Size scale:

  * 12 (meta)
  * 13 (default)
  * 16 (important)
  * 18 (section headers)

**Rules:**

* No shadows
* No gradients
* No rounded cards (max 6px radius)
* 1px borders only
* Spacing = 8pt grid

---

# 🧭 MAIN FRAME STRUCTURE

---

## FRAME: `Session / Default Mode`

**Canvas:** 1440 x 900

---

### 1. HEADER (Top - 56px height)

```
Left:
[Session Name] — Episode 03
[Version: V1] [Language: Tamil ▼]

Center:
[Mode Switch]
Adapt | Direct | Record | Mix | Review

Right:
[Progress 68%]
[Export]
[User Avatar]
```

---

### 2. MAIN GRID

```
| LEFT (Video) | CENTER (Lines) | RIGHT (Inspector) |
| 30%          | 45%            | 25%              |
```

---

# 🎬 LEFT PANEL — VIDEO / WAVEFORM

---

## COMPONENT: Video Player

```
[Video Frame]

Overlay:
- Play/Pause center
- Current TC bottom left
- Scene marker ticks on timeline

Below:
[Timeline scrub bar]
[Zoom slider]
```

---

## STATE: Audio-only

Replace video with:

```
[Large waveform view]

Controls:
- Zoom
- Channel selector (mono / stereo / 5.1)
```

---

# 🧠 CENTER PANEL — LINE SYSTEM (CORE)

---

## COMPONENT: LINE ROW (Collapsed)

```
| TC In | Character | Target Text                | Dur | Score | State |
|-------|----------|----------------------------|-----|-------|-------|
| 01:02 | Karthik  | Naan sollala…              | 2.4 | 87    | AI    |
```

---

## INTERACTION:

* Click row → Expand
* Shift + click → Multi select
* Hover → subtle highlight

---

## COMPONENT: LINE ROW (Expanded)

```
----------------------------------------
Waveform (source/dub toggle)

[Play Original] [Play Dub] [A/B]

⚠ Duration mismatch
⚠ Lip sync low

Notes (collapsed)
----------------------------------------
```

---

## COMPONENT: LINE ROW (DEEP EXPANDED — EMOTION)

```
Waveform
Word grid:
[Naan] [unnakku] [sollaama] [ponaen]

Emotion ▼
----------------------------------------
Source Curve (grey, thin)

Editable Curve (blue line)

Keyframes:
●     ●         ●

Timeline:
0s    1s        2s
----------------------------------------
```

---

## INTERACTIONS:

### Add keyframe:

* Click on word → create keyframe

### Move:

* Drag horizontally → snaps to words
* Drag vertically → intensity

### Click keyframe:

→ opens right panel (emotion editor)

---

## VISUAL RULE:

After render:

* waveform segments color-coded by emotion

  * Blue → guilt
  * Amber → realization
  * Green → resolve

---

# 🧾 LINE STATES (BADGES)

Use minimal pills:

* AI
* Imported
* Approved
* Flagged
* Locked
* Human Required

---

# 📊 RIGHT PANEL — INSPECTOR

---

## DEFAULT (Nothing selected)

```
Session Notes
- Free text

Warnings:
⚠ Missing M&E
⚠ 3 lines unassigned voice
```

---

## LINE SELECTED

```
Voice
[Assigned Voice ▼]
[Version Locked ✓]

Emotion
[Guilt → Resolve]
[Edit Arc]

Timing
[Speed 1.0x]
[Stretch / Compress]

Line Type
[Dialogue ▼]

Delivery
☐ Whisper
☐ Tremor
☐ Breathless

Actions
[Re-render]
[Queue Status]
```

---

## KEYFRAME SELECTED

```
Emotion Picker

● Guilt
○ Sadness
○ Anger
○ Resolve
○ Neutral

Intensity
[Slider 0–100]

Interpolation
(Smooth ●)
(Linear ○)
(Step ○)

Modifiers
☐ Whisper
☐ Tremor
☐ Breathless
```

---

## CHARACTER SELECTED

```
Character: Karthik

Voice
[TM Male 04 ▼]

Version Lock
[Locked ✓]

All Lines
[List jump links]
```

---

## SCENE SELECTED

```
Scene: INT HOUSE

Reverb
[Room Profile ▼]

Room Tone
[Auto / Manual]

Scene Notes
```

---

# 🎛 BOTTOM BAR

```
[Play] [Pause] [Prev Line] [Next Line]

[Record] (only in record mode)

[Render Queue: 3 pending]

[Zoom Timeline]
```

---

# 🔄 MODES (STATE CHANGES)

---

## ADAPT MODE

* Target text editable
* Emotion hidden by default
* Duration warnings visible

---

## DIRECT MODE

* Emotion visible
* A/B compare prominent
* Approve / Revisit buttons

---

## RECORD MODE

```
BIG CENTER:

Current Line
"Naan sollala..."

[Record Button]

[Takes]
Take 1
Take 2
Take 3
```

---

## MIX MODE

* Multi-track waveform
* LUFS meter
* No text editing

---

## REVIEW MODE

```
[Play]

[Flag Issue]

Comment box
```

No editing.

---

# 📤 EXPORT SCREEN

---

## FRAME: Export Center

```
Profile:
(Netflix ●)
(Amazon ○)
(YouTube ○)
(Custom ○)

Outputs:
☑ Dialogue Stem
☑ M&E
☑ Composite
☑ Subtitles

Advanced:
LUFS [-27]
Peak [-2 dB]

Special:
☐ Only changed lines
☐ Reel export
☐ Multi-language package

[Start Export]
```

---

# 🧪 EDGE CASE HANDLING (IMPORTANT FOR PROTOTYPE)

---

## SHORT CLIP

* Disable emotion lane
* Tooltip:
  "Too short for emotion arc"

---

## OVERLAP

* Stack lines vertically
* Independent playback

---

## SONG

* Replace emotion with:
  "Song — human recording recommended"

---

## DURATION DRIFT

Show BEFORE render:

```
⚠ This arc may extend clip by +180ms
[Adjust TC] [Allow overlap]
```

---

## FALLBACK RENDER

Show small log:

```
Rendered as segments (crossfade applied)
```

---

# 🧩 INTERACTION DETAILS (CRITICAL)

---

## KEYFRAME FEEL

* Snap: magnetic to words
* Drag: smooth, no lag
* No numeric input needed

---

## PLAYBACK SYNC

* Cursor moves across:

  * waveform
  * emotion curve
  * words

All synced.

---

## A/B TEST

```
[A] Subtle
[B] Intense

Toggle switch
```

---

# ⚡ FINAL PRINCIPLES (DO NOT BREAK)

---

### 1. No clutter

If feature is not needed → hidden

---

### 2. No modal interruptions

Everything inline or side panel

---

### 3. Line is everything

Never navigate away for line-level work

---

### 4. Emotion is advanced

Reveal only on demand

---

### 5. Speed > decoration

Feels like tool, not app

---

# ✅ WHAT YOU DO NEXT

Paste this into:

* Figma AI
* Bolt.new
* Galileo / v0

Then:

1. Generate layout
2. Fix spacing manually
3. Add interaction (prototype)
4. Then visual polish

---

If you want next level:

I can:
👉 break this into **actual Figma frames naming + auto-layout structure + component system**
👉 or generate **exact microcopy + labels like a real shipped product**

Just say.
