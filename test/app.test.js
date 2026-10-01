import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransactionStore, emptyFilters, filterTransactions, hasActiveFilters, resetFilters } from '../src/app.js';

const data = [
  { id: 1, date: '2024-01-03', description: 'Coffee Shop', category: 'Food', amount: -4 },
  { id: 2, date: '2024-01-02', description: 'Bus pass', category: 'Transport', amount: -20 },
  { id: 3, date: '2024-01-01', description: 'Salary', category: 'Income', amount: 1000 },
  { id: 4, date: '2023-12-30', description: 'Book store', category: 'Shopping', amount: -12 },
  { id: 5, date: '2023-12-29', description: 'Dinner', category: 'Food', amount: -30 },
  { id: 6, date: '2023-12-28', description: 'Taxi', category: 'Transport', amount: -18 }
];

test('filters by keyword, category, and inclusive date range', () => {
  assert.deepEqual(filterTransactions(data, { keyword: 'coffee', category: 'Food', from: '2024-01-01', to: '2024-01-03' }).map((item) => item.id), [1]);
  assert.deepEqual(filterTransactions(data, { ...emptyFilters, category: 'Transport' }).map((item) => item.id), [2, 6]);
});

test('reset clears every filter and returns to page one', () => {
  const result = resetFilters({ keyword: 'book', category: 'Shopping', from: '2023-12-01', to: '2024-01-01' }, 3);
  assert.deepEqual(result.filters, emptyFilters);
  assert.equal(result.page, 1);
  assert.equal(result.changed, true);
});

test('reset is a no-op when no filters are active on the first page', () => {
  const filters = { ...emptyFilters };
  const result = resetFilters(filters);
  assert.equal(result.changed, false);
  assert.equal(result.filters, filters);
  assert.equal(hasActiveFilters(filters), false);
});

test('store restores all transactions and pagination after reset', () => {
  const store = createTransactionStore(data);
  store.setPage(2);
  assert.equal(store.getVisibleTransactions().items.length, 1);
  store.setFilters({ keyword: 'taxi' });
  assert.equal(store.getVisibleTransactions().total, 1);
  store.reset();
  assert.equal(store.getState().page, 1);
  assert.equal(store.getVisibleTransactions().total, data.length);
});

test('store prevents stale responses from being accepted after reset', () => {
  const store = createTransactionStore(data);
  const staleRequest = store.beginRequest();
  store.setFilters({ keyword: 'coffee' });
  const resetRequest = store.beginRequest();
  store.reset();
  assert.equal(store.acceptResponse(staleRequest), false);
  assert.equal(store.acceptResponse(resetRequest), false);
});

test('repeated reset does not advance request state', () => {
  const store = createTransactionStore(data);
  const before = store.getState();
  store.reset();
  assert.equal(store.getState().requestId, before.requestId);
});
