import {
  createAccountExportSelection,
  filterAccountExportRows,
  paginateAccountExportRows,
  selectAccountExportScope,
} from './account-export.js';
import {
  isApiKeyAccount,
  isDeletedAccount,
  resolveAccountTitleParts,
} from './account-model.js';
import { escapeHtml } from './render.js';

function accountList(value) {
  return Array.isArray(value) ? value : [];
}

function exportFilename(date) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `ai-cockpit-accounts-${stamp}.json`;
}

function exportCounts(accounts, query) {
  return {
    all: filterAccountExportRows(accounts, { type: 'all', query }).length,
    token: filterAccountExportRows(accounts, { type: 'token', query }).length,
    apikey: filterAccountExportRows(accounts, { type: 'apikey', query }).length,
    deleted: filterAccountExportRows(accounts, { type: 'deleted', query }).length,
  };
}

function accountRow(account, selected) {
  const title = resolveAccountTitleParts(account);
  const apiKey = isApiKeyAccount(account);
  const deleted = Boolean(isDeletedAccount(account));
  const subtitle = title.subtitle || (apiKey ? account.item?.base_url : account.item?.account_id) || '';
  return `
    <tr>
      <td class="batch-export-check-cell"><input type="checkbox" data-batch-export-index="${account.index}" aria-label="选择 ${escapeHtml(title.title)}"${selected ? ' checked' : ''}></td>
      <td class="batch-export-account-cell"><strong title="${escapeHtml(title.title)}">${escapeHtml(title.title)}</strong><small title="${escapeHtml(subtitle)}">${escapeHtml(subtitle)}</small></td>
      <td><span class="batch-export-type">${apiKey ? 'API KEY' : 'TOKEN'}</span></td>
      <td><span class="batch-export-status${deleted ? ' deleted' : ''}">${deleted ? '已删除' : '正常'}</span></td>
    </tr>`;
}

export function createBatchExportController(options = {}) {
  const elements = options.elements || {};
  const getAccounts = typeof options.getAccounts === 'function'
    ? options.getAccounts
    : () => accountList(options.accounts);
  const invoke = typeof options.invoke === 'function' ? options.invoke : async () => ({ saved: false, exported: 0 });
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const close = typeof options.close === 'function'
    ? options.close
    : () => { if (elements.modal) elements.modal.hidden = true; };
  const showToast = typeof options.showToast === 'function' ? options.showToast : () => {};
  const state = {
    accounts: [],
    selected: new Set(),
    filter: 'all',
    query: '',
    page: 1,
    pageSize: Number.isFinite(options.pageSize) && options.pageSize > 0 ? Math.floor(options.pageSize) : 10,
    exporting: false,
  };

  function snapshot() {
    const filteredRows = filterAccountExportRows(state.accounts, { type: state.filter, query: state.query });
    const paginated = paginateAccountExportRows(filteredRows, state.page, state.pageSize);
    state.page = paginated.currentPage;
    return {
      ...state,
      selected: new Set(state.selected),
      selectedCount: state.selected.size,
      selectedDeletedCount: state.accounts.filter(account => (
        state.selected.has(account.index) && Boolean(isDeletedAccount(account))
      )).length,
      canExport: state.selected.size > 0 && !state.exporting,
      counts: exportCounts(state.accounts, state.query),
      pageRows: paginated.rows,
      total: paginated.total,
      pageCount: paginated.pageCount,
      start: paginated.start,
    };
  }

  function render() {
    const view = snapshot();
    elements.filterButtons?.forEach(button => {
      const active = button.dataset.batchExportFilter === state.filter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    elements.counts?.forEach(element => {
      element.textContent = String(view.counts[element.dataset.batchExportCount] || 0);
    });
    if (elements.selectionSummary) {
      elements.selectionSummary.textContent = view.selectedCount === 0
        ? '未选择账号'
        : view.selectedDeletedCount > 0
          ? `已选择 ${view.selectedCount} 个账号（含 ${view.selectedDeletedCount} 个已删除）`
          : `已选择 ${view.selectedCount} 个未删除账号`;
    }
    if (elements.tableBody) {
      elements.tableBody.innerHTML = view.pageRows.length
        ? view.pageRows.map(account => accountRow(account, state.selected.has(account.index))).join('')
        : '<tr><td class="batch-export-empty" colspan="4">没有符合条件的账号</td></tr>';
    }

    const selectedOnPage = view.pageRows.filter(account => state.selected.has(account.index)).length;
    if (elements.pageCheckbox) {
      elements.pageCheckbox.checked = view.pageRows.length > 0 && selectedOnPage === view.pageRows.length;
      elements.pageCheckbox.indeterminate = selectedOnPage > 0 && selectedOnPage < view.pageRows.length;
      elements.pageCheckbox.disabled = view.pageRows.length === 0;
    }
    if (elements.range) {
      const first = view.total ? view.start + 1 : 0;
      const last = Math.min(view.start + view.pageRows.length, view.total);
      elements.range.textContent = `${first}-${last} / ${view.total}`;
    }
    if (elements.pageLabel) elements.pageLabel.textContent = `${state.page} / ${view.pageCount}`;
    if (elements.previousButton) elements.previousButton.disabled = state.page <= 1;
    if (elements.nextButton) elements.nextButton.disabled = state.page >= view.pageCount;
    if (elements.confirmButton) {
      elements.confirmButton.disabled = !view.canExport;
      elements.confirmButton.textContent = state.exporting ? '正在导出…' : `导出 ${view.selectedCount} 个账号`;
      elements.confirmButton.classList.toggle('loading', state.exporting);
    }
    return view;
  }

  function open() {
    state.accounts = accountList(getAccounts());
    state.selected = createAccountExportSelection(state.accounts);
    state.filter = 'all';
    state.query = '';
    state.page = 1;
    if (elements.searchInput) elements.searchInput.value = '';
    if (elements.modal) elements.modal.hidden = false;
    render();
    globalThis.setTimeout?.(() => elements.searchInput?.focus(), 0);
  }

  function setFilter(filter) {
    state.filter = ['all', 'token', 'apikey', 'deleted'].includes(filter) ? filter : 'all';
    state.page = 1;
    return render();
  }

  function setQuery(query) {
    state.query = String(query || '');
    state.page = 1;
    return render();
  }

  function setPage(page) {
    state.page = Number(page) || 1;
    return render();
  }

  function toggleIndex(index, checked) {
    const normalized = Number(index);
    if (!Number.isInteger(normalized)) return snapshot();
    if (checked) state.selected.add(normalized);
    else state.selected.delete(normalized);
    return render();
  }

  function toggleCurrentPage(checked) {
    const view = snapshot();
    view.pageRows.forEach(account => {
      if (checked) state.selected.add(account.index);
      else state.selected.delete(account.index);
    });
    return render();
  }

  function selectScope(scope) {
    state.selected = selectAccountExportScope(state.accounts, scope);
    return render();
  }

  async function exportSelected() {
    if (state.exporting || state.selected.size === 0) return null;
    state.exporting = true;
    render();
    try {
      const exportedAt = now();
      const indexes = state.accounts
        .filter(account => state.selected.has(account.index))
        .map(account => account.index);
      const response = await invoke('export_desktop_accounts', {
        indexes,
        exportedAt: exportedAt.toISOString(),
        suggestedFilename: exportFilename(exportedAt),
      });
      if (!response?.saved) return response;
      const exported = Number.isFinite(Number(response.exported)) ? Number(response.exported) : indexes.length;
      close();
      showToast(`已导出 ${exported} 个账号`);
      return response;
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error || '')).trim();
      showToast(message ? `批量导出失败：${message}` : '批量导出失败，请稍后重试');
      return null;
    } finally {
      state.exporting = false;
      render();
    }
  }

  elements.searchInput?.addEventListener('input', event => setQuery(event.currentTarget.value));
  elements.filterButtons?.forEach(button => {
    button.addEventListener('click', () => setFilter(button.dataset.batchExportFilter));
  });
  elements.scopeButtons?.forEach(button => {
    button.addEventListener('click', () => selectScope(button.dataset.batchExportScope));
  });
  elements.tableBody?.addEventListener('change', event => {
    const checkbox = event.target.closest?.('[data-batch-export-index]');
    if (checkbox) toggleIndex(checkbox.dataset.batchExportIndex, checkbox.checked);
  });
  elements.pageCheckbox?.addEventListener('change', event => toggleCurrentPage(event.currentTarget.checked));
  elements.previousButton?.addEventListener('click', () => setPage(state.page - 1));
  elements.nextButton?.addEventListener('click', () => setPage(state.page + 1));
  elements.confirmButton?.addEventListener('click', () => void exportSelected());

  return {
    open,
    render,
    getState: snapshot,
    setFilter,
    setQuery,
    setPage,
    toggleIndex,
    toggleCurrentPage,
    selectScope,
    exportSelected,
  };
}
