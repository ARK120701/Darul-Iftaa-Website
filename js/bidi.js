/* ============================================================
   Mixed English / Arabic text layout.

   A fatwa body is stored as HTML where lines are separated by <br>, so the
   browser treats the whole block as one left-to-right paragraph and Arabic
   lines end up on the left. DunyBidi.wrap() splits such HTML into one block
   per line and marks each with dir="auto", so English lines stay on the left
   and Arabic/Urdu lines align to the right.
   ============================================================ */
(function (root) {
  const AR_RE     = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  const LETTER_RE = /[A-Za-zÀ-ɏ؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  const BLOCK     = new Set(['P', 'DIV', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TABLE']);

  function mark(el) {
    el.setAttribute('dir', 'auto');
    const m = el.textContent.match(LETTER_RE);
    if (m && AR_RE.test(m[0])) el.classList.add('ar-line');
  }

  function wrap(html) {
    if (!html) return html;
    const box = document.createElement('div');
    box.innerHTML = html;
    const out = document.createElement('div');
    let line = null;

    function flush() {
      if (!line) return;
      if (!line.textContent.trim() && !line.children.length) { line = null; return; }   // stray whitespace
      if (line.textContent.trim()) mark(line);
      out.appendChild(line);
      line = null;
    }

    for (const node of Array.from(box.childNodes)) {
      if (node.nodeType === 1 && node.tagName === 'BR') {
        if (line) flush();                                   // <br> ends the current line
        else { const gap = document.createElement('div'); gap.className = 'bidi-gap'; out.appendChild(gap); }
      } else if (node.nodeType === 1 && BLOCK.has(node.tagName)) {
        flush();
        if (node.tagName === 'UL' || node.tagName === 'OL') node.querySelectorAll('li').forEach(mark);
        else mark(node);
        out.appendChild(node.cloneNode(true));
      } else {
        if (!line) line = document.createElement('div');
        line.appendChild(node.cloneNode(true));
      }
    }
    flush();
    return out.innerHTML;
  }

  root.DunyBidi = { wrap };
})(window);
