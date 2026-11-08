# Sage Garden adaptation

Reference: [Sage Garden by Serafim on 21st](https://21st.dev/@serafimcloud/themes/sage-garden).

This is a palette adaptation for the existing In My Words design system, not a replacement component library. Magic UI and Mobbin remain optional references; no new runtime UI dependency is required.

## Direction

Warm paper, white working surfaces, dark ink, forest-sage actions, and pale sage selection states. Retain blue, clay, and amber for distinct source categories and status meanings. Do not use color alone to identify a source, selection, or action.

The reference's primary sage (#7c9082) is too light for white button text. Use #4b6653 for actions and #344d3b for pressed/strong states instead. Keep #7c9082 for strong control borders. Decorative dividers can stay lighter.

## Scope and guardrails

- Apply through `web/app/tokens.css` so landing, resident, staff, and utility screens share one palette.
- Preserve existing photos, layouts, typography, navigation, and approval behavior.
- Keep resident body text at least 22px and tap targets at least 64px.
- Keep large-text and explicit high-contrast modes. High-contrast colors are unchanged.
- Keep reduced-motion behavior. Do not add animation, glass effects, or decorative gradients.
- No new claims or resident facts are introduced by the theme.

## Checks

`web/test/theme.test.ts` checks body, muted text, actions, selection text, source labels, status colors, focus, and strong control borders against their token surfaces. Body text must reach 7:1; other text pairs 4.5:1; focus and strong borders 3:1. The tests also protect the resident size tokens and high-contrast source pairs.

These token checks do not certify every rendered element. Browser checks cover representative landing, resident, and staff screens at desktop and mobile sizes, plus the explicit high-contrast mode.
