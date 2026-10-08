export const PAGE_SIZE = 5;

export const transactions = [
  { id: 1, date: '2024-06-24', description: 'Grocery Market', category: 'Food', amount: -84.21 },
  { id: 2, date: '2024-06-21', description: 'Metro Transit', category: 'Transport', amount: -32.00 },
  { id: 3, date: '2024-06-18', description: 'Northwind Books', category: 'Shopping', amount: -28.50 },
  { id: 4, date: '2024-06-15', description: 'Payroll deposit', category: 'Income', amount: 2450.00 },
  { id: 5, date: '2024-06-12', description: 'Cafe Sunrise', category: 'Food', amount: -14.75 },
  { id: 6, date: '2024-06-08', description: 'Electric company', category: 'Bills', amount: -92.18 },
  { id: 7, date: '2024-06-04', description: 'City parking', category: 'Transport', amount: -18.00 },
  { id: 8, date: '2024-05-30', description: 'Cloud storage', category: 'Bills', amount: -9.99 },
  { id: 9, date: '2024-05-25', description: 'Garden supply', category: 'Shopping', amount: -43.19 }
];

export const emptyFilters = Object.freeze({
  keyword: '',
  category: '',
  from: '',
  to: ''
});

function isValidTransaction(item) {
  return item
    && (typeof item.id === 'string' || typeof item.id === 'number')
    && String(item.id).length > 0
    && typeof item.date === 'string'
    && !Number.isNaN(Date.parse(item.date))
    && typeof item.description === 'string'
    && typeof item.category === 'string'
    && Number.isFinite(item.amount)
    && (item.status === undefined || typeof item.status === 'string');
}

function sortTransactions(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const dateOrder = right.item.date.localeCompare(left.item.date);
      return dateOrder || left.index - right.index;
    })
    .map(({ item }) => item);
}

export function createTransactionRepository({ storage, userId, initialTransactions = [] }) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('A persistent storage adapter is required.');
  }
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new TypeError('A user ID is required to access transaction history.');
  }

  const key = `transaction-history:${encodeURIComponent(userId.trim())}`;

  function read() {
    const saved = storage.getItem(key);
    if (saved === null) {
      if (!initialTransactions.every(isValidTransaction)) {
        throw new TypeError('Initial transaction history contains invalid records.');
      }
      const seed = sortTransactions(initialTransactions);
      storage.setItem(key, JSON.stringify(seed));
      return seed;
    }

    let parsed;
    try {
      parsed = JSON.parse(saved);
    } catch {
      throw new Error('Stored transaction history is invalid and could not be loaded.');
    }
    if (!Array.isArray(parsed)) {
      throw new Error('Stored transaction history has an unsupported format.');
    }
    return sortTransactions(parsed.filter(isValidTransaction));
  }

  function write(items) {
    storage.setItem(key, JSON.stringify(sortTransactions(items)));
  }

  return {
    list: read,
    getPage(page = 1, pageSize = PAGE_SIZE) {
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1) {
        throw new RangeError('Page and page size must be positive integers.');
      }
      const items = read();
      const pages = Math.max(1, Math.ceil(items.length / pageSize));
      const currentPage = Math.min(page, pages);
      const start = (currentPage - 1) * pageSize;
      return { items: items.slice(start, start + pageSize), total: items.length, pages, page: currentPage };
    },
    save(transaction) {
      if (!isValidTransaction(transaction)) {
        throw new TypeError('Transaction is missing valid history details.');
      }
      const items = read();
      const existingIndex = items.findIndex((item) => String(item.id) === String(transaction.id));
      let saved;
      if (existingIndex === -1) items.push({ ...transaction });
      else items[existingIndex] = { ...items[existingIndex], ...transaction };
      saved = existingIndex === -1 ? { ...transaction } : items[existingIndex];
      write(items);
      return { ...saved };
    },
    update(id, changes) {
      const items = read();
      const existing = items.find((item) => String(item.id) === String(id));
      if (!existing) throw new Error(`Transaction ${id} was not found.`);
      const updated = { ...existing, ...changes, id: existing.id };
      if (!isValidTransaction(updated)) {
        throw new TypeError('Transaction update contains invalid history details.');
      }
      write(items.map((item) => String(item.id) === String(id) ? updated : item));
      return updated;
    },
    remove(id) {
      const items = read();
      const remaining = items.filter((item) => String(item.id) !== String(id));
      if (remaining.length !== items.length) write(remaining);
      return remaining.length !== items.length;
    }
  };
}

export function hasActiveFilters(filters) {
  return Object.values(filters).some(Boolean);
}

export function transactionMatchesSearch(item, searchTerm) {
  const keyword = searchTerm.trim().toLowerCase();

  if (!keyword) {
    return true;
  }

  const searchableText = [
    item.date,
    item.description,
    item.category,
    String(item.amount),
    Math.abs(item.amount).toFixed(2)
  ]
    .join(' ')
    .toLowerCase();

  return searchableText.includes(keyword);
}

export function filterTransactions(items, filters) {
  return items.filter((item) => {
    const matchesKeyword = transactionMatchesSearch(
      item,
      filters.keyword
    );

    const matchesCategory =
      !filters.category ||
      item.category === filters.category;

    const matchesFrom =
      !filters.from ||
      item.date >= filters.from;

    const matchesTo =
      !filters.to ||
      item.date <= filters.to;

    return (
      matchesKeyword &&
      matchesCategory &&
      matchesFrom &&
      matchesTo
    );
  });
}

export function resetFilters(filters, page = 1) {
  if (!hasActiveFilters(filters) && page === 1) {
    return {
      filters,
      page,
      changed: false
    };
  }

  return {
    filters: { ...emptyFilters },
    page: 1,
    changed: true
  };
}

export function createTransactionStore(items = transactions) {
  let state = {
    filters: { ...emptyFilters },
    page: 1,
    requestId: 0
  };

  return {
    getState: () => state,

    setFilters(nextFilters) {
      state = {
        ...state,
        filters: {
          ...state.filters,
          ...nextFilters
        },
        page: 1,
        requestId: state.requestId + 1
      };

      return state;
    },

    reset() {
      const result = resetFilters(
        state.filters,
        state.page
      );

      if (!result.changed) {
        return state;
      }

      state = {
        ...state,
        filters: result.filters,
        page: result.page,
        requestId: state.requestId + 1
      };

      return state;
    },

    setPage(page) {
      const filtered = filterTransactions(
        items,
        state.filters
      );

      const pages = Math.max(
        1,
        Math.ceil(filtered.length / PAGE_SIZE)
      );

      state = {
        ...state,
        page: Math.min(
          Math.max(1, page),
          pages
        )
      };

      return state;
    },

    getVisibleTransactions() {
      const filtered = filterTransactions(
        items,
        state.filters
      );

      const start =
        (state.page - 1) * PAGE_SIZE;

      return {
        items: filtered.slice(
          start,
          start + PAGE_SIZE
        ),
        total: filtered.length,
        pages: Math.max(
          1,
          Math.ceil(filtered.length / PAGE_SIZE)
        )
      };
    },

    beginRequest() {
      state = {
        ...state,
        requestId: state.requestId + 1
      };

      return state.requestId;
    },

    acceptResponse(requestId) {
      return requestId === state.requestId;
    }
  };
}

function formatAmount(amount) {
  return new Intl.NumberFormat(
    'en-US',
    {
      style: 'currency',
      currency: 'USD'
    }
  ).format(amount);
}

export function mountTransactionHistory(document, items = transactions) {
  const userId = document.querySelector('main')?.dataset.userId;
  let repository;
  let store;
  const keyword = document.querySelector('#keyword-filter');
  const category = document.querySelector('#category-filter');
  const from = document.querySelector('#from-filter');
  const to = document.querySelector('#to-filter');
  const reset = document.querySelector('#reset-filters');
  const list = document.querySelector('#transaction-list');
  const count = document.querySelector('#results-count');
  const status = document.querySelector('#status-message');
  const pageLabel = document.querySelector('#page-label');
  const previous = document.querySelector('#previous-page');
  const next = document.querySelector('#next-page');
  const retry = document.querySelector('#retry-history');

  function loadHistory() {
    status.textContent = 'Loading transaction history…';
    retry.hidden = true;
    try {
      repository ||= createTransactionRepository({
        storage: document.defaultView.localStorage,
        userId,
        initialTransactions: items
      });
      const history = repository.list();
      store = createTransactionStore(history);
      category.replaceChildren();
      const allCategories = document.createElement('option');
      allCategories.value = '';
      allCategories.textContent = 'All categories';
      category.append(allCategories);
      [...new Set(history.map((item) => item.category))].sort().forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        category.append(option);
      });
      render();
    } catch (error) {
      store = null;
      status.textContent = error instanceof Error
        ? `Unable to load transaction history: ${error.message}`
        : 'Unable to load transaction history.';
      count.textContent = '0 transactions';
      list.replaceChildren();
      pageLabel.textContent = 'Page 1 of 1';
      previous.disabled = true;
      next.disabled = true;
      reset.hidden = true;
      retry.hidden = false;
    }
  }

  function render() {
    if (!store) return;
    const state = store.getState();
    const result = store.getVisibleTransactions();
    reset.hidden = !hasActiveFilters(state.filters);
    count.textContent = `${result.total} transaction${result.total === 1 ? '' : 's'}`;
    status.textContent = result.total
      ? ''
      : hasActiveFilters(state.filters) ? 'No transactions match these filters.' : 'No transactions yet.';
    list.replaceChildren(...result.items.map((item) => {
      const row = document.createElement('tr');
      const values = [item.date, item.description, item.category, item.status || '—', formatAmount(item.amount)];
      values.forEach((value, index) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        if (index === 4) cell.className = item.amount < 0 ? 'debit' : 'credit';
        row.append(cell);
      });
      return row;
    }));
    pageLabel.textContent = `Page ${state.page} of ${result.pages}`;
    previous.disabled = state.page === 1;
    next.disabled = state.page >= result.pages;
  }

  function update() {
    if (!store) return;
    store.setFilters({ keyword: keyword.value, category: category.value, from: from.value, to: to.value });
    render();
  }
  [keyword, category, from, to].forEach((control) => control.addEventListener('input', update));
  reset.addEventListener('click', () => {
    if (!store) return;
    store.reset();
    keyword.value = '';
    category.value = '';
    from.value = '';
    to.value = '';
    render();
    keyword.focus();
  });
  previous.addEventListener('click', () => { if (store) { store.setPage(store.getState().page - 1); render(); } });
  next.addEventListener('click', () => { if (store) { store.setPage(store.getState().page + 1); render(); } });
  retry.addEventListener('click', loadHistory);
  loadHistory();
  return store;
}

if (typeof document !== 'undefined') {
  mountTransactionHistory(document);
}