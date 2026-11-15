/**
 * A small Excel (.xlsx) writer and reader with no dependencies, for the GST exports and the HSN import.
 * Writer: strings and numbers, bold header rows, 2-decimal money cells, column widths. Reader: the first values of each sheet as text.
 * Pure TypeScript (Uint8Array in, Uint8Array out); the reader uses DecompressionStream, which the desktop webview and Node 18+ have.
 */

export type Cell = string | number | null | undefined | { v: string | number; style?: 'bold' | 'money' | 'head' | 'title' };
export interface Sheet { name: string; rows: Cell[][]; widths?: number[] }

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ------------------------------------------------------------------ zip (store) */

let crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  const u32 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
  const cat = (...a: Uint8Array[]) => { const out = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length; } return out; };
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    // 0x0800 = names are UTF-8; fixed DOS date 2026-01-01 so the same data always gives the same bytes
    const common = [u16(20), u16(0x0800), u16(0), u16(0), u16((46 << 9) | (1 << 5) | 1), u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0)];
    const local = cat(u32(0x04034b50), ...common, name, f.data);
    parts.push(local);
    central.push(cat(u32(0x02014b50), u16(20), ...common, u16(0), u16(0), u16(0), u32(0), u32(offset), name));
    offset += local.length;
  }
  const cd = cat(...central);
  const end = cat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0));
  return cat(...parts, cd, end);
}

/* ------------------------------------------------------------------ writer */

const esc = (s: string) => Array.from(s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')).filter((ch) => { const c = ch.charCodeAt(0); return c >= 32 || c === 9 || c === 10 || c === 13; }).join('');
const colName = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const STYLE: Record<string, number> = { bold: 1, money: 2, head: 3, title: 4 };

function sheetXml(s: Sheet): string {
  const rows = s.rows.map((r, ri) => {
    const cells = r.map((raw, ci) => {
      if (raw === null || raw === undefined || raw === '') return '';
      const obj = typeof raw === 'object' ? raw : { v: raw };
      const ref = `${colName(ci)}${ri + 1}`;
      const st = obj.style ? ` s="${STYLE[obj.style]}"` : '';
      if (typeof obj.v === 'number') return Number.isFinite(obj.v) ? `<c r="${ref}"${st}><v>${obj.v}</v></c>` : '';
      return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${esc(obj.v)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  const cols = s.widths?.length ? `<cols>${s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

/** A workbook as bytes. Sheet names are cut to Excel's 31 characters and cleaned of the characters it forbids. */
export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const list = sheets.length ? sheets : [{ name: 'Sheet1', rows: [] }];
  const names = list.map((s) => s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet');
  const files = [
    { name: '[Content_Types].xml', body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>` },
    ...list.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, body: sheetXml(s) })),
  ].map((f) => ({ name: f.name, data: enc.encode(f.body) }));
  return zip(files);
}

/* ------------------------------------------------------------------ reader */

const rd16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const rd32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  void w.write(data as unknown as BufferSource);
  void w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  let e = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 70000); i--) if (rd32(bytes, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('This is not an Excel (.xlsx) file.');
  const count = rd16(bytes, e + 10);
  let p = rd32(bytes, e + 16);
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (rd32(bytes, p) !== 0x02014b50) throw new Error('The Excel file is damaged.');
    const method = rd16(bytes, p + 10), csize = rd32(bytes, p + 20);
    const nlen = rd16(bytes, p + 28), elen = rd16(bytes, p + 30), clen = rd16(bytes, p + 32), loff = rd32(bytes, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    const lnlen = rd16(bytes, loff + 26), lelen = rd16(bytes, loff + 28);
    const raw = bytes.subarray(loff + 30 + lnlen + lelen, loff + 30 + lnlen + lelen + csize);
    out.set(name, method === 0 ? raw : method === 8 ? await inflateRaw(raw) : new Uint8Array());
    p += 46 + nlen + elen + clen;
  }
  return out;
}

const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textOf = (xml: string) => unesc([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

/** Every sheet of a workbook as rows of text (numbers as they were typed). Empty trailing cells are dropped. */
export async function readXlsx(bytes: Uint8Array): Promise<{ name: string; rows: string[][] }[]> {
  const files = await unzip(bytes);
  const get = (n: string) => (files.has(n) ? dec.decode(files.get(n)) : '');
  const shared = [...get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const wb = get('xl/workbook.xml');
  const rels = get('xl/_rels/workbook.xml.rels');
  const sheets: { name: string; rows: string[][] }[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*?name="([^"]*)"[^>]*?r:id="([^"]+)"[^>]*\/?>/g)) {
    const rel = new RegExp(`<Relationship\\b[^>]*?Id="${m[2]}"[^>]*?Target="([^"]+)"|<Relationship\\b[^>]*?Target="([^"]+)"[^>]*?Id="${m[2]}"`).exec(rels);
    const target = rel?.[1] ?? rel?.[2];
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const xml = get(path);
    const rows: string[][] = [];
    for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+\d+)"/.exec(cm[1])?.[1];
        if (!ref) continue;
        const type = /t="([^"]+)"/.exec(cm[1])?.[1];
        const body = cm[2] ?? '';
        let v = '';
        if (type === 's') v = shared[Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1])] ?? '';
        else if (type === 'inlineStr') v = textOf(body);
        else v = unesc(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
        row[colIndex(ref)] = v;
      }
      rows.push(Array.from(row, (x) => x ?? ''));
    }
    sheets.push({ name: unesc(m[1]), rows });
  }
  return sheets;
}

/* ------------------------------------------------------------------ csv */

/** CSV text to rows (commas, quotes, CRLF; a semicolon is used when the first line has more of them than commas). */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (first.match(/;/g) ?? []).length > (first.match(/,/g) ?? []).length ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}
