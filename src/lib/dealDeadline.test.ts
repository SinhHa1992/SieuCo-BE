import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimelineToDays,
  getDealDeadline,
  differenceInDays,
} from './dealDeadline.js';

test('parseTimelineToDays Vietnamese', () => {
  assert.equal(parseTimelineToDays('3 tháng'), 90);
  assert.equal(parseTimelineToDays('2 tuần'), 14);
  assert.equal(parseTimelineToDays('10 ngày'), 10);
  assert.equal(parseTimelineToDays(' 1 NGÀY '), 1);
});

test('parseTimelineToDays English', () => {
  assert.equal(parseTimelineToDays('2 months'), 60);
  assert.equal(parseTimelineToDays('1 week'), 7);
  assert.equal(parseTimelineToDays('5 day'), 5);
});

test('parseTimelineToDays rejects', () => {
  assert.equal(parseTimelineToDays(''), null);
  assert.equal(parseTimelineToDays('soon'), null);
  assert.equal(parseTimelineToDays('3 năm'), null);
});

test('getDealDeadline adds24h blocks', () => {
  const start = new Date('2025-01-01T12:00:00.000Z');
  const d = getDealDeadline(start, '2 ngày');
  assert.ok(d);
  assert.equal(d!.toISOString(), '2025-01-03T12:00:00.000Z');
});

test('differenceInDays matches Dart-style truncation', () => {
  const a = new Date('2025-01-01T00:00:00.000Z');
  const b = new Date('2025-01-06T12:00:00.000Z');
  assert.equal(differenceInDays(a, b), 5);
  assert.equal(differenceInDays(b, a), -5);
});
