/**
 * Client-side JavaScript
 * Handles:
 * - AJAX delete for profile sub-items (credentials, employment)
 * - Inline edit row toggle for profile sub-items
 * - Copy-to-clipboard for API tokens
 * - Confirm dialogs for dangerous actions (CSP-compliant, no inline onclick)
 *
 * NOTE: No inline onclick/onchange handlers are used (blocked by CSP).
 * All click handling is done via event delegation on document.
 */

/**
 * Perform the DELETE request for a profile sub-item.
 * @param {string} url - e.g. /profile/degrees/<id>
 * @param {HTMLElement} btn - the clicked Delete button
 */
async function deleteItem(url, btn) {
  if (!confirm('Are you sure you want to delete this entry?')) return;

  const csrfInput = document.querySelector('input[name="_csrf"]');
  const csrfToken = csrfInput ? csrfInput.value : '';
  const urlWithCsrf = `${url}?_csrf=${encodeURIComponent(csrfToken)}`;

  try {
    const response = await fetch(urlWithCsrf, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
    });

    const data = await response.json();

    if (data.success) {
      // Remove the item row and its associated edit row
      const row = btn.closest('tr');
      if (row) {
        const editRowId = row.nextElementSibling && row.nextElementSibling.classList.contains('edit-row')
          ? row.nextElementSibling
          : null;
        row.style.transition = 'opacity 0.3s';
        row.style.opacity = '0';
        setTimeout(() => {
          row.remove();
          if (editRowId) editRowId.remove();
        }, 300);
      }
    } else {
      alert(data.error || 'Failed to delete item. Please try again.');
    }
  } catch (err) {
    console.error('Delete error:', err);
    alert('Network error. Please try again.');
  }
}

document.addEventListener('DOMContentLoaded', () => {

  // ── Event delegation: delete buttons ─────────────────────────────────────
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-btn');
    if (!btn) return;
    const url = btn.dataset.url;
    if (url) deleteItem(url, btn);
  });

  // ── Event delegation: show/hide inline edit forms ─────────────────────────
  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-toggle-btn');
    if (editBtn) {
      const targetId = editBtn.dataset.target;
      const editRow = document.getElementById(targetId);
      if (editRow) {
        editRow.style.display = editRow.style.display === 'none' ? 'table-row' : 'none';
      }
      return;
    }

    const cancelBtn = e.target.closest('.edit-cancel-btn');
    if (cancelBtn) {
      const targetId = cancelBtn.dataset.target;
      const editRow = document.getElementById(targetId);
      if (editRow) editRow.style.display = 'none';
    }
  });

  // ── Event delegation: confirm dialogs (revoke, cancel bid, etc.) ──────────
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.confirm-btn');
    if (!btn) return;
    const msg = btn.dataset.confirm || 'Are you sure?';
    if (!confirm(msg)) e.preventDefault();
  });

  // ── Copy-to-clipboard for API token box ───────────────────────────────────
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.copy);
      if (!target) return;
      navigator.clipboard.writeText(target.innerText.trim()).then(() => {
        btn.textContent = '✅ Copied!';
        setTimeout(() => (btn.textContent = '📋 Copy Token'), 2000);
      }).catch(() => {
        // Fallback for older browsers
        const range = document.createRange();
        range.selectNode(target);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        btn.textContent = '✅ Copied!';
        setTimeout(() => (btn.textContent = '📋 Copy Token'), 2000);
      });
    });
  });

  // ── "Currently working here" checkbox disables end-date input ─────────────
  // Uses event delegation so it works for BOTH the static "Add Employment" form
  // AND every dynamically-shown inline edit row for existing employment entries.
  document.addEventListener('change', (e) => {
    const checkbox = e.target.closest('input[name="isCurrent"]');
    if (!checkbox) return;

    // Find the enclosing <form> and locate the endDate input within it
    const form = checkbox.closest('form');
    if (!form) return;

    const endDateInput = form.querySelector('input[name="endDate"]');
    if (!endDateInput) return;

    endDateInput.disabled = checkbox.checked;
    if (checkbox.checked) endDateInput.value = '';
  });

});
