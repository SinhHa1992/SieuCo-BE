import test from 'node:test';
import assert from 'node:assert/strict';
import { topContactsByDeals } from './contactDealAggregation.js';

test('topContactsByDeals ranks by deal count and caps', () => {
  const deals: Record<string, unknown>[] = [
    {
      linkedContacts: [
        { deviceContactId: 'a', displayName: 'A' },
        { deviceContactId: 'b', displayName: 'B' },
      ],
    },
    {
      linkedContacts: [{ deviceContactId: 'a', displayName: 'A' }],
    },
    {
      linkedContacts: [{ deviceContactId: 'a', displayName: 'A' }],
    },
    { linkedContacts: [{ deviceContactId: 'c', displayName: 'C' }] },
  ];
  const top = topContactsByDeals(deals, 3);
  assert.equal(top.length, 3);
  assert.equal(top[0]!.deviceContactId, 'a');
  assert.equal(top[0]!.dealCount, 3);
  assert.equal(top[0]!.fallbackDisplayName, 'A');
  assert.equal(top[1]!.deviceContactId, 'b');
  assert.equal(top[1]!.dealCount, 1);
  assert.equal(top[2]!.deviceContactId, 'c');
});

test('topContactsByDeals legacy contactDeviceId', () => {
  const deals: Record<string, unknown>[] = [
    { contactDeviceId: 'x', contactName: 'X' },
    { linkedContacts: [{ deviceContactId: 'x', displayName: '' }] },
  ];
  const top = topContactsByDeals(deals, 2);
  assert.equal(top[0]!.deviceContactId, 'x');
  assert.equal(top[0]!.dealCount, 2);
});

test('topContactsByDeals empty', () => {
  assert.deepEqual(topContactsByDeals([], 3), []);
  assert.deepEqual(topContactsByDeals([{ linkedContacts: [] }], 3), []);
});
