import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTransactionRepository,
  createTransactionStore,
  emptyFilters,
  filterTransactions,
  hasActiveFilters,
  resetFilters
} from '../src/app.js';

const data = [
  { id: 1, date: '2024-01-03', description: 'Coffee Shop', category: 'Food', amount: -4 },
  { id: 2, date: '2024-01-02', description: 'Bus pass', category: 'Transport', amount: -20 },
  { id: 3, date: '2024-01-01', description: 'Salary', category: 'Income', amount: 1000 },
  { id: 4, date: '2023-12-30', description: 'Book store', category: 'Shopping', amount: -12 },
  { id: 5, date: '2023-12-29', description: 'Dinner', category: 'Food', amount: -30 },
  { id: 6, date: '2023-12-28', description: 'Taxi', category: 'Transport', amount: -18 }
];

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

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

test('repository persists history by user and restores it on a new visit', () => {
  const storage = createMemoryStorage();
  const firstVisit = createTransactionRepository({ storage, userId: 'user-a', initialTransactions: data });
  const otherUser = createTransactionRepository({ storage, userId: 'user-b' });

  assert.equal(firstVisit.list().length, data.length);
  firstVisit.save({ id: 7, date: '2024-01-04', description: 'Lunch', category: 'Food', amount: -15, status: 'posted' });

  const nextVisit = createTransactionRepository({ storage, userId: 'user-a' });
  assert.equal(nextVisit.list().length, data.length + 1);
  assert.equal(nextVisit.list()[0].id, 7);
  assert.deepEqual(otherUser.list(), []);
});

test('repository upserts repeated transactions and updates supported details', () => {
  const repository = createTransactionRepository({ storage: createMemoryStorage(), userId: 'user-a', initialTransactions: data });
  repository.save({ id: 1, date: '2024-01-03', description: 'Coffee Shop', category: 'Food', amount: -4, status: 'pending' });
  repository.update(1, { status: 'posted' });

  const saved = repository.list().filter((item) => item.id === 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, 'posted');
  assert.equal(saved[0].description, 'Coffee Shop');
});

test('repository paginates in date order and clamps out-of-range pages', () => {
  const repository = createTransactionRepository({ storage: createMemoryStorage(), userId: 'user-a', initialTransactions: data });
  const firstPage = repository.getPage(1, 2);
  const lastPage = repository.getPage(99, 2);

  assert.deepEqual(firstPage.items.map((item) => item.id), [1, 2]);
  assert.deepEqual(lastPage.items.map((item) => item.id), [5, 6]);
  assert.equal(lastPage.page, 3);
  assert.equal(lastPage.pages, 3);
});

test('repository ignores malformed records and supports removal', () => {
  const storage = createMemoryStorage();
  const repository = createTransactionRepository({ storage, userId: 'user-a', initialTransactions: data });
  repository.save({ id: 7, date: '2024-01-04', description: 'Lunch', category: 'Food', amount: -15 });
  storage.setItem('transaction-history:user-a', JSON.stringify([...data, { id: 8, amount: 'invalid' }]));

  assert.equal(repository.list().length, data.length);
  assert.equal(repository.remove(1), true);
  assert.equal(repository.remove(999), false);
  assert.equal(repository.list().some((item) => item.id === 1), false);
});

test('repository rejects invalid transactions and surfaces corrupted storage', () => {
  const storage = createMemoryStorage();
  const repository = createTransactionRepository({ storage, userId: 'user-a' });
  assert.throws(() => repository.save({ id: 1, amount: 'not a number' }), /valid history details/);

  storage.setItem('transaction-history:user-a', '{invalid json');
  assert.throws(() => repository.list(), /could not be loaded/);
});
