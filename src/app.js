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

export const emptyFilters = Object.freeze({ keyword: '', category: '', from: '', to: '' });

export function hasActiveFilters(filters) {
  return Object.values(filters).some(Boolean);
}

export function filterTransactions(items, filters) {
  const keyword = filters.keyword.trim().toLowerCase();
  return items.filter((item) => {
    const matchesKeyword = !keyword
      || `${item.description} ${item.category}`.toLowerCase().includes(keyword);
    const matchesCategory = !filters.category || item.category === filters.category;
    const matchesFrom = !filters.from || item.date >= filters.from;
    const matchesTo = !filters.to || item.date <= filters.to;
    return matchesKeyword && matchesCategory && matchesFrom && matchesTo;
  });
}

export function resetFilters(filters, page = 1) {
  if (!hasActiveFilters(filters) && page === 1) return { filters, page, changed: false };
  return { filters: { ...emptyFilters }, page: 1, changed: true };
}

export function createTransactionStore(items = transactions) {
  let state = { filters: { ...emptyFilters }, page: 1, requestId: 0 };
  return {
    getState: () => state,
    setFilters(nextFilters) {
      state = { ...state, filters: { ...state.filters, ...nextFilters }, page: 1, requestId: state.requestId + 1 };
      return state;
    },
    reset() {
      const result = resetFilters(state.filters, state.page);
      if (!result.changed) return state;
      state = { ...state, filters: result.filters, page: result.page, requestId: state.requestId + 1 };
      return state;
    },
    setPage(page) {
      const pages = Math.max(1, Math.ceil(filterTransactions(items, state.filters).length / PAGE_SIZE));
      state = { ...state, page: Math.min(Math.max(1, page), pages) };
      return state;
    },
    getVisibleTransactions() {
      const filtered = filterTransactions(items, state.filters);
      const start = (state.page - 1) * PAGE_SIZE;
      return { items: filtered.slice(start, start + PAGE_SIZE), total: filtered.length, pages: Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) };
    },
    beginRequest() {
      state = { ...state, requestId: state.requestId + 1 };
      return state.requestId;
    },
    acceptResponse(requestId) {
      return requestId === state.requestId;
    }
  };
}

function formatAmount(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function mountTransactionHistory(document, items = transactions) {
  const store = createTransactionStore(items);
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

  [...new Set(items.map((item) => item.category))].sort().forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    category.append(option);
  });

  function render() {
    const state = store.getState();
    const result = store.getVisibleTransactions();
    reset.hidden = !hasActiveFilters(state.filters);
    count.textContent = `${result.total} transaction${result.total === 1 ? '' : 's'}`;
    status.textContent = result.total ? '' : 'No transactions match these filters.';
    list.replaceChildren(...result.items.map((item) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${item.date}</td><td>${item.description}</td><td>${item.category}</td><td class="${item.amount < 0 ? 'debit' : 'credit'}">${formatAmount(item.amount)}</td>`;
      return row;
    }));
    pageLabel.textContent = `Page ${state.page} of ${result.pages}`;
    previous.disabled = state.page === 1;
    next.disabled = state.page >= result.pages;
  }

  function update() {
    store.setFilters({ keyword: keyword.value, category: category.value, from: from.value, to: to.value });
    render();
  }
  [keyword, category, from, to].forEach((control) => control.addEventListener('input', update));
  reset.addEventListener('click', () => {
    store.reset();
    keyword.value = '';
    category.value = '';
    from.value = '';
    to.value = '';
    render();
    keyword.focus();
  });
  previous.addEventListener('click', () => { store.setPage(store.getState().page - 1); render(); });
  next.addEventListener('click', () => { store.setPage(store.getState().page + 1); render(); });
  render();
  return store;
}

if (typeof document !== 'undefined') mountTransactionHistory(document);
