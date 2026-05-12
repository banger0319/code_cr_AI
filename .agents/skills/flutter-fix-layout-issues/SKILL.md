---
name: flutter-fix-layout-issues
description: Flutter layout review guidance for overflow, constraints, responsiveness, and adaptive UI issues.
---

# Flutter Fix Layout Issues Skill

- Check for `RenderFlex overflow`, unconstrained `Column`/`Row`, nested scroll conflicts, and missing `Expanded`/`Flexible` usage.
- Verify responsive behavior across small screens, tablets, landscape, and dynamic text scaling.
- Prefer constraint-aware widgets such as `LayoutBuilder`, `Flexible`, `Expanded`, `Wrap`, `SingleChildScrollView`, and slivers where appropriate.
- Watch for hard-coded dimensions, unsafe `MediaQuery` assumptions, clipped content, and controls below safe areas.
- Ensure layout fixes preserve accessibility, localization, and dark mode readability.
