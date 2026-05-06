# ViperLink for Schoology

<p align="center">
  <img src="icons/vipershard-logo.png" alt="ViperShard" width="180">
</p>

A tiny browser extension that turns plain-text URLs in **Schoology** bios, course descriptions, posts, and comments into real clickable links. Schoology shows them as flat text — ViperLink linkifies them in place without disturbing existing links, form fields, or rich-text editors.

**[→ Install instructions](https://vipershard.github.io/ViperLink/)**

## How it works

A content script runs on Schoology (including custom-domain installs), walks visible text nodes, and replaces matched URLs with `<a target="_blank" rel="noopener noreferrer">`. A `MutationObserver` re-scans content that Schoology loads via AJAX (feed pulls, profile drawers, etc.).

**What it matches:**

- Explicit URLs — `https://example.com/path`, `http://example.com`
- `www.` URLs — `www.example.com/path`
- Bare domains with a known TLD — `youtu.be/abc`, `tinyurl.com/freebird`, `instagram.com/handle`, `spoti.fi/track`, etc.

**What it deliberately won't touch:**

- Email addresses (`name@example.com` — the `@` guard skips bare-domain matching)
- Version numbers like `1.0.5` or `v2.4` (regex requires letter start)
- Made-up TLDs like `something.notatld` (TLD must be on the whitelist)

To stay safe it skips:

- Existing `<a>`, `<button>`, form fields, `<code>`/`<pre>`, and SVG.
- Anything `contenteditable`, plus common rich-text editors (TinyMCE, CKEditor, Froala, Quill, CodeMirror, Monaco) so it never interferes while you're typing a post.
- Elements explicitly tagged `data-viperlink-skip`.

## Install (Load Unpacked)

### Chromium (Chrome, Edge, Brave, Opera, Vivaldi, Arc)

1. Download or clone this folder.
2. Open `chrome://extensions` (`edge://extensions`, `brave://extensions`, etc.).
3. Toggle **Developer mode** on.
4. Click **Load unpacked** and pick the `ViperLink` folder.
5. Open Schoology — bio links now click.

### Firefox

1. Visit `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json`.
3. The extension stays loaded until you restart Firefox. (For permanent install, the add-on needs to be signed via [AMO](https://addons.mozilla.org/).)

### Safari

Safari requires conversion through Xcode's `safari-web-extension-converter`. Not officially supported, but the source is standard MV3 so it converts cleanly.

## Permissions

None beyond access to `schoology.com`. No network calls, no storage, no telemetry — the entire extension is one content script that mutates the DOM.

## File layout

```
.
├── manifest.json   # MV3, with browser_specific_settings for Firefox
├── content.js      # Linkifier + MutationObserver
├── styles.css      # Native-looking blue link style
├── icons/          # ViperShard branding
├── docs/
│   └── index.html  # GitHub Pages landing page
└── README.md
```

## License

MIT — see `LICENSE`.
