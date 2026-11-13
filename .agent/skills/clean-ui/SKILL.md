---
name: clean-ui
description: Enforce high-density, monochrome, zero-AI-slop UI standards (Things 3 / Linear / Notion Calendar style) for the Final Exam Smart Planner PWA. Apply whenever creating or modifying any UI component, layout, or styling.
---

# Clean UI Rules (Zero AI Slop)

## 1. Visual Prohibitions (Strict)
- **No Emojis**: Never render emoji characters (`📚`, `✨`, `🔥`, `🎉`, etc.) anywhere in UI labels, buttons, badges, headings, empty states, or notifications.
- **No Sparkles Icon**: Never import or render `Sparkles` (or decorative star/wand icons) from `lucide-react`. Use functional icons only (`Calendar`, `Cpu`, `SlidersHorizontal`, `Check`, `Plus`, `Trash2`, `Pencil`, `LogIn`, `LogOut`, `Clock`, `ChevronLeft`, `ChevronRight`, `RotateCcw`, `AlertCircle`).
- **No Gradients**: Never use `bg-gradient-*`, `linear-gradient`, or `radial-gradient` backgrounds or gradient text.
- **No Heavy Shadows or Nested Cards**: Never use `shadow-md`, `shadow-lg`, `shadow-xl`, or `shadow-2xl`. Never nest bordered cards inside other bordered cards. Divide regions strictly with `1px solid` hairline borders (`border-zinc-200`, `divide-zinc-200`).
- **No Fluff or Exclamation Marks**: Never write motivational cheerleading copy or `!` exclamation marks in the interface. Keep copy concise, factual, and tool-oriented.

## 2. Color & Surface System
- **90% Monochrome Base**:
  - Primary canvas: `#FFFFFF`
  - Secondary panel / toolbar / hover surface: `#F8FAFC` / `bg-zinc-50`
  - Hairline dividers & borders: `#E4E4E7` (`border-zinc-200`)
  - Primary text: `#18181B` (`text-zinc-900`), secondary text: `#52525B` (`text-zinc-600`), muted labels: `#71717A` (`text-zinc-500`)
- **Single Accent Color**: Cobalt Blue `#2563EB` (`blue-600`) reserved strictly for primary actions, active selections, active tab underlines, and progress fill.
- **Subject Tags**: Use low-saturation pastel surfaces only (`*-50` background, `*-700` text, `*-200` `1px` border).

## 3. Typography & Icons
- **Tabular Numerals**: Apply `tabular-nums` (`font-variant-numeric: tabular-nums`) to every D-Day counter, timestamp (`09:10~10:00`), duration, checklist ratio, and completion percentage (`%`).
- **Icons**: Use `lucide-react` exclusively with `strokeWidth={1.5}` and compact sizes (`14px`–`18px`).

## 4. Layout & Accessibility
- **Galaxy Tab Landscape (`>= 960px`)**: Compact top summary bar + 2-column split (`Timeline` left ~55%, `Checklist` right ~45%) inside `100dvh` with independent scroll containers (`scrollbar-gutter: stable`, `overscroll-behavior: contain`).
- **Mobile Portrait (`< 960px`)**: Accessible top tab switcher (`aria-selected="true"` with `border-block-end` indicator, not color alone) switching cleanly between Timeline and Checklist.
- **Native `<dialog>` Modals**: Use `<dialog>` + `showModal()` with `overscroll-behavior: contain` on `dialog:modal` and `dialog::backdrop`.
- **Touch Targets**: Keep minimum `44×44px` hit areas on `@media (pointer: coarse)` and `24×24px` minimum on fine pointers.
