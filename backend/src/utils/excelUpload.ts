import path from 'path';

export const EXCEL_EXTENSIONS: readonly string[] = ['.xlsx', '.xls'];

export interface ExcelUploadCandidate {
  originalname?: string;
  mimetype?: string;
}

/**
 * Validates that the uploaded file has an Excel-compatible extension.
 *
 * MIME types are unreliable — browsers may send application/octet-stream or
 * application/zip for genuine .xlsx files.  The final arbiter is whether
 * XLSX.read() can parse the buffer, which happens downstream.
 */
export function isValidExcelUpload(file?: ExcelUploadCandidate | null): boolean {
  if (!file) return false;
  const extension = path.extname(file.originalname ?? '').toLowerCase();
  return EXCEL_EXTENSIONS.includes(extension);
}
