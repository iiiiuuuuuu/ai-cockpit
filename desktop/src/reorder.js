import { getSortOrder, isDeletedAccount, normalizeAccount } from './account-model.js';

export function createReorderDraft(accounts) {
  return [...(accounts || [])]
    .filter(account => !isDeletedAccount(account))
    .sort((left, right) => getSortOrder(left) - getSortOrder(right))
    .map(account => normalizeAccount(account).index);
}

export function orderAccountsByDraft(accounts, orderedIndexes) {
  const order = new Map((orderedIndexes || []).map((index, position) => [index, position]));
  return [...(accounts || [])].sort((left, right) => {
    const leftIndex = normalizeAccount(left).index;
    const rightIndex = normalizeAccount(right).index;
    const leftOrder = order.has(leftIndex) ? order.get(leftIndex) : Number.MAX_SAFE_INTEGER;
    const rightOrder = order.has(rightIndex) ? order.get(rightIndex) : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || getSortOrder(left) - getSortOrder(right);
  });
}

export function moveReorderIndex(orderedIndexes, accountIndex, offset) {
  const next = [...(orderedIndexes || [])];
  const currentPosition = next.indexOf(accountIndex);
  const targetPosition = currentPosition + offset;
  if (currentPosition < 0 || targetPosition < 0 || targetPosition >= next.length) return next;
  next.splice(currentPosition, 1);
  next.splice(targetPosition, 0, accountIndex);
  return next;
}

export function readGridOrder(grid) {
  return [...grid.querySelectorAll(':scope > [data-account-index]')]
    .map(card => Number(card.dataset.accountIndex))
    .filter(Number.isInteger);
}

export function shouldInsertAfter(rect, clientX, clientY) {
  const verticalOffset = clientY - rect.top;
  return verticalOffset > rect.height * 0.75
    || (verticalOffset >= rect.height * 0.25 && clientX > rect.left + rect.width / 2);
}

function animateGridReflow(grid, mutate) {
  const cards = [...grid.querySelectorAll(':scope > [data-account-index]:not([data-reorder-placeholder])')];
  const previousRects = new Map(cards.map(card => [card, card.getBoundingClientRect()]));
  mutate();

  cards.forEach(card => {
    const previous = previousRects.get(card);
    const next = card.getBoundingClientRect();
    const deltaX = previous.left - next.left;
    const deltaY = previous.top - next.top;
    if ((!deltaX && !deltaY) || typeof card.animate !== 'function') return;
    card.animate([
      { transform: `translate(${deltaX}px, ${deltaY}px)` },
      { transform: 'translate(0, 0)' },
    ], {
      duration: 170,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
  });
}

export function bindAccountReorder({ grid, isEnabled, onOrderChange, onKeyboardMove }) {
  const ownerDocument = grid.ownerDocument || document;
  let dragState = null;

  grid.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-reorder-handle]');
    if (!handle || !isEnabled() || event.button !== 0) return;
    const card = handle.closest('[data-account-index]');
    if (!card) return;

    event.preventDefault();
    const rect = card.getBoundingClientRect();
    const placeholder = ownerDocument.createElement('div');
    placeholder.className = 'reorder-placeholder';
    placeholder.dataset.reorderPlaceholder = 'true';
    placeholder.dataset.accountIndex = card.dataset.accountIndex || '';
    placeholder.style.height = `${rect.height}px`;
    card.after(placeholder);

    card.classList.add('reorder-floating');
    Object.assign(card.style, {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      left: `${rect.left}px`,
      top: `${rect.top}px`,
    });
    ownerDocument.body.append(card);
    ownerDocument.body.classList.add('reorder-pointer-active');
    handle.setPointerCapture(event.pointerId);
    dragState = {
      card,
      handle,
      placeholder,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
  });

  ownerDocument.addEventListener('pointermove', event => {
    if (!dragState || event.pointerId !== dragState.pointerId || !isEnabled()) return;
    dragState.card.style.left = `${event.clientX - dragState.offsetX}px`;
    dragState.card.style.top = `${event.clientY - dragState.offsetY}px`;

    const pointedElement = ownerDocument.elementFromPoint(event.clientX, event.clientY);
    const targetCard = pointedElement?.closest('[data-account-index]:not([data-reorder-placeholder])');
    if (!targetCard || targetCard.parentElement !== grid) return;
    const rect = targetCard.getBoundingClientRect();
    const insertAfter = shouldInsertAfter(rect, event.clientX, event.clientY);
    const reference = insertAfter ? targetCard.nextSibling : targetCard;
    if (reference === dragState.placeholder || targetCard === dragState.placeholder) return;
    animateGridReflow(grid, () => grid.insertBefore(dragState.placeholder, reference));
    onOrderChange(readGridOrder(grid));
  });

  function finishPointerDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const { card, handle, placeholder } = dragState;
    const floatingRect = card.getBoundingClientRect();
    try {
      handle.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released after a system interruption.
    }
    placeholder.replaceWith(card);
    card.classList.remove('reorder-floating');
    card.removeAttribute('style');
    ownerDocument.body.classList.remove('reorder-pointer-active');

    const targetRect = card.getBoundingClientRect();
    const deltaX = floatingRect.left - targetRect.left;
    const deltaY = floatingRect.top - targetRect.top;
    if (typeof card.animate === 'function') {
      card.animate([
        {
          transform: `translate(${deltaX}px, ${deltaY}px) rotate(0.7deg) scale(1.018)`,
          boxShadow: '0 20px 42px rgba(33, 74, 120, 0.22)',
        },
        { transform: 'translate(0, 0) rotate(0) scale(1)', boxShadow: 'none' },
      ], {
        duration: 190,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
    }
    onOrderChange(readGridOrder(grid));
    dragState = null;
  }

  ownerDocument.addEventListener('pointerup', finishPointerDrag);
  ownerDocument.addEventListener('pointercancel', finishPointerDrag);

  grid.addEventListener('keydown', event => {
    const handle = event.target.closest('[data-reorder-handle]');
    if (!handle || !isEnabled()) return;
    const offset = ['ArrowLeft', 'ArrowUp'].includes(event.key)
      ? -1
      : ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : 0;
    if (!offset) return;
    event.preventDefault();
    onKeyboardMove(Number(handle.dataset.reorderHandle), offset);
  });
}
