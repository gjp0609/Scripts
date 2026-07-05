import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  convertToUnixEpoch,
  convertToWindowsEpoch,
  convertTransitionToText,
  parseHtuLine,
  parseHtuTsv,
  serializeArchivedRows
} from '../src/htu/tsv.js';

test('converts HTU transition ids to text', () => {
  assert.equal(convertTransitionToText('0'), 'link');
  assert.equal(convertTransitionToText('8'), 'reload');
  assert.equal(convertTransitionToText('265'), 'keyword');
  assert.equal(convertTransitionToText('999'), 'unknown');
  assert.equal(convertTransitionToText('typed'), 'typed');
});

test('parses 4-column unix archived lines', () => {
  const parsed = parseHtuLine('https://example.test\tU1700000000123\t8\tExample title\r\n');
  assert.equal(parsed.error, null);
  assert.equal(parsed.fileType, '4col_unix');
  assert.equal(parsed.url, 'https://example.test');
  assert.equal(parsed.visitTime, 1700000000123);
  assert.equal(parsed.transition, 'reload');
  assert.equal(parsed.title, 'Example title');
});

test('parses 3-column windows epoch archived lines', () => {
  const unixTime = 1700000000123;
  const windowsTime = convertToWindowsEpoch(unixTime);
  const parsed = parseHtuLine(`https://example.test\t${windowsTime}\t0\r\n`);
  assert.equal(parsed.error, null);
  assert.equal(parsed.fileType, '3col_win');
  assert.equal(parsed.visitTime, unixTime);
  assert.equal(parsed.transition, 'link');
  assert.equal(parsed.title, null);
});

test('parses 8-column analysis lines', () => {
  const parsed = parseHtuLine(
    'https://example.test\twww.example.test\texample.test\t1700000000123\t2023-11-15 06:13:20\t3\ttyped\tTitle\r\n'
  );
  assert.equal(parsed.error, null);
  assert.equal(parsed.fileType, '8col');
  assert.equal(parsed.visitTime, 1700000000123);
  assert.equal(parsed.transition, 'typed');
  assert.equal(parsed.title, 'Title');
});

test('preserves HTU archived bytes for compatible rows', () => {
  const source = [
    'https://a.example\tU1700000000123\t0\tA',
    'https://b.example\tU1700000000456\t8\t',
    ''
  ].join('\r\n');
  const parsed = parseHtuTsv(source);
  assert.deepEqual(parsed.errors, []);
  assert.equal(serializeArchivedRows(parsed.rows), source);
});

test('reports HTU-style parse errors', () => {
  assert.equal(parseHtuLine('https://example.test\tU1\t0').error, 'MISSING_LINEBREAK');
  assert.equal(parseHtuLine('https://example.test\tU1\r\n').error, 'WRONG_COLUMN_COUNT');
  assert.equal(parseHtuLine('\tU1\t0\r\n').error, 'INVALID_FIELD');
});

test('round-trips external HTU backup when HISTORIES_HTU_BACKUP is set', async (t) => {
  const backupPath = process.env.HISTORIES_HTU_BACKUP;
  if (!backupPath) {
    t.skip('HISTORIES_HTU_BACKUP is not set');
    return;
  }

  const sourceBuffer = await readFile(backupPath);
  const source = sourceBuffer.toString('utf8');
  const parsed = parseHtuTsv(source);
  assert.equal(parsed.errors.length, 0);
  const serialized = serializeArchivedRows(parsed.rows);
  assert.equal(sha256(serialized), sha256(sourceBuffer));
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
