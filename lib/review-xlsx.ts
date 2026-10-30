/**
 * A dependency-free, standards-compliant XLSX writer for selected visitor-review data.
 * All spreadsheet cells use inline strings (never formulas), so review content such as
 * '=HYPERLINK(...)' is treated as plain text by Excel and LibreOffice.
 */
export type ReviewSheetData = {
  headers: string[];
  rows: string[][];
};

const encoder = new TextEncoder();
const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function xml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function excelColumn(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function createSheet({ headers, rows }: ReviewSheetData): string {
  if (headers.length < 2) throw new Error('내보낼 정보가 선택되지 않았습니다.');
  if (headers.length > 16384 || rows.length > 1048575) {
    throw new Error('Excel 최대 행 또는 열 수를 초과했습니다.');
  }
  const allRows = [headers, ...rows];
  const rowXml = allRows.map((values, rowIndex) => {
    const cells = values.slice(0, headers.length).map((value, columnIndex) => {
      if (value === '') return '';
      const cell = `${excelColumn(columnIndex)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? ' s="1"' : ' s="2"';
      return `<c r="${cell}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(String(value))}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}"${rowIndex === 0 ? ' ht="26" customHeight="1"' : ''}>${cells}</row>`;
  }).join('');
  const widths = headers.map((header, i) => {
    const width = i === 0 ? 9 : Math.min(58, Math.max(17, header.length * 2.1));
    return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
  }).join('');
  const ref = `A1:${excelColumn(headers.length - 1)}${allRows.length}`;
  return `${xmlHeader}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="${ref}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="16"/><cols>${widths}</cols>` +
    `<sheetData>${rowXml}</sheetData><autoFilter ref="${ref}"/></worksheet>`;
}

const contentTypes = `${xmlHeader}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';
const rootRels = `${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';
const workbook = `${xmlHeader}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
  '<sheets><sheet name="리뷰" sheetId="1" r:id="rId1"/></sheets></workbook>';
const workbookRels = `${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';
const styles = `${xmlHeader}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  '<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function writeU16(target: Uint8Array, at: number, value: number): void {
  target[at] = value & 0xff;
  target[at + 1] = (value >>> 8) & 0xff;
}
function writeU32(target: Uint8Array, at: number, value: number): void {
  writeU16(target, at, value & 0xffff);
  writeU16(target, at + 2, value >>> 16);
}

type ZipFile = { name: string; bytes: Uint8Array; crc: number; offset: number };
function zipEntries(entries: { name: string; contents: string }[]): Uint8Array {
  const files: ZipFile[] = entries.map(({ name, contents }) => ({
    name,
    bytes: encoder.encode(contents),
    crc: 0,
    offset: 0,
  }));
  if (files.length > 65535) throw new Error('압축 파일 항목 수가 너무 많습니다.');
  const localSize = files.reduce((sum, file) => sum + 30 + encoder.encode(file.name).length + file.bytes.length, 0);
  const centralSize = files.reduce((sum, file) => sum + 46 + encoder.encode(file.name).length, 0);
  if (localSize + centralSize > 0xffffffff) throw new Error('Excel 파일 크기가 너무 큽니다.');
  const result = new Uint8Array(localSize + centralSize + 22);
  let at = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    file.offset = at;
    file.crc = crc32(file.bytes);
    writeU32(result, at, 0x04034b50);
    writeU16(result, at + 4, 20);
    writeU16(result, at + 8, 0); // stored, not compressed
    writeU32(result, at + 14, file.crc);
    writeU32(result, at + 18, file.bytes.length);
    writeU32(result, at + 22, file.bytes.length);
    writeU16(result, at + 26, name.length);
    result.set(name, at + 30);
    result.set(file.bytes, at + 30 + name.length);
    at += 30 + name.length + file.bytes.length;
  }
  const centralStart = at;
  for (const file of files) {
    const name = encoder.encode(file.name);
    writeU32(result, at, 0x02014b50);
    writeU16(result, at + 4, 20);
    writeU16(result, at + 6, 20);
    writeU16(result, at + 10, 0);
    writeU32(result, at + 16, file.crc);
    writeU32(result, at + 20, file.bytes.length);
    writeU32(result, at + 24, file.bytes.length);
    writeU16(result, at + 28, name.length);
    writeU32(result, at + 42, file.offset);
    result.set(name, at + 46);
    at += 46 + name.length;
  }
  const centralLength = at - centralStart;
  writeU32(result, at, 0x06054b50);
  writeU16(result, at + 8, files.length);
  writeU16(result, at + 10, files.length);
  writeU32(result, at + 12, centralLength);
  writeU32(result, at + 16, centralStart);
  return result;
}

export function generateReviewXlsx(data: ReviewSheetData): Uint8Array {
  return zipEntries([
    { name: '[Content_Types].xml', contents: contentTypes },
    { name: '_rels/.rels', contents: rootRels },
    { name: 'xl/workbook.xml', contents: workbook },
    { name: 'xl/_rels/workbook.xml.rels', contents: workbookRels },
    { name: 'xl/styles.xml', contents: styles },
    { name: 'xl/worksheets/sheet1.xml', contents: createSheet(data) },
  ]);
}
