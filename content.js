/*
 * ViperLink for Schoology
 * Converts plain-text URLs into real <a> links without touching existing
 * links, form fields, contenteditable regions, or rich-text editors.
 */
(() => {
  "use strict";

  const SKIP_TAGS = new Set([
    "A", "BUTTON", "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA",
    "INPUT", "SELECT", "OPTION", "IFRAME", "SVG", "CANVAS",
    "CODE", "PRE", "KBD", "SAMP"
  ]);

  // CSS selectors of containers we never touch (rich-text editors, code).
  const SKIP_SELECTORS = [
    "[contenteditable=''],[contenteditable='true'],[contenteditable='plaintext-only']",
    ".mce-content-body",          // TinyMCE
    ".tox-edit-area",             // TinyMCE 5+
    ".ck-editor__editable",       // CKEditor
    ".fr-element",                // Froala
    ".ql-editor",                 // Quill
    ".CodeMirror", ".cm-editor",  // CodeMirror
    ".monaco-editor",             // Monaco
    "[role='textbox']",
    "[data-viperlink-skip]"
  ].join(",");

  // Common TLDs accepted for bare-domain matches (no scheme, no www).
  // Scheme'd URLs and www.* don't require this list.
  const TLDS = (
    "com|net|org|edu|gov|mil|int|io|co|uk|us|ca|au|de|fr|jp|in|cn|nl|it|es|" +
    "se|no|fi|dk|pl|ru|br|mx|kr|tw|hk|sg|nz|ie|ch|at|be|pt|gr|cz|tr|il|za|" +
    "ar|cl|ph|my|th|id|vn|ae|sa|eg|ng|ke|ly|gl|me|tv|gg|fm|sh|ai|app|dev|" +
    "info|biz|store|online|site|blog|music|tech|design|news|pro|life|live|" +
    "wiki|media|fyi|xyz|page|cc|club|email|family|games|host|link|press|" +
    "review|space|today|world|zone|ws|tube|stream|video|cool|fun|run|chat"
  );

  // Three branches:
  //   1. Explicit scheme:  https?://...
  //   2. www-prefixed:     www.foo.bar(/path)?
  //   3. Bare domain:      foo.bar.{tld}(/path)?  (only if TLD is known)
  const URL_RE = new RegExp(
    "\\bhttps?:\\/\\/[^\\s<>\"'\\[\\]]+" +
    "|" +
    "\\bwww\\.[a-z0-9-]+(?:\\.[a-z0-9-]+)+(?:\\/[^\\s<>\"'\\[\\]]*)?" +
    "|" +
    "\\b[a-z][a-z0-9-]*(?:\\.[a-z][a-z0-9-]*)*\\.(?:" + TLDS + ")\\b(?:\\/[^\\s<>\"'\\[\\]]*)?",
    "gi"
  );

  // Cheap pre-check: any letter followed by a dot followed by 2+ letters.
  const HAS_URL_HINT = /[a-z]\.[a-z]{2,}/i;

  function trimTrailing(url) {
    let out = url;
    while (out.length > 0) {
      const last = out[out.length - 1];
      if (!/[.,;:!?)\]}>'"*_~]/.test(last)) break;
      if (last === ")") {
        const opens = (out.match(/\(/g) || []).length;
        const closes = (out.match(/\)/g) || []).length;
        if (closes <= opens) break;
      }
      if (last === "]") {
        const opens = (out.match(/\[/g) || []).length;
        const closes = (out.match(/\]/g) || []).length;
        if (closes <= opens) break;
      }
      out = out.slice(0, -1);
    }
    return out;
  }

  function isSkippableAncestor(node) {
    let n = node.parentNode;
    while (n && n.nodeType === 1) {
      if (SKIP_TAGS.has(n.nodeName)) return true;
      if (n.matches && n.matches(SKIP_SELECTORS)) return true;
      n = n.parentNode;
    }
    return false;
  }

  function makeLink(href, text) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    a.target = "_blank";
    a.rel = "noopener noreferrer ugc";
    a.className = "viperlink-link";
    a.setAttribute("data-viperlink", "1");
    a.addEventListener("click", (e) => e.stopPropagation(), true);
    return a;
  }

  function processTextNode(textNode) {
    const text = textNode.nodeValue;
    if (!text || text.length < 4) return;
    if (!HAS_URL_HINT.test(text)) return;
    URL_RE.lastIndex = 0;
    if (!URL_RE.test(text)) return;
    if (isSkippableAncestor(textNode)) return;

    URL_RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    let replaced = false;

    while ((match = URL_RE.exec(text)) !== null) {
      const start = match.index;

      // Skip emails: "user@example.com" — bare-domain branch must not fire.
      if (start > 0 && text[start - 1] === "@") {
        URL_RE.lastIndex = start + match[0].length;
        continue;
      }

      const url = trimTrailing(match[0]);
      if (!url || url.length < 4) continue;

      const end = start + url.length;

      if (start > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
      }

      const href = /^https?:\/\//i.test(url) ? url : "https://" + url;
      frag.appendChild(makeLink(href, url));

      lastIndex = end;
      replaced = true;
      URL_RE.lastIndex = end;
    }

    if (!replaced) return;
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode.replaceChild(frag, textNode);
  }

  function collectTextNodes(root) {
    const out = [];
    if (!root) return out;
    if (root.nodeType === 3) {
      out.push(root);
      return out;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) {
      return out;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        if (!HAS_URL_HINT.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  function scan(root) {
    const nodes = collectTextNodes(root);
    for (const n of nodes) {
      if (!n.parentNode) continue;
      processTextNode(n);
    }
  }

  let pending = new Set();
  let scheduled = false;

  function flush() {
    scheduled = false;
    const batch = pending;
    pending = new Set();
    for (const root of batch) {
      if (root.nodeType === 1 && !document.contains(root)) continue;
      scan(root);
    }
  }

  function schedule(root) {
    pending.add(root);
    if (scheduled) return;
    scheduled = true;
    const run = () => flush();
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 250 });
    } else {
      setTimeout(run, 50);
    }
  }

  function start() {
    schedule(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              if (node.nodeName === "A" && node.dataset && node.dataset.viperlink === "1") continue;
              schedule(node);
            } else if (node.nodeType === 3) {
              schedule(node);
            }
          }
        } else if (m.type === "characterData") {
          schedule(m.target);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
