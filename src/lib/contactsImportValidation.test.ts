import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeContactRow } from './contactsImportValidation.js';

test('sanitizeContactRow rejects missing id', () => {
  assert.equal(sanitizeContactRow({ displayName: 'A' }), null);
});

test('sanitizeContactRow fills default name', () => {
  const r = sanitizeContactRow({ deviceContactId: 'x', displayName: '' });
  assert.ok(r);
  assert.equal(r!.displayName, 'Không tên');
});

test('sanitizeContactRow trims lists', () => {
  const r = sanitizeContactRow({
    deviceContactId: 'id1',
    displayName: '  Bob  ',
    phones: [' +1 ', ''],
    emails: ['a@b.co'],
  });
  assert.ok(r);
  assert.equal(r!.displayName, 'Bob');
  assert.equal(r!.jobTitle, '');
  assert.equal(r!.company, '');
  assert.equal(r!.gender, '');
  assert.deepEqual(r!.phones, ['+1']);
  assert.deepEqual(r!.emails, ['a@b.co']);
});

test('sanitizeContactRow job title and company', () => {
  const r = sanitizeContactRow({
    deviceContactId: 'id2',
    displayName: 'Ann',
    jobTitle: '  Engineer  ',
    company: ' Acme ',
  });
  assert.ok(r);
  assert.equal(r!.jobTitle, 'Engineer');
  assert.equal(r!.company, 'Acme');
});

test('sanitizeContactRow gender male female only', () => {
  const m = sanitizeContactRow({
    deviceContactId: 'g1',
    displayName: 'X',
    gender: 'male',
  });
  assert.ok(m);
  assert.equal(m!.gender, 'male');
  const f = sanitizeContactRow({
    deviceContactId: 'g2',
    displayName: 'Y',
    gender: 'FEMALE',
  });
  assert.ok(f);
  assert.equal(f!.gender, 'female');
  const z = sanitizeContactRow({
    deviceContactId: 'g3',
    displayName: 'Z',
    gender: 'other',
  });
  assert.ok(z);
  assert.equal(z!.gender, '');
});
