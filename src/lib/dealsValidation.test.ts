import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDealStatus, sanitizeContactDeviceIds } from './dealsValidation.js';

test('normalizeDealStatus defaults invalid', () => {
  assert.equal(normalizeDealStatus('x'), 'follow');
  assert.equal(normalizeDealStatus(null), 'follow');
});

test('normalizeDealStatus accepts allowed', () => {
  assert.equal(normalizeDealStatus('closed'), 'closed');
  assert.equal(normalizeDealStatus('PROPOSAL'), 'proposal');
});

test('sanitizeContactDeviceIds dedupes and skips empty', () => {
  assert.deepEqual(sanitizeContactDeviceIds(null), []);
  assert.deepEqual(sanitizeContactDeviceIds(['a', 'a', ' b ', '', 'b']), ['a', 'b']);
});
