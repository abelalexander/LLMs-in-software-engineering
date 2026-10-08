import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createTransactionRepository,
  createTransactionStore,
  emptyFilters,
  filterTransactions,
  hasActiveFilters,
  mountTransactionHistory,
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

function createHistoryDocument(storage = createMemoryStorage()) {
  const selectors = [
    'main',
    '#transaction-form',
    '#transaction-date',
    '#transaction-description',
    '#transaction-category',
    '#transaction-amount',
    '#keyword-filter',
    '#category-filter',
    '#from-filter',
    '#to-filter',
    '#reset-filters',
    '#transaction-list',
    '#results-count',
    '#status-message',
    '#page-label',
    '#previous-page',
    '#next-page',
    '#retry-history'
  ];
  const elements = new Map(selectors.map((selector) => [selector, {
    children: [],
    dataset: selector === 'main' ? { userId: 'test-user' } : {},
    listeners: {},
    value: '',
    append(child) {
      this.children.push(child);
    },
    addEventListener(event, listener) {
      this.listeners[event] = listener;
    },
    click() {
      this.listeners.click();
    },
    focus() {},
    replaceChildren(...children) {
      this.children = children;
    }
  }]));
  return {
    document: {
      defaultView: { localStorage: storage },
      querySelector(selector) {
        return elements.get(selector);
      },
      createElement() {
        return {
          children: [],
          append(child) {
            this.children.push(child);
          }
        };
      }
    },
    elements,
    storage
  };
}

test('filters by keyword, category, and inclusive date range', () => {
  assert.deepEqual(filterTransactions(data, { keyword: 'coffee', category: 'Food', from: '2024-01-01', to: '2024-01-03' }).map((item) => item.id), [1]);
  assert.deepEqual(filterTransactions(data, { ...emptyFilters, category: 'Transport' }).map((item) => item.id), [2, 6]);
});

test('category control lists unique history categories and filters visible transactions', () => {
  const { document, elements } = createHistoryDocument();
  mountTransactionHistory(document, data);

  const category = elements.get('#category-filter');
  assert.deepEqual(category.children.map((option) => option.textContent), [
    'All categories',
    'Food',
    'Income',
    'Shopping',
    'Transport'
  ]);

  elements.get('#next-page').click();
  assert.equal(elements.get('#page-label').textContent, 'Page 2 of 2');
  category.value = 'Food';
  category.listeners.input();

  assert.equal(elements.get('#results-count').textContent, '2 transactions');
  assert.deepEqual(elements.get('#transaction-list').children.map((row) => row.children[2].textContent), ['Food', 'Food']);
  assert.equal(elements.get('#page-label').textContent, 'Page 1 of 1');
});

test('category filter combines with other filters and clear restores all transactions', () => {
  const { document, elements } = createHistoryDocument();
  mountTransactionHistory(document, data);

  const category = elements.get('#category-filter');
  const keyword = elements.get('#keyword-filter');
  category.value = 'Food';
  keyword.value = 'coffee';
  category.listeners.input();
  keyword.listeners.input();

  assert.equal(elements.get('#results-count').textContent, '1 transaction');
  assert.equal(elements.get('#transaction-list').children[0].children[1].textContent, 'Coffee Shop');

  keyword.value = 'not found';
  keyword.listeners.input();
  assert.equal(elements.get('#results-count').textContent, '0 transactions');
  assert.equal(elements.get('#status-message').textContent, 'No transactions match these filters.');

  elements.get('#reset-filters').click();
  assert.equal(category.value, '');
  assert.equal(keyword.value, '');
  assert.equal(elements.get('#results-count').textContent, `${data.length} transactions`);
  assert.equal(elements.get('#transaction-list').children.length, 5);
  assert.equal(elements.get('#page-label').textContent, 'Page 1 of 2');
});

test('transaction history page provides a transaction entry form', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /<form\b[^>]*id="transaction-form"/);
  for (const field of ['date', 'description', 'category', 'amount']) {
    assert.match(html, new RegExp(`id="transaction-${field}"`));
  }
  assert.match(html, /<button\b[^>]*type="submit"/);
});

test('submitting a valid transaction saves and displays it immediately', () => {
  const { document, elements, storage } = createHistoryDocument();
  mountTransactionHistory(document, data);
  const fields = {
    '#transaction-date': '2024-01-04',
    '#transaction-description': 'Lunch',
    '#transaction-category': 'Food',
    '#transaction-amount': '-15.5'
  };
  Object.entries(fields).forEach(([selector, value]) => {
    elements.get(selector).value = value;
  });
  let prevented = false;
  const form = elements.get('#transaction-form');
  assert.equal(typeof form.listeners.submit, 'function');
  form.listeners.submit({
    preventDefault() {
      prevented = true;
    }
  });

  const saved = JSON.parse(storage.getItem('transaction-history:test-user'));
  assert.equal(prevented, true);
  assert.equal(saved.length, data.length + 1);
  assert.deepEqual(
    Object.fromEntries(['date', 'description', 'category'].map((key) => [key, saved[0][key]])),
    { date: '2024-01-04', description: 'Lunch', category: 'Food' }
  );
  assert.equal(saved[0].amount, -15.5);
  assert.equal(elements.get('#results-count').textContent, `${data.length + 1} transactions`);
  assert.equal(elements.get('#transaction-list').children[0].children[1].textContent, 'Lunch');
});

test('new transactions remain visible after the page is reloaded', () => {
  const storage = createMemoryStorage();
  const firstPage = createHistoryDocument(storage);
  mountTransactionHistory(firstPage.document, data);
  firstPage.elements.get('#transaction-date').value = '2024-01-04';
  firstPage.elements.get('#transaction-description').value = 'Lunch';
  firstPage.elements.get('#transaction-category').value = 'Food';
  firstPage.elements.get('#transaction-amount').value = '-15';
  const form = firstPage.elements.get('#transaction-form');
  assert.equal(typeof form.listeners.submit, 'function');
  form.listeners.submit({ preventDefault() {} });

  const nextPage = createHistoryDocument(storage);
  mountTransactionHistory(nextPage.document, data);
  assert.equal(nextPage.elements.get('#results-count').textContent, `${data.length + 1} transactions`);
  assert.equal(nextPage.elements.get('#transaction-list').children[0].children[1].textContent, 'Lunch');
});

test('invalid transaction input shows an error and does not save history', () => {
  const { document, elements, storage } = createHistoryDocument();
  mountTransactionHistory(document, data);
  elements.get('#transaction-date').value = '2024-01-04';
  elements.get('#transaction-description').value = '';
  elements.get('#transaction-category').value = 'Food';
  elements.get('#transaction-amount').value = 'not-a-number';
  const savedBefore = storage.getItem('transaction-history:test-user');
  const form = elements.get('#transaction-form');
  assert.equal(typeof form.listeners.submit, 'function');
  form.listeners.submit({ preventDefault() {} });

  assert.notEqual(elements.get('#status-message').textContent, '');
  assert.equal(storage.getItem('transaction-history:test-user'), savedBefore);
});

test('page restores a user history already saved in storage instead of reseeding it', () => {
  const { document, elements, storage } = createHistoryDocument();
  const saved = [{ id: 7, date: '2024-01-04', description: 'Saved lunch', category: 'Food', amount: -15 }];
  storage.setItem('transaction-history:test-user', JSON.stringify(saved));

  mountTransactionHistory(document, data);

  assert.equal(elements.get('#results-count').textContent, '1 transaction');
  assert.equal(elements.get('#transaction-list').children[0].children[1].textContent, 'Saved lunch');
});

test('page reports corrupted stored history and exposes retry', () => {
  const { document, elements, storage } = createHistoryDocument();
  storage.setItem('transaction-history:test-user', '{invalid json');

  mountTransactionHistory(document, data);

  assert.match(elements.get('#status-message').textContent, /Unable to load transaction history/);
  assert.equal(elements.get('#retry-history').hidden, false);
  assert.equal(elements.get('#transaction-list').children.length, 0);
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

test('repository persists updates and removals across visits without changing another user history', () => {
  const storage = createMemoryStorage();
  const userA = createTransactionRepository({ storage, userId: 'user-a', initialTransactions: data });
  const userB = createTransactionRepository({
    storage,
    userId: 'user-b',
    initialTransactions: [{ id: 1, date: '2024-01-04', description: 'Private record', category: 'Personal', amount: -5 }]
  });
  userB.list();

  userA.update(1, { description: 'Updated coffee', status: 'posted' });
  userA.remove(2);

  const nextVisitA = createTransactionRepository({ storage, userId: 'user-a' });
  const nextVisitB = createTransactionRepository({ storage, userId: 'user-b' });
  assert.equal(nextVisitA.list().find((item) => item.id === 1).description, 'Updated coffee');
  assert.equal(nextVisitA.list().some((item) => item.id === 2), false);
  assert.equal(nextVisitB.list()[0].description, 'Private record');
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
