"""Collect a page snapshot for the accessibility ratio.

`snapshot_from_html` is the browser-free path used by tests.
`collect_url` loads the URL in Playwright Chromium, including client-rendered
content, and adds computed contrast.
"""

from __future__ import annotations

from html.parser import HTMLParser

VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}
NATIVE_TAGS = {"a", "button", "input", "select", "textarea", "summary"}
LABEL_SKIP_TYPES = {"submit", "button", "reset", "hidden", "image"}
CONTRAST_CAP = 80

COLLECT_JS = r"""
() => {
  const CONTRAST_CAP = 80;
  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;
    if (el.closest("[aria-hidden='true']") && el.getAttribute("aria-hidden") !== "true") {
      return false;
    }
    if (el.getAttribute("aria-hidden") === "true") return false;
    const box = el.getBoundingClientRect();
    if (box.width < 1 && box.height < 1) return false;
    return true;
  }
  function selector(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      let part = node.tagName.toLowerCase();
      if (node.classList && node.classList.length) {
        part += "." + [...node.classList].slice(0, 2).map((name) => CSS.escape(name)).join(".");
      }
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((child) => child.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = node.parentElement;
      if (node && node.id) {
        parts.unshift("#" + CSS.escape(node.id));
        break;
      }
    }
    return parts.join(" > ");
  }
  function accName(el) {
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const text = labelledby.split(/\s+/).map((id) => {
        const target = document.getElementById(id);
        return target ? (target.innerText || "") : "";
      }).join(" ").replace(/\s+/g, " ").trim();
      if (text) return text.slice(0, 160);
    }
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim().slice(0, 160);
    if (el.tagName === "IMG") return (el.getAttribute("alt") || "").trim();
    if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) {
      const wrapping = el.closest("label");
      if (wrapping) {
        const clone = wrapping.cloneNode(true);
        clone.querySelectorAll("input, select, textarea").forEach((node) => node.remove());
        const text = (clone.innerText || "").replace(/\s+/g, " ").trim();
        if (text) return text.slice(0, 160);
      }
      if (el.id) {
        const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        const text = lab ? (lab.innerText || "").replace(/\s+/g, " ").trim() : "";
        if (text) return text.slice(0, 160);
      }
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (["submit", "button", "reset"].includes(type)) {
        return (el.getAttribute("value") || type).trim();
      }
      return "";
    }
    return (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 160);
  }
  function inputLabelled(el) {
    if ((el.getAttribute("aria-label") || "").trim()) return true;
    if ((el.getAttribute("aria-labelledby") || "").trim()) return true;
    if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return true;
    if (el.closest("label")) return true;
    return false;
  }
  function parseColor(value) {
    const match = String(value).match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(",").map((part) => parseFloat(part.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  function composite(fg, bg) {
    const a = fg.a;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
      a: 1,
    };
  }
  function backgroundOf(el) {
    const layers = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const color = parseColor(getComputedStyle(node).backgroundColor);
      if (color && color.a > 0) layers.push(color);
      if (color && color.a >= 1) break;
      node = node.parentElement;
    }
    if (!layers.length) return { r: 255, g: 255, b: 255, a: 1 };
    let acc = layers[layers.length - 1];
    for (let i = layers.length - 2; i >= 0; i -= 1) acc = composite(layers[i], acc);
    return acc;
  }
  function channel(value) {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function luminance(color) {
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
  }
  function contrastRatio(fg, bg) {
    const a = luminance(fg);
    const b = luminance(bg);
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }
  function directText(el) {
    let text = "";
    for (const node of el.childNodes) {
      if (node.nodeType === 3) text += node.textContent;
    }
    return text.replace(/\s+/g, " ").trim();
  }
  function focusIsVisible() {
    const target = document.querySelector("a[href], button, input:not([type='hidden']), select, textarea, summary");
    if (!target) return null;
    try {
      target.focus({ focusVisible: true });
    } catch (error) {
      target.focus();
    }
    const style = getComputedStyle(target);
    const width = parseFloat(style.outlineWidth) || 0;
    const outline = style.outlineStyle !== "none" && width >= 1;
    const shadow = style.boxShadow && style.boxShadow !== "none";
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    return Boolean(outline || shadow);
  }

  const images = [...document.querySelectorAll("img")].filter(visible).map((img) => {
    const hasAlt = img.hasAttribute("alt");
    const alt = hasAlt ? (img.getAttribute("alt") || "") : "";
    const hidden = img.getAttribute("aria-hidden") === "true";
    const control = img.closest("a, button, [role='button'], [role='link']");
    const controlName = control ? accName(control) : "";
    const decorative = hidden || (hasAlt && alt.trim() === "" && Boolean(control && controlName));
    return { selector: selector(img), has_alt: hasAlt, alt, decorative };
  });

  const media = [...document.querySelectorAll("audio, video")].map((el) => {
    const hasTrack = [...el.querySelectorAll("track")].some((track) => {
      const kind = (track.getAttribute("kind") || "").toLowerCase();
      return kind === "captions" || kind === "descriptions" || kind === "subtitles";
    });
    const described = (el.getAttribute("aria-describedby") || "").trim();
    let hasTranscript = false;
    if (described) {
      hasTranscript = described.split(/\s+/).some((id) => {
        const node = document.getElementById(id);
        return Boolean(node && (node.innerText || "").trim());
      });
    }
    const region = el.parentElement
      ? el.parentElement.querySelector("[data-transcript], .transcript, [aria-label*='transcript' i]")
      : null;
    if (region && (region.innerText || "").trim()) hasTranscript = true;
    const autoplay = Boolean(el.autoplay || el.hasAttribute("autoplay"));
    const namedStop = el.parentElement
      ? [...el.parentElement.querySelectorAll("button, a[href]")].some((control) => {
          return /pause|stop/i.test(accName(control));
        })
      : false;
    return {
      selector: selector(el),
      tag: el.tagName.toLowerCase(),
      has_track: hasTrack,
      has_transcript: hasTranscript,
      autoplay,
      has_pause: Boolean(el.hasAttribute("controls") || namedStop),
    };
  });

  const nativeSelector = "a[href], button, input:not([type='hidden']), select, textarea, summary";
  function pack(el, clickOnly) {
    const raw = el.getAttribute("tabindex");
    const tabindex = raw === null || raw === "" ? null : Number(raw);
    const disabled = el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();
    const needsLabel = ["input", "select", "textarea"].includes(tag)
      && !["submit", "button", "reset", "hidden", "image"].includes(type);
    return {
      selector: selector(el),
      tag,
      name: accName(el),
      tabindex: Number.isNaN(tabindex) ? null : tabindex,
      in_tab_order: !disabled && (tabindex === null || tabindex >= 0),
      disabled,
      click_only: clickOnly,
      needs_label: needsLabel,
      labelled: needsLabel ? inputLabelled(el) : true,
    };
  }
  const natives = [...document.querySelectorAll(nativeSelector)].filter(visible).map((el) => pack(el, false));
  const clickOnly = [...document.querySelectorAll("[onclick], [role='button'], [role='link']")]
    .filter((el) => visible(el) && !el.matches(nativeSelector))
    .filter((el) => {
      const tab = el.getAttribute("tabindex");
      return tab === null || Number(tab) < 0;
    })
    .map((el) => pack(el, true));

  const contrast = [];
  const seen = new Set();
  let capped = false;
  const nodes = document.querySelectorAll("body *");
  for (const el of nodes) {
    if (contrast.length >= CONTRAST_CAP) {
      capped = true;
      break;
    }
    if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG"].includes(el.tagName)) continue;
    if (!visible(el)) continue;
    const text = directText(el);
    if (!text) continue;
    const key = selector(el) + "|" + text.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    const style = getComputedStyle(el);
    const fg = parseColor(style.color);
    if (!fg) continue;
    const bg = backgroundOf(el);
    const solid = composite(fg, bg);
    const size = parseFloat(style.fontSize) || 16;
    const weight = parseInt(style.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    contrast.push({
      selector: selector(el),
      text: text.slice(0, 80),
      ratio: Math.round(contrastRatio(solid, bg) * 100) / 100,
      large,
      font_size: size,
    });
  }

  return {
    title: document.title || "",
    lang: document.documentElement.getAttribute("lang") || "",
    h1_count: document.querySelectorAll("h1").length,
    has_main: Boolean(document.querySelector("main, [role='main']")),
    focus_visible: focusIsVisible(),
    images,
    media,
    interactive: natives.concat(clickOnly),
    contrast,
    contrast_capped: capped,
  };
}
"""


class _Node:
    def __init__(self, tag: str, attrs: list[tuple[str, str | None]], parent: "_Node | None"):
        self.tag = tag
        self.attrs = {key.lower(): ("" if value is None else value) for key, value in attrs}
        self.parent = parent
        self.children: list[_Node] = []
        self.text = ""

    def get(self, name: str) -> str:
        return self.attrs.get(name, "")

    def has(self, name: str) -> bool:
        return name in self.attrs


class _Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = _Node("document", [], None)
        self.stack = [self.root]
        self.styles: list[str] = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        node = _Node(tag, attrs, self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        tag = tag.lower()
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data):
        current = self.stack[-1]
        if current.tag == "style":
            self.styles.append(data)
        else:
            current.text += data


def _walk(node: _Node):
    yield node
    for child in node.children:
        yield from _walk(child)


def _hidden(node: _Node) -> bool:
    current: _Node | None = node
    while current is not None and current.tag != "document":
        if current.has("hidden") or current.get("aria-hidden") == "true":
            return True
        style = current.get("style").replace(" ", "").lower()
        if "display:none" in style or "visibility:hidden" in style:
            return True
        current = current.parent
    return False


def _text(node: _Node) -> str:
    parts = [node.text]
    for child in node.children:
        if child.tag in {"script", "style"}:
            continue
        parts.append(_text(child))
    return " ".join(part.strip() for part in parts if part and part.strip())


def _by_id(root: _Node) -> dict[str, _Node]:
    found = {}
    for node in _walk(root):
        if node.has("id") and node.get("id") not in found:
            found[node.get("id")] = node
    return found


def _text_excluding(node: _Node, skip: _Node) -> str:
    if node is skip:
        return ""
    parts = [node.text]
    for child in node.children:
        if child is skip or child.tag in {"script", "style"}:
            continue
        parts.append(_text_excluding(child, skip))
    return " ".join(part.strip() for part in parts if part and part.strip())


def _label_text(node: _Node, root: _Node) -> str:
    current = node.parent
    while current is not None:
        if current.tag == "label":
            return _text_excluding(current, node).strip()
        current = current.parent
    element_id = node.get("id")
    if element_id:
        for candidate in _walk(root):
            if candidate.tag == "label" and candidate.get("for") == element_id:
                return _text(candidate).strip()
    return ""


def _name(node: _Node, ids: dict[str, _Node], root: _Node | None = None) -> str:
    labelledby = node.get("aria-labelledby").strip()
    if labelledby:
        parts = []
        for item in labelledby.split():
            target = ids.get(item)
            if target:
                parts.append(_text(target))
        joined = " ".join(part for part in parts if part).strip()
        if joined:
            return joined[:160]
    aria = node.get("aria-label").strip()
    if aria:
        return aria[:160]
    if node.tag == "img":
        return node.get("alt").strip()
    if node.tag in {"input", "select", "textarea"} and root is not None:
        from_label = _label_text(node, root)
        if from_label:
            return from_label[:160]
        kind = node.get("type").lower() or "text"
        if node.tag == "input" and kind in {"submit", "button", "reset"}:
            return (node.get("value") or kind).strip()
        return ""
    return _text(node)[:160]


def _selector(node: _Node) -> str:
    if node.has("id") and node.get("id"):
        return "#" + node.get("id")
    parts = []
    current: _Node | None = node
    while current is not None and current.tag != "document" and len(parts) < 5:
        part = current.tag
        if current.parent is not None:
            same = [child for child in current.parent.children if child.tag == current.tag]
            if len(same) > 1:
                part += f":nth-of-type({same.index(current) + 1})"
        parts.append(part)
        current = current.parent
    return " > ".join(reversed(parts))


def _is_native(node: _Node) -> bool:
    if node.tag == "a":
        return node.has("href")
    if node.tag == "input":
        return node.get("type").lower() != "hidden"
    return node.tag in NATIVE_TAGS


def _labelled(node: _Node, ids: dict[str, _Node], root: _Node) -> bool:
    if node.get("aria-label").strip() or node.get("aria-labelledby").strip():
        return True
    element_id = node.get("id")
    if element_id:
        for candidate in _walk(root):
            if candidate.tag == "label" and candidate.get("for") == element_id:
                return True
    current = node.parent
    while current is not None:
        if current.tag == "label":
            return True
        current = current.parent
    return False


def _decorative(node: _Node, ids: dict[str, _Node], root: _Node) -> bool:
    if node.get("aria-hidden") == "true":
        return True
    if not node.has("alt") or node.get("alt").strip():
        return False
    current = node.parent
    while current is not None and current.tag != "document":
        role = current.get("role")
        if current.tag in {"a", "button"} or role in {"button", "link"}:
            return bool(_name(current, ids, root).strip())
        current = current.parent
    return False


def _pause(node: _Node, ids: dict[str, _Node], root: _Node) -> bool:
    if node.has("controls"):
        return True
    parent = node.parent
    if parent is None:
        return False
    for child in _walk(parent):
        if child.tag not in {"button", "a"}:
            continue
        if "pause" in _name(child, ids, root).lower() or "stop" in _name(child, ids, root).lower():
            return True
    return False


def _transcript(node: _Node, ids: dict[str, _Node]) -> bool:
    for child in node.children:
        if child.tag != "track":
            continue
        kind = child.get("kind").lower()
        if kind in {"captions", "descriptions", "subtitles"}:
            return True
    described = node.get("aria-describedby").strip()
    if described:
        for item in described.split():
            target = ids.get(item)
            if target and _text(target).strip():
                return True
    parent = node.parent
    if parent is None:
        return False
    for child in parent.children:
        classes = child.get("class").lower()
        label = child.get("aria-label").lower()
        if child.has("data-transcript") or "transcript" in classes or "transcript" in label:
            if _text(child).strip():
                return True
    return False


def snapshot_from_html(html: str, url: str = "") -> dict:
    """Parse a fixture into the same snapshot shape Playwright produces.

    Contrast is omitted. A fixture that does not set text colors is not
    scored for contrast, so a clean page can reach 100 without a layout engine.
    """
    builder = _Builder()
    builder.feed(html)
    builder.close()
    root = builder.root
    ids = _by_id(root)
    html_node = next((node for node in root.children if node.tag == "html"), None)
    title_node = next((node for node in _walk(root) if node.tag == "title"), None)
    style_blob = "\n".join(builder.styles)
    focus_visible = ":focus-visible" in style_blob or ":focus" in style_blob

    images = []
    media = []
    interactive = []
    h1_count = 0
    has_main = False
    for node in _walk(root):
        if node.tag == "document":
            continue
        if node.tag == "h1":
            h1_count += 1
        if node.tag == "main" or node.get("role") == "main":
            has_main = True
        if _hidden(node):
            continue
        if node.tag == "img":
            images.append({
                "selector": _selector(node),
                "has_alt": node.has("alt"),
                "alt": node.get("alt") if node.has("alt") else "",
                "decorative": _decorative(node, ids, root),
            })
        if node.tag in {"audio", "video"}:
            has_track = any(
                child.tag == "track" and child.get("kind").lower() in {"captions", "descriptions", "subtitles"}
                for child in node.children
            )
            media.append({
                "selector": _selector(node),
                "tag": node.tag,
                "has_track": has_track,
                "has_transcript": _transcript(node, ids),
                "autoplay": node.has("autoplay"),
                "has_pause": _pause(node, ids, root),
            })
        click_only = False
        if node.has("onclick") and not _is_native(node):
            raw_tab = node.get("tabindex") if node.has("tabindex") else None
            tab_value = None if raw_tab in {None, ""} else int(float(raw_tab))
            if tab_value is None or tab_value < 0:
                click_only = True
        role = node.get("role")
        if role in {"button", "link"} and not _is_native(node):
            raw_tab = node.get("tabindex") if node.has("tabindex") else None
            tab_value = None if raw_tab in {None, ""} else int(float(raw_tab))
            if tab_value is None or tab_value < 0:
                click_only = True
        if not _is_native(node) and not click_only:
            continue
        raw = node.get("tabindex") if node.has("tabindex") else None
        tabindex = None if raw in {None, ""} else int(float(raw))
        kind = node.get("type").lower()
        needs_label = node.tag in {"input", "select", "textarea"} and kind not in LABEL_SKIP_TYPES
        interactive.append({
            "selector": _selector(node),
            "tag": node.tag,
            "name": _name(node, ids, root),
            "tabindex": tabindex,
            "in_tab_order": tabindex is None or tabindex >= 0,
            "disabled": node.has("disabled") or node.get("aria-disabled") == "true",
            "click_only": click_only,
            "needs_label": needs_label,
            "labelled": _labelled(node, ids, root) if needs_label else True,
        })

    return {
        "url": url,
        "title": _text(title_node) if title_node else "",
        "lang": html_node.get("lang") if html_node else "",
        "h1_count": h1_count,
        "has_main": has_main,
        "focus_visible": focus_visible if (interactive or focus_visible) else None,
        "images": images,
        "media": media,
        "interactive": interactive,
        "contrast": [],
        "contrast_capped": False,
    }


def collect_url(url: str, timeout_ms: int = 30000) -> dict:
    """Load url in headless Chromium and return a snapshot."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(url, wait_until="load", timeout=timeout_ms)
            page.wait_for_timeout(400)
            snapshot = page.evaluate(COLLECT_JS)
        finally:
            browser.close()
    snapshot["url"] = url
    return snapshot
