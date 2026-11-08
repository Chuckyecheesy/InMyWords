# Accessibility report

- URL: https://www.w3.org/WAI/fundamentals/accessibility-intro/
- Guideline: https://www.w3.org/WAI/fundamentals/accessibility-intro/
- Ratio: 92.8

## Groups

- Alternatives (visual): 83.3 (5/6)
- Keyboard (physical): 100.0 (124/124)
- Transcripts (auditory): not applicable
- Understand and navigate: 95.2 (198/208)

## Findings


### Alternatives (visual)

- `div.box-i > ul > li:nth-of-type(3) > a.video-link.video-link-small > img` — Image has empty alt text but is not marked decorative. Give the image equivalent alt text, or mark it decorative (alt="" inside a named control, or aria-hidden="true").

### Understand and navigate

- `#site-header > div.logos:nth-of-type(1) > a.home.w3c:nth-of-type(1)` — Control has no accessible name. Add visible text, aria-label, or aria-labelledby so the name says what the control does.
- `#site-header > div.logos:nth-of-type(1) > a.home.wai:nth-of-type(2)` — Control has no accessible name. Add visible text, aria-label, or aria-labelledby so the name says what the control does.
- `ul > li:nth-of-type(3) > form > div > button.button.button-icon` — Control has no accessible name. Add visible text, aria-label, or aria-labelledby so the name says what the control does.
- `#examples > div > p:nth-of-type(2) > em > a` — Control has no accessible name. Add visible text, aria-label, or aria-labelledby so the name says what the control does.
- `#examples > div > p:nth-of-type(6) > a:nth-of-type(1)` — Control has no accessible name. Add visible text, aria-label, or aria-labelledby so the name says what the control does.
- `#examples > div > p:nth-of-type(6) > a:nth-of-type(2)` — Control has no accessible name. Add visible text, aria-label, or aria-labelledby so the name says what the control does.
- `#examples > div > p:nth-of-type(9) > a` — Control has no accessible name. Add visible text, aria-label, or aria-labelledby so the name says what the control does.
- `aside.box.box-simple > div.box-i > ul > li:nth-of-type(1) > a` — Control has no accessible name. Add visible text, aria-label, or aria-labelledby so the name says what the control does.
- `aside.box.box-simple > div.box-i > ul > li:nth-of-type(2) > a` — Control has no accessible name. Add visible text, aria-label, or aria-labelledby so the name says what the control does.
- `aside.box.box-simple > div.box-i > ul > li:nth-of-type(3) > a.video-link.video-link-small` — Control has no accessible name. Add visible text, aria-label, or aria-labelledby so the name says what the control does.

Contrast was sampled from the first 80 visible text nodes. Later text was not scored.

## Disclaimer

This ratio is an automated reading of the checks taught in the W3C introduction to web accessibility (alternative text, keyboard access, transcripts, and the related ability to perceive, understand, navigate, and interact, with WCAG 2.2 AA contrast numbers). W3C WAI states that no tool alone can determine whether a site meets accessibility guidelines. This report is not a conformance claim.
