import ExcelJS from 'exceljs';

export const norm = (s) => String(s || '').toLowerCase().replace(/[\s_-]/g, '');

export const cellText = (cell) => {
  const v = cell?.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.text) return String(v.text).trim();
    if (v.result !== undefined && v.result !== null) return String(v.result).trim();
    if (v.richText) return v.richText.map((r) => r.text).join('').trim();
    if (v.hyperlink) return String(v.hyperlink).trim();
    return '';
  }
  return String(v).trim();
};

/** Read the first worksheet into plain objects keyed by normalised header. */
export function readWorksheet(worksheet) {
  const headers = {};
  worksheet.getRow(1).eachCell((cell, col) => {
    const key = norm(cellText(cell));
    if (key) headers[col] = key;
  });

  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const key = headers[col];
      if (key) obj[key] = cellText(cell);
    });
    if (Object.values(obj).some((v) => v !== '')) rows.push({ ...obj, __line: rowNumber });
  });
  return rows;
}

/** Parse a simple CSV (quoted fields supported) into the same shape. */
export function readCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return [];

  const split = (line) => {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = split(lines[0]).map(norm);
  return lines.slice(1).map((line, i) => {
    const cells = split(line);
    const obj = { __line: i + 2 };
    headers.forEach((h, j) => {
      if (h) obj[h] = cells[j] ?? '';
    });
    return obj;
  });
}

/** Read an uploaded .xlsx / .csv buffer into rows. */
export async function readSheet(buffer, fileName = '') {
  if (/\.csv$/i.test(fileName)) return readCsv(buffer.toString('utf8'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return null;
  return readWorksheet(sheet);
}

/** First non-empty value among the given normalised column names. */
export const pick = (row, ...names) => {
  for (const n of names) {
    if (row[n] !== undefined && String(row[n]).trim() !== '') return String(row[n]).trim();
  }
  return '';
};

export const TEMPLATE_COLUMNS = [
  { header: 'Name', width: 24 },
  { header: 'Email', width: 32 },
  { header: 'Password', width: 14 },
  { header: 'Admission No', width: 16 },
  { header: 'Phone', width: 16 },
  { header: 'Parent Name', width: 24 },
  { header: 'Parent Email', width: 32 },
  { header: 'Parent Phone', width: 16 },
];

/** Build the student-upload template workbook. */
export async function buildTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Al Mihad Learning Portal';
  const ws = wb.addWorksheet('Students');

  ws.columns = TEMPLATE_COLUMNS.map((c) => ({ header: c.header, key: c.header, width: c.width }));

  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } };
  head.height = 22;
  head.alignment = { vertical: 'middle' };

  ws.addRow(['Aisha Rahman', 'aisha.rahman@example.com', '', 'INT-1001', '0501234567', 'Rahman Ali', 'rahman.ali@example.com', '0509876543']);
  ws.addRow(['Daniel Joseph', 'daniel.joseph@example.com', '', 'INT-1002', '0551112222', '', '', '']);

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return wb;
}
