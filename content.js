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

  // URL pattern: explicit http(s) OR www.* domain. Capture greedy chars,
  // then trim trailing punctuation (which is almost never part of the URL).
  const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'` ]+/gi;
  const TRIM_TAIL = /[.,;:!?)\]}>'"`*_~]+$/;

  // Track URLs with unmatched opening parens so we keep `)` when balanced.
  function trimTrailing(url) {
    let out = url;
    // Iteratively strip trailing punctuation, but keep balanced parens.
    while (out.length > 0) {
      const last = out[out.length - 1];
      if (!/[.,;:!?)\]}>'"`*_~]/.test(last)) break;
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
      // Element.matches is supported everywhere we care about.
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
    // Defensive: stop Schoology's delegated handlers from hijacking our click.
    a.addEventListener("click", (e) => e.stopPropagation(), true);
    return a;
  }

  function processTextNode(textNode) {
    const text = textNode.nodeValue;
    if (!text || text.length < 8) return; // shortest plausible: "a.bc/d" — but require URL_RE match anyway
    URL_RE.lastIndex = 0;
    if (!URL_RE.test(text)) return;
    if (isSkippableAncestor(textNode)) return;

    URL_RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    let replaced = false;

    while ((match = URL_RE.exec(text)) !== null) {
      const raw = match[0];
      const url = trimTrailing(raw);
      if (!url || url.length < 4) continue;

      const start = match.index;
      const end = start + url.length;

      if (start > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
      }

      const href = /^https?:\/\//i.test(url) ? url : "https://" + url;
      frag.appendChild(makeLink(href, url));

      lastIndex = end;
      replaced = true;

      // Reset regex cursor in case we trimmed punctuation off the end.
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
    if (root.nodeType === 3) { // Text
      out.push(root);
      return out;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) {
      return out;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !/[a-z]/i.test(node.nodeValue)) {
          return NodeFilter.FILTER_REJECT;
        }
        // Quick pre-check: must contain "://", "www.", or a literal "."
        // (We still call URL_RE later — this is just to skip cheaply.)
        if (!/(https?:\/\/|www\.)/i.test(node.nodeValue)) {
          return NodeFilter.FILTER_REJECT;
        }
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
      // Node may have been detached by a prior replace this batch — skip.
      if (!n.parentNode) continue;
      processTextNode(n);
    }
  }

  // --- Run once at idle, then watch for AJAX-loaded content ---

  let pending = new Set();
  let scheduled = false;

  function flush() {
    scheduled = false;
    const batch = pending;
    pending = new Set();
    for (const root of batch) {
      // Roots may have been detached.
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
              // Don't reprocess our own injected links.
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
