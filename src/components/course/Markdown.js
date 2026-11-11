'use client';

/**
 * A small, safe formatter for course notes (no HTML is ever injected):
 *   # / ## / ### headings, - bullet lists, 1. numbered lists, | tables |,
 *   **bold**, *italic*, blank line = new paragraph.
 */
function inline(text, key = 0) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(p)) return <em key={`${key}-${i}`}>{p.slice(1, -1)}</em>;
    return p;
  });
}

export default function Markdown({ text, className = '' }) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      i++;
      continue;
    }
    const h = t.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? 'text-lg font-bold text-maroon' : level === 2 ? 'mt-4 text-base font-bold text-maroon' : 'mt-3 text-sm font-bold text-slate-800';
      out.push(
        <p key={k++} className={cls}>
          {inline(h[2], k)}
        </p>
      );
      i++;
      continue;
    }
    if (/^\|.*\|$/.test(t)) {
      const rows = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        const cells = lines[i].trim().slice(1, -1).split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={k++} className="my-2 overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-sm">
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j} className="border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left font-semibold text-slate-700">
                    {inline(c, j)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j} className="border border-slate-200 px-2.5 py-1.5 align-top text-slate-700">
                      {inline(c, j)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    if (/^([-•*])\s+/.test(t)) {
      const items = [];
      while (i < lines.length && /^([-•*])\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^([-•*])\s+/, ''));
      out.push(
        <ul key={k++} className="my-1.5 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {items.map((x, j) => (
            <li key={j}>{inline(x, j)}</li>
          ))}
        </ul>
      );
      continue;
    }
    if (/^\d+[.)]\s+/.test(t)) {
      const items = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^\d+[.)]\s+/, ''));
      out.push(
        <ol key={k++} className="my-1.5 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          {items.map((x, j) => (
            <li key={j}>{inline(x, j)}</li>
          ))}
        </ol>
      );
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\||[-•*]\s|\d+[.)]\s)/.test(lines[i].trim())) para.push(lines[i++].trim());
    out.push(
      <p key={k++} className="my-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">
        {inline(para.join('\n'), k)}
      </p>
    );
  }
  return <div className={className}>{out}</div>;
}
