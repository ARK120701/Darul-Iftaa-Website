/* ============================================================
   Turns the HTML that mammoth.js produces from a .docx (e.g. a Google Doc
   downloaded as Word) into the same { text, size, runs } line objects the
   fatwa parser already understands for PDFs.

   Unlike PDFs, a .docx stores text in logical order with real letters, so
   Arabic and Urdu come through exactly as typed — no reordering needed.
   Bold and underline survive as run flags; a Heading 1/2 paragraph gets a
   larger "size" so the parser can pick out the title.
   ============================================================ */
(function (root) {
  const SIZES = { H1: 24, H2: 18, H3: 15, H4: 14, H5: 13, H6: 13 };

  // html: string; parse: (html) => Document (defaults to the browser's DOMParser)
  function toLines(html, parse) {
    const doc = parse
      ? parse(html)
      : new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    const lines = [];

    function pushLine(runs, size) {
      const text = runs.map(r => r.str).join('');
      lines.push({ text, size, runs });
    }

    function collect(node, flags, runs, size) {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {                         // text
          const str = child.nodeValue.replace(/ /g, ' ').replace(/[\r\n]+/g, ' ');
          if (str) runs.current.push({ str, bold: flags.bold, underline: flags.underline });
        } else if (child.nodeType === 1) {
          const tag = child.tagName;
          if (tag === 'BR') { pushLine(runs.current, size); runs.current = []; continue; }
          collect(child, {
            bold: flags.bold || tag === 'STRONG' || tag === 'B',
            underline: flags.underline || tag === 'U'
          }, runs, size);
        }
      }
    }

    function block(el) {
      const tag = el.tagName;
      if (tag === 'UL' || tag === 'OL') { el.querySelectorAll(':scope > li').forEach(block); return; }
      const size = SIZES[tag] || 12;
      // headings are bold by style, but that isn't a real bold run in the fatwa body
      const runs = { current: [] };
      collect(el, { bold: false, underline: false }, runs, size);
      pushLine(runs.current, size);
    }

    for (const el of doc.body.children) block(el);
    return lines;
  }

  root.DunyDocxLines = { toLines };
  if (typeof module !== 'undefined') module.exports = root.DunyDocxLines;
})(typeof window !== 'undefined' ? window : globalThis);
