import * as XLSX from 'xlsx';
import { Question, OptionKey } from '../models/Question';

export interface ParsedRow {
  questionNumber: number;
  question: string;
  'options.A': string;
  'options.B': string;
  'options.C': string;
  'options.D': string;
  correctAnswer: string;
}

type QuestionColumn = 'questionNumber' | 'question' | 'options.A' | 'options.B' | 'options.C' | 'options.D' | 'correctAnswer';

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const REQUIRED_QUESTION_COLUMNS: QuestionColumn[] = [
  'questionNumber',
  'question',
  'options.A',
  'options.B',
  'options.C',
  'options.D',
  'correctAnswer',
];

const QUESTION_HEADER_MAP: Record<string, QuestionColumn> = {
  'question no': 'questionNumber',
  'question no.': 'questionNumber',
  'question number': 'questionNumber',
  questionno: 'questionNumber',
  'q.no': 'questionNumber',
  'q no': 'questionNumber',
  'q#': 'questionNumber',
  's.no': 'questionNumber',
  's no': 'questionNumber',
  'serial no': 'questionNumber',
  'serial no.': 'questionNumber',
  question: 'question',
  'question text': 'question',
  'option a': 'options.A',
  optiona: 'options.A',
  'option b': 'options.B',
  optionb: 'options.B',
  'option c': 'options.C',
  optionc: 'options.C',
  'option d': 'options.D',
  optiond: 'options.D',
  'correct answer': 'correctAnswer',
  answer: 'correctAnswer',
};

function findHeaderRow(
  rows: unknown[][],
): { headerIndex: number; headerMap: Array<QuestionColumn | null> } | null {
  for (let i = 0; i < rows.length; i++) {
    const headerMap = rows[i].map((cell) => QUESTION_HEADER_MAP[normalizeHeader(cell)] ?? null);
    if (REQUIRED_QUESTION_COLUMNS.every((col) => headerMap.includes(col))) {
      return { headerIndex: i, headerMap };
    }
  }
  return null;
}

function requiredHeadersMessage(rows: unknown[][]): string {
  const firstContentRow = rows.find((r) => r.some((c) => String(c ?? '').trim() !== ''));
  const present = new Set((firstContentRow ?? []).map((c) => normalizeHeader(c)));
  const missing: string[] = [];
  if (!['questionno', 'question no', 'question number', 'q.no', 's.no', 'serial no'].some((h) => present.has(h))) {
    missing.push('Question No');
  }
  if (!present.has('question')) missing.push('Question');
  ['option a', 'option b', 'option c', 'option d'].forEach((h, i) => {
    if (!present.has(h)) missing.push(`Option ${String.fromCharCode(65 + i)}`);
  });
  if (!present.has('correct answer') && !present.has('answer')) missing.push('Correct Answer');

  const found = (firstContentRow ?? [])
    .filter((c) => String(c ?? '').trim() !== '')
    .map((c) => JSON.stringify(String(c ?? '')))
    .join(', ');
  return missing.length > 0
    ? `Missing required headers: ${missing.join(', ')}.${found ? ` Found headers: ${found}.` : ' No headers found in the sheet.'}`
    : 'Could not locate the question header row in the sheet.';
}

type LegacyColumn = 'sNo' | 'question' | 'fourOptions' | 'result';

const LEGACY_HEADER_ALIASES: Record<string, LegacyColumn> = {
  's.no': 'sNo',
  's no': 'sNo',
  'serial no': 'sNo',
  'serial no.': 'sNo',
  sno: 'sNo',
  question: 'question',
  'question text': 'question',
  'four options': 'fourOptions',
  options: 'fourOptions',
  'options text': 'fourOptions',
  result: 'result',
  'correct answer': 'result',
  answer: 'result',
};

interface LegacyHeaderLocation {
  headerIndex: number;
  hasSNo: boolean;
  hasResult: boolean;
}

function findLegacyHeaderRow(rows: unknown[][]): LegacyHeaderLocation | null {
  const scanLimit = Math.min(rows.length, 10);
  for (let i = 0; i < scanLimit; i++) {
    const cols = rows[i].map((c) => LEGACY_HEADER_ALIASES[normalizeHeader(c)] ?? '');
    const has = (col: LegacyColumn) => cols.includes(col);
    if (has('question') && has('fourOptions')) {
      return { headerIndex: i, hasSNo: has('sNo'), hasResult: has('result') };
    }
  }
  return null;
}

type LegacyWarning = { row: number; questionNumber: number | string; message: string };

function parseFourOptions(raw: unknown): Partial<Record<OptionKey, string>> {
  const lines = String(raw ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const letters: OptionKey[] = ['A', 'B', 'C', 'D'];
  const out: Partial<Record<OptionKey, string>> = {};
  let index = 0;
  for (const line of lines) {
    const key = letters[Math.min(index, letters.length - 1)];
    const labelled = line.match(/^\s*([A-Da-d])\s*[.):\]\-–—]?\s*(.+)$/);
    if (!out[key]) out[key] = labelled ? labelled[2].trim() : line;
    index++;
  }
  return out;
}

function parseLegacyResult(raw: unknown, options: Partial<Record<OptionKey, string>>): { answer: string; warning?: string } {
  const text = String(raw ?? '').trim();
  if (!text) return { answer: '' };
  const match = text.match(/^\s*([A-Da-d])\s*[.):\]\-–—]?\s*(.*)$/);
  const letter = match ? match[1].toUpperCase() : '';
  const rest = (match ? match[2] : text).trim();

  const keys = ['A', 'B', 'C', 'D'] as OptionKey[];

  const exactFull = keys.find((k) => options[k] && options[k] === text);
  if (exactFull) return { answer: exactFull };

  if (rest) {
    const restMatch = keys.find((k) => options[k] && options[k].toLowerCase() === rest.toLowerCase());
    if (restMatch) return { answer: restMatch };
  }

  if (letter && rest) {
    return { answer: letter, warning: `Result letter ${letter} retained for admin review (text "${rest}" did not match any option).` };
  }
  if (letter) return { answer: letter };

  return { answer: '' };
}

interface CollectedRows {
  rows: Array<ParsedRow & { _rowNumber: number }>;
  warnings: LegacyWarning[];
}

function collectRows(rows: unknown[][], headerIndex: number, headerMap: Array<QuestionColumn | null>): CollectedRows {
  const parsed: Array<ParsedRow & { _rowNumber: number }> = [];
  let blankRows = 0;

  const cell = (row: unknown[], col: QuestionColumn): string => {
    const idx = headerMap.indexOf(col);
    return idx >= 0 ? String(row[idx] ?? '').trim() : '';
  };

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const draft = {
      questionNumber: cell(rows[i], 'questionNumber'),
      question: cell(rows[i], 'question'),
      'options.A': cell(rows[i], 'options.A'),
      'options.B': cell(rows[i], 'options.B'),
      'options.C': cell(rows[i], 'options.C'),
      'options.D': cell(rows[i], 'options.D'),
      correctAnswer: cell(rows[i], 'correctAnswer').toUpperCase(),
    };
    const hasAnyContent = Object.values(draft).some((v) => v !== '');
    if (!hasAnyContent || (!draft.questionNumber && !draft.question)) {
      blankRows += 1;
      continue;
    }
    const qNum = Number(draft.questionNumber);
    parsed.push({
      questionNumber: Number.isFinite(qNum) ? qNum : Number.NaN,
      question: draft.question,
      'options.A': draft['options.A'],
      'options.B': draft['options.B'],
      'options.C': draft['options.C'],
      'options.D': draft['options.D'],
      correctAnswer: draft.correctAnswer,
      _rowNumber: i + 1,
    });
  }

  return { rows: parsed, warnings: [] };
}

function collectLegacyRows(rows: unknown[][], loc: LegacyHeaderLocation): CollectedRows {
  const headerMap = rows[loc.headerIndex].map((c) => LEGACY_HEADER_ALIASES[normalizeHeader(c)] ?? '');
  const idxOf = (col: LegacyColumn): number => {
    const found = headerMap.indexOf(col);
    return found >= 0 ? found : -1;
  };
  const iNo = idxOf('sNo');
  const iQ = idxOf('question');
  const iOpt = idxOf('fourOptions');
  const iRes = idxOf('result');

  const parsed: Array<ParsedRow & { _rowNumber: number }> = [];
  const warnings: LegacyWarning[] = [];
  let blankRows = 0;

  for (let i = loc.headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const question = iQ >= 0 ? String(row[iQ] ?? '').trim() : '';
    const optionsRaw = iOpt >= 0 ? String(row[iOpt] ?? '').trim() : '';
    if (!question && !optionsRaw) {
      blankRows += 1;
      continue;
    }

    const options = parseFourOptions(iOpt >= 0 ? row[iOpt] : '');
    const result = iRes >= 0 ? parseLegacyResult(row[iRes], options) : { answer: '' };

    const rawNo = iNo >= 0 ? String(row[iNo] ?? '').trim() : '';
    const numericNo = Number(rawNo);
    const fallbackNo = i - loc.headerIndex;
    const questionNumber = Number.isInteger(numericNo) && numericNo >= 1 ? numericNo : fallbackNo;

    const rowNumber = i + 1;
    if (result.warning) warnings.push({ row: rowNumber, questionNumber, message: result.warning });

    parsed.push({
      questionNumber,
      question,
      'options.A': options.A ?? '',
      'options.B': options.B ?? '',
      'options.C': options.C ?? '',
      'options.D': options.D ?? '',
      correctAnswer: result.answer.toUpperCase(),
      _rowNumber: rowNumber,
    });
  }

  return { rows: parsed, warnings };
}

function buildResult(
  rows: unknown[][],
  headerIndex: number,
  collected: CollectedRows,
  format: 'new' | 'legacy-ipl',
): QuestionImportResult {
  if (collected.rows.length === 0) {
    if (rows.length - headerIndex - 1 <= 0) {
      throw new Error(
        `Question headers were found (row ${headerIndex + 1}), but no question rows were present in the sheet.`,
      );
    }
    throw new Error(
      `${rows.length - headerIndex - 1} row(s) were found below the header but none could be parsed into valid questions. Check each row has a Question No and Question text.`,
    );
  }

  const result = validateRows(collected.rows);
  result.format = format;
  result.warnings = collected.warnings;
  return result;
}

/**
 * Parses an Excel worksheet into normalized question rows and validates each one.
 * Two layouts are supported:
 *  - NEW format: Question No | Question | Option A | Option B | Option C | Option D | Correct Answer
 *  - LEGACY IPL format: S.No | Question | Four Options (A)../B)../C)../D)..) | Result (e.g. "D) 2023")
 * The header row may appear anywhere within the first several rows.
 */
export function parseQuestionFile(buffer: Buffer): QuestionImportResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new Error('Unable to read the Excel workbook.');
  }
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('Unable to read the Excel workbook.');
  const sheet = workbook.Sheets[firstSheetName];

  const rows: unknown[][] = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  if (rows.length === 0) {
    throw new Error('Unable to read the Excel workbook.');
  }

  const located = findHeaderRow(rows);
  if (located) {
    return buildResult(rows, located.headerIndex, collectRows(rows, located.headerIndex, located.headerMap), 'new');
  }

  const legacy = findLegacyHeaderRow(rows);
  if (legacy) {
    return buildResult(rows, legacy.headerIndex, collectLegacyRows(rows, legacy), 'legacy-ipl');
  }

  throw new Error(`No supported question header format was found. ${requiredHeadersMessage(rows)}`);
}

export interface QuestionImportResult {
  totalRows: number;
  imported: number;
  rejected: number;
  format?: 'new' | 'legacy-ipl';
  warnings: Array<{ row: number; questionNumber: number | string; message: string }>;
  duplicateQuestionNumbers: string[];
  rows: Array<{ row: number; questionNumber: number | string; reason: string }>;
  validRows: ParsedRow[];
}

function validateRows(rows: Array<ParsedRow & { _rowNumber: number }>): QuestionImportResult {
  const result: QuestionImportResult = {
    totalRows: rows.length,
    imported: 0,
    rejected: 0,
    warnings: [],
    duplicateQuestionNumbers: [],
    rows: [],
    validRows: [],
  };

  const seen = new Set<number>();
  const valid: Array<ParsedRow & { _rowNumber: number }> = [];

  for (const row of rows) {
    const issues: string[] = [];
    if (!Number.isInteger(row.questionNumber) || row.questionNumber < 1) {
      issues.push('Question No must be a positive integer');
    }
    if (!row.question) issues.push('Question text is empty');
    (['A', 'B', 'C', 'D'] as const).forEach((k) => {
      if (!row[`options.${k}`]) issues.push(`Option ${k} is empty`);
    });
    if (!['A', 'B', 'C', 'D'].includes(row.correctAnswer)) {
      issues.push('Correct Answer must be A, B, C or D');
    }

    if (issues.length > 0) {
      result.rejected += 1;
      result.rows.push({ row: row._rowNumber, questionNumber: row.questionNumber || '-', reason: issues.join('; ') });
      continue;
    }

    if (seen.has(row.questionNumber)) {
      result.rejected += 1;
      result.duplicateQuestionNumbers.push(String(row.questionNumber));
      result.rows.push({
        row: row._rowNumber,
        questionNumber: row.questionNumber,
        reason: 'Duplicate Question No within the file',
      });
      continue;
    }
    seen.add(row.questionNumber);
    valid.push(row);
  }

  result.imported = valid.length;
  result.duplicateQuestionNumbers = [...new Set(result.duplicateQuestionNumbers)];
  result.validRows = valid.map((v) => ({
    questionNumber: v.questionNumber,
    question: v.question,
    'options.A': v['options.A'],
    'options.B': v['options.B'],
    'options.C': v['options.C'],
    'options.D': v['options.D'],
    correctAnswer: v.correctAnswer,
  }));
  return result;
}

export interface ImportResult {
  imported: number;
  rejected: number;
  replacedExisting: boolean;
}

/**
 * Persists only the valid rows from a parsed question import result by
 * REPLACING the current question set. Existing questionNumbers are updated,
 * new numbers are inserted, old numbers not present in the new file are removed.
 */
export async function persistQuestionImport(parsed: QuestionImportResult): Promise<ImportResult> {
  if (parsed.validRows.length === 0) {
    return { imported: 0, rejected: parsed.rejected, replacedExisting: false };
  }

  const newNumbers = parsed.validRows.map((v) => v.questionNumber);

  const docs = parsed.validRows.map((v) => ({
    questionNumber: v.questionNumber,
    question: v.question,
    options: { A: v['options.A'], B: v['options.B'], C: v['options.C'], D: v['options.D'] },
    correctAnswer: v.correctAnswer as OptionKey,
    marks: 1,
    active: true,
  }));

  const existingDocCount = await Question.countDocuments();

  await Question.bulkWrite(
    docs.map((doc) => ({
      updateOne: {
        filter: { questionNumber: doc.questionNumber },
        update: { $set: doc },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  const deleteResult = await Question.deleteMany({ questionNumber: { $nin: newNumbers } });

  return {
    imported: docs.length,
    rejected: parsed.rejected,
    replacedExisting: existingDocCount > 0 || deleteResult.deletedCount > 0,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CANDIDATE EXCEL PARSER
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ParsedCandidateRow {
  row: number;
  uid: string;
  name: string;
  mobile: string;
  college: string;
  department: string;
}

const CANDIDATE_HEADER_ALIASES: Record<string, keyof Omit<ParsedCandidateRow, 'row'>> = {
  uid: 'uid',
  'candidate uid': 'uid',
  id: 'uid',
  name: 'name',
  'candidate name': 'name',
  mobile: 'mobile',
  'mobile no': 'mobile',
  phone: 'mobile',
  'phone number': 'mobile',
  college: 'college',
  'college name': 'college',
  institute: 'college',
  department: 'department',
  dept: 'department',
  branch: 'department',
};

const REQUIRED_CANDIDATE_HEADERS: Array<keyof Omit<ParsedCandidateRow, 'row'>> = [
  'uid',
  'name',
  'mobile',
  'college',
  'department',
];

const IGNORED_SHEET_NAMES = ['login reference', 'login references', 'credentials'];

function normalizeSheetName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Check if a sheet row contains all required candidate headers.
 * Returns the header map if found, null otherwise.
 */
function detectCandidateHeaders(
  rows: unknown[][],
): Array<keyof Omit<ParsedCandidateRow, 'row'>> | null {
  if (rows.length === 0) return null;

  const headerMap = rows[0].map((cell) => {
    const normalized = normalizeHeader(cell);
    return CANDIDATE_HEADER_ALIASES[normalized] ?? null;
  });

  const found = new Set(headerMap.filter(Boolean));
  if (REQUIRED_CANDIDATE_HEADERS.every((h) => found.has(h))) {
    return headerMap;
  }
  return null;
}

function readCandidateSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  startRow: number,
  headerMap: Array<keyof Omit<ParsedCandidateRow, 'row'>>,
): ParsedCandidateRow[] {
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  const rows: ParsedCandidateRow[] = [];
  for (let i = startRow; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const mapped: Partial<ParsedCandidateRow> = {};

    for (let col = 0; col < headerMap.length; col++) {
      const key = headerMap[col];
      if (key) {
        mapped[key] = String(raw[col] ?? '').trim();
      }
    }

    if (!mapped.uid && !mapped.name && !mapped.mobile) continue;
    if (!mapped.uid) continue;

    rows.push({
      row: i + 2,
      uid: String(mapped.uid ?? '').toUpperCase(),
      name: mapped.name ?? '',
      mobile: mapped.mobile ?? '',
      college: mapped.college ?? '',
      department: mapped.department ?? '',
    });
  }
  return rows;
}

/**
 * Parses a candidate Excel workbook.
 *
 * Sheet detection strategy:
 * 1. Look for a sheet named "Candidates" (case-insensitive).
 * 2. If not found, scan all sheets for the first one with the required headers.
 * 3. Sheets named "Login Reference" (or similar) are always skipped.
 *
 * Required headers (case-insensitive, trimmed): UID, Name, Mobile, College, Department.
 */
export function parseCandidateFile(buffer: Buffer): ParsedCandidateRow[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new Error('Unable to read the Excel workbook.');
  }

  if (!workbook.SheetNames.length) {
    throw new Error('Unable to read the Excel workbook.');
  }

  // Step 1: Look for "Candidates" sheet by name (case-insensitive)
  const candidatesSheetName = workbook.SheetNames.find(
    (name) => normalizeSheetName(name) === 'candidates',
  );

  if (candidatesSheetName) {
    const sheet = workbook.Sheets[candidatesSheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });
    const headerMap = detectCandidateHeaders(rawRows);
    if (headerMap) {
      return readCandidateSheet(workbook, candidatesSheetName, 1, headerMap);
    }
    // Sheet named "Candidates" exists but headers don't match — fall through to scan
  }

  // Step 2: Scan all sheets for one with candidate headers
  for (const sheetName of workbook.SheetNames) {
    const normalized = normalizeSheetName(sheetName);
    if (IGNORED_SHEET_NAMES.includes(normalized)) continue;

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });

    if (rawRows.length === 0) continue;

    const headerMap = detectCandidateHeaders(rawRows);
    if (headerMap) {
      return readCandidateSheet(workbook, sheetName, 1, headerMap);
    }
  }

  throw new Error(
    'Candidate sheet must contain UID, Name, Mobile, College and Department.',
  );
}

export function exportResultsToExcel<T extends Record<string, unknown>>(rows: T[]): Buffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Results');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
}
