import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { parseQuestionFile, parseCandidateFile, persistQuestionImport } from '../src/services/excelService';
import { Question } from '../src/models/Question';

function makeQuestionBuffer(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Q');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
}

const header = ['Question No', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer'];

async function seedOld(rows: Array<{ questionNumber: number; question: string }>) {
  await Question.insertMany(
    rows.map((r) => ({
      questionNumber: r.questionNumber,
      question: r.question,
      options: { A: 'a', B: 'b', C: 'c', D: 'd' },
      correctAnswer: 'A',
      marks: 1,
      active: true,
    })),
  );
}

describe('Question Excel import', () => {
  beforeEach(async () => {
    await Question.deleteMany({});
  });

  it('parses a valid file', () => {
    const buffer = makeQuestionBuffer([
      header,
      [1, 'Which protocol is used for web browsing?', 'FTP', 'HTTP', 'SMTP', 'SSH', 'B'],
      [2, 'Which device forwards packets between networks?', 'Hub', 'Switch', 'Router', 'Repeater', 'C'],
    ]);
    const result = parseQuestionFile(buffer);
    expect(result.validRows).toHaveLength(2);
    expect(result.rejected).toBe(0);
  });

  it('rejects duplicate question numbers within a file', () => {
    const buffer = makeQuestionBuffer([
      header,
      [1, 'Q1', 'a', 'b', 'c', 'd', 'A'],
      [1, 'Q1 dup', 'a', 'b', 'c', 'd', 'B'],
      [2, 'Q2', 'a', 'b', 'c', 'd', 'A'],
    ]);
    const result = parseQuestionFile(buffer);
    expect(result.rejected).toBe(1);
    expect(result.duplicateQuestionNumbers).toEqual(['1']);
    expect(result.validRows.map((r) => r.questionNumber)).toEqual([1, 2]);
  });

  it('rejects invalid rows (bad answer key, missing options)', () => {
    const buffer = makeQuestionBuffer([
      header,
      [1, 'Q1', 'a', 'b', 'c', 'd', 'X'],
      [2, '', 'a', 'b', '', 'd', 'A'],
    ]);
    const result = parseQuestionFile(buffer);
    expect(result.validRows).toHaveLength(0);
    expect(result.rejected).toBe(2);
  });

  it('throws for an invalid file', () => {
    expect(() => parseQuestionFile(Buffer.from('not an excel file'))).toThrow();
  });

  it('throws when the file contains no question rows (header only)', () => {
    expect(() => parseQuestionFile(makeQuestionBuffer([header]))).toThrow(/no question rows/i);
  });

  it('throws a diagnostic error when the sheet has zero parsed rows', () => {
    const wbEmpty = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbEmpty, XLSX.utils.aoa_to_sheet([]), 'Empty');
    const buffer = XLSX.write(wbEmpty, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
    expect(() => parseQuestionFile(buffer)).toThrow(/Unable to read the Excel workbook/i);
  });

  it('reports missing required headers when no header row matches', () => {
    const buffer = makeQuestionBuffer([
      ['Qno', 'Stem', 'Opt1', 'Opt2', 'Opt3', 'Opt4', 'Ans'],
      [1, 'Which protocol is used for web browsing?', 'FTP', 'HTTP', 'SMTP', 'SSH', 'B'],
    ]);
    expect(() => parseQuestionFile(buffer)).toThrow(/missing required headers/i);
  });

  it('locates a header row that is not on row 1 (title row above)', () => {
    const buffer = makeQuestionBuffer([
      ['SWAP 2K26 – Network Devices Question Bank'],
      [],
      header,
      [1, 'Which protocol is used for web browsing?', 'FTP', 'HTTP', 'SMTP', 'SSH', 'B'],
      [2, 'Which device forwards packets between networks?', 'Hub', 'Switch', 'Router', 'Repeater', 'C'],
    ]);
    const result = parseQuestionFile(buffer);
    expect(result.validRows).toHaveLength(2);
    expect(result.rejected).toBe(0);
    expect(result.validRows[0].questionNumber).toBe(1);
    expect(result.validRows[1].questionNumber).toBe(2);
  });

  it('handles cased and whitespace-variant headers using aliases', () => {
    const buffer = makeQuestionBuffer([
      ['  Question no ', 'QUESTION', ' option a ', 'Option B', 'option c', ' OPTION D', 'Correct Answer '],
      [1, 'Q1', 'a', 'b', 'c', 'd', 'b'],
    ]);
    const result = parseQuestionFile(buffer);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].correctAnswer).toBe('B');
  });

  it('parses a 30-row file fully', () => {
    const dataRows = Array.from({ length: 30 }, (_, i) => [
      i + 1,
      `Network question ${i + 1}`,
      'a',
      'b',
      'c',
      'd',
      String.fromCharCode(65 + (i % 4)),
    ]);
    const buffer = makeQuestionBuffer([header, ...dataRows]);
    const result = parseQuestionFile(buffer);
    expect(result.validRows).toHaveLength(30);
    expect(result.rejected).toBe(0);
    expect(result.imported).toBe(30);
  });

  it('works regardless of worksheet name', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      header,
      [1, 'Q1', 'a', 'b', 'c', 'd', 'A'],
      [2, 'Q2', 'a', 'b', 'c', 'd', 'B'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Test Data');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
    const result = parseQuestionFile(buffer);
    expect(result.validRows).toHaveLength(2);
  });

  it('replaces the current question set on a valid import', async () => {
    await seedOld([
      { questionNumber: 1, question: 'OLD QUESTION A' },
      { questionNumber: 2, question: 'OLD QUESTION B' },
    ]);
    const parsed = parseQuestionFile(
      makeQuestionBuffer([
        header,
        [1, 'NEW QUESTION A', 'a', 'b', 'c', 'd', 'A'],
        [2, 'NEW QUESTION B', 'a', 'b', 'c', 'd', 'B'],
        [3, 'NEW QUESTION C', 'a', 'b', 'c', 'd', 'C'],
      ]),
    );
    const outcome = await persistQuestionImport(parsed);

    expect(outcome.imported).toBe(3);
    expect(outcome.rejected).toBe(0);
    expect(outcome.replacedExisting).toBe(true);
    expect(await Question.countDocuments()).toBe(3);
    const q1 = await Question.findOne({ questionNumber: 1 });
    const q2 = await Question.findOne({ questionNumber: 2 });
    const q3 = await Question.findOne({ questionNumber: 3 });
    expect(q1?.question).toBe('NEW QUESTION A');
    expect(q2?.question).toBe('NEW QUESTION B');
    expect(q3?.question).toBe('NEW QUESTION C');
    await expect(Question.findOne({ question: 'OLD QUESTION A' })).resolves.toBeNull();
  });

  it('does not touch the database when no valid rows exist', async () => {
    await seedOld(Array.from({ length: 30 }, (_, i) => ({ questionNumber: i + 1, question: `OLD ${i + 1}` })));
    const parsed = parseQuestionFile(
      makeQuestionBuffer([header, [1, 'Q1', 'a', 'b', 'c', 'd', 'Z'], [2, '', 'a', '', 'c', 'd', 'A']]),
    );
    expect(parsed.validRows).toHaveLength(0);

    const outcome = await persistQuestionImport(parsed);
    expect(outcome.imported).toBe(0);
    expect(outcome.replacedExisting).toBe(false);
    expect(await Question.countDocuments()).toBe(30);
    expect(await Question.findOne({ questionNumber: 1 })).toMatchObject({ question: 'OLD 1' });
  });

  it('shrinks the collection to the new file size (100 -> 30)', async () => {
    await seedOld(Array.from({ length: 100 }, (_, i) => ({ questionNumber: i + 1, question: `OLD ${i + 1}` })));
    const parsed = parseQuestionFile(
      makeQuestionBuffer([
        header,
        ...Array.from({ length: 30 }, (_, i) => [i + 1, `NEW ${i + 1}`, 'a', 'b', 'c', 'd', 'A'] as unknown[]),
      ]),
    );
    const outcome = await persistQuestionImport(parsed);
    expect(outcome.imported).toBe(30);
    expect(outcome.replacedExisting).toBe(true);
    expect(await Question.countDocuments()).toBe(30);
    await expect(Question.findOne({ questionNumber: 31 })).resolves.toBeNull();
  });
});

describe('Legacy IPL Excel format', () => {
  const legacy = [
    ['IPL QUIZ - MULTIPLE CHOICE QUESTIONS'],
    [''],
    ['S.No', 'Question', 'Four Options', 'Result'],
  ];

  it('detects the legacy IPL format and converts merged options + result', () => {
    const buffer = makeQuestionBuffer([
      ...legacy,
      [1, 'In which IPL Season was the Impact Player rule introduced?', 'A) 2024\nB) 2022\nC) 2021\nD) 2023', 'D) 2023'],
      [2, 'Who holds the orange cap record?', 'A) Virat Kohli\nB) KL Rahul\nC) David Warner\nD) Ruturaj Gaikwad', 'B) KL Rahul'],
    ]);
    const result = parseQuestionFile(buffer);
    expect(result.format).toBe('legacy-ipl');
    expect(result.rejected).toBe(0);
    expect(result.imported).toBe(2);
    expect(result.validRows).toHaveLength(2);
    expect(result.validRows[0]).toMatchObject({
      questionNumber: 1,
      'options.A': '2024',
      'options.B': '2022',
      'options.C': '2021',
      'options.D': '2023',
      correctAnswer: 'D',
    });
    expect(result.validRows[1].correctAnswer).toBe('B');
  });

  it('auto-corrects a stale result letter when the answer text matches an option', () => {
    const buffer = makeQuestionBuffer([
      ...legacy,
      [1, 'Which team won?', 'A) Chennai Super Kings\nB) Rajasthan Royals\nC) Punjab Kings\nD) Mumbai Indians', 'A) Punjab Kings'],
    ]);
    const result = parseQuestionFile(buffer);
    expect(result.imported).toBe(1);
    expect(result.validRows[0].correctAnswer).toBe('C');
    expect(result.warnings).toHaveLength(0);
  });

  it('retains the result letter and flags the row for review when no option matches', () => {
    const buffer = makeQuestionBuffer([
      ...legacy,
      [1, 'Which team won?', 'A) Alpha\nB) Beta\nC) Gamma\nD) Delta', 'A) Zeta'],
    ]);
    const result = parseQuestionFile(buffer);
    expect(result.imported).toBe(1);
    expect(result.validRows[0].correctAnswer).toBe('A');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toMatch(/retained for admin review/i);
  });

  it('tolerates CRLF newlines inside the Four Options cell', () => {
    const buffer = makeQuestionBuffer([
      ...legacy,
      [7, 'Q', 'A) 1\r\nB) 2\r\nC) 3\r\nD) 4', 'C) 3'],
    ]);
    const result = parseQuestionFile(buffer);
    expect(result.format).toBe('legacy-ipl');
    expect(result.validRows[0].questionNumber).toBe(7);
    expect(result.validRows[0].correctAnswer).toBe('C');
  });
});

describe('Candidate Excel import', () => {
  it('parses candidate rows with header aliases', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['UID', 'Name', 'Mobile', 'College', 'Department'],
      ['SWAP2K260010', 'Alice', '9123456789', 'A College', 'CS'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'C');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
    const rows = parseCandidateFile(buffer);
    expect(rows[0].uid).toBe('SWAP2K260010');
    expect(rows[0].mobile).toBe('9123456789');
  });

  it('prefers a sheet named Candidates over other sheets', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['UID', 'Name', 'Mobile', 'College', 'Department'],
        ['SWAP2K260100', 'From Candidates Sheet', '9123456789', 'C', 'D'],
      ]),
      'Candidates',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['UID', 'Name', 'Mobile', 'College', 'Department'],
        ['SWAP2K260200', 'From Other Sheet', '9223456789', 'C', 'D'],
      ]),
      'Some Other Sheet',
    );
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
    const rows = parseCandidateFile(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0].uid).toBe('SWAP2K260100');
  });

  it('ignores the Login Reference sheet entirely', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['UID', 'Name', 'Mobile', 'College', 'Department'],
        ['SWAP2K260001', 'Aaban', '9000000001', 'Jamal Mohamed College', 'MCA'],
        ['SWAP2K260002', 'Aadhav', '9000000002', 'Bishop Heber College', 'BCA'],
      ]),
      'Candidates',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['UID', 'Name', 'Expected Password'],
        ['SWAP2K269999', 'Login Sheet Row', 'Jmc9999'],
      ]),
      'Login Reference',
    );
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
    const rows = parseCandidateFile(buffer);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.uid)).toEqual(['SWAP2K260001', 'SWAP2K260002']);
    expect(rows.some((r) => r.uid === 'SWAP2K269999')).toBe(false);
  });

  it('falls back to scanning all sheets when no Candidates sheet exists', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([['Not', 'a', 'candidate', 'sheet']]),
      'Cover',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['UID', 'Name', 'Mobile', 'College', 'Department'],
        ['SWAP2K260059', 'Found In Second Sheet', '9123456789', 'C', 'D'],
      ]),
      'Participants',
    );
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
    const rows = parseCandidateFile(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0].uid).toBe('SWAP2K260059');
  });

  it('throws a clear error when no sheet has candidate headers', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['UID', 'Name', 'Expected Password'],
        ['SWAP2K260001', 'Aaban', 'Jmc0001'],
      ]),
      'Login Reference',
    );
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
    expect(() => parseCandidateFile(buffer)).toThrow(
      'Candidate sheet must contain UID, Name, Mobile, College and Department.',
    );
  });

  it('normalizes UIDs to uppercase', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['UID', 'Name', 'Mobile', 'College', 'Department'],
      ['swap2k260001', 'Aaban', '9000000001', 'C', 'D'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
    const rows = parseCandidateFile(buffer);
    expect(rows[0].uid).toBe('SWAP2K260001');
  });

  it('handles whitespace-variant headers', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['  UID ', ' name ', ' Mobile ', ' College ', ' Department '],
      ['SWAP2K260025', 'Aadhav', '9000000002', 'Bishop Heber College', 'BCA'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
    const rows = parseCandidateFile(buffer);
    expect(rows[0].uid).toBe('SWAP2K260025');
  });
});