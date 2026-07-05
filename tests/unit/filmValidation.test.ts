import { describe, expect, it } from 'vitest';
import {
  isFilmFormat,
  isFilmRollStatus,
  parseDriveFolderId,
  toNonNegativeInteger,
  toNonNegativeNumber,
  toNullableText,
  toPositiveInteger,
} from '@/lib/film/validation';

describe('film validation helpers', () => {
  it('validates film status and format values', () => {
    expect(isFilmRollStatus('PROCESSED')).toBe(true);
    expect(isFilmRollStatus('DONE')).toBe(false);
    expect(isFilmFormat('35mm')).toBe(true);
    expect(isFilmFormat('digital')).toBe(false);
  });

  it('normalizes numeric and text form values', () => {
    expect(toNullableText('  lab  ')).toBe('lab');
    expect(toNullableText('   ')).toBeNull();
    expect(toNonNegativeNumber('-5', 12)).toBe(12);
    expect(toPositiveInteger('400.9')).toBe(400);
    expect(toNonNegativeInteger('36.9')).toBe(36);
  });

  it('extracts Google Drive folder ids from supported inputs', () => {
    expect(parseDriveFolderId('https://drive.google.com/drive/folders/folder_123')).toBe('folder_123');
    expect(parseDriveFolderId('https://drive.google.com/open?id=folder_456')).toBe('folder_456');
    expect(parseDriveFolderId('raw-folder')).toBe('raw-folder');
  });
});
