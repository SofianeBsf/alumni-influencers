/**
 * Client-side JavaScript
 * Handles:
 * - AJAX delete for profile sub-items (credentials, employment)
 * - CSRF token extraction from hidden inputs
 * - Alert auto-dismiss
 *
 * NOTE: No inline onclick handlers are used (blocked by CSP).
 * All click handling is done via event delegation on document.
 */

/**
 * Perform the DELETE request for a profile sub-item.
 * Called by the event delegation listener below.
 *
 * @param {string} url - e.g. /profile/degrees/<id>
 * @param {HTMLElement} btn - the clicked Delete button
 */
async function deleteItem(url, btn) {
  if (!confirm('Are you sure you want to delete this entry?')) return;

  // Get CSRF token from any hidden input on the page
  const csrfInput = document.querySelector('input[name="_csrf"]');
  const csrfToken = csrfInput ? csrfInput.value : '';

  // Pass CSRF token in URL query string
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
      // Fade out and remove the table row
      const row = btn.closest('tr');
      if (row) {
        row.style.transition = 'opacity 0.3s';
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 300);
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

  // ── Event delegation for all delete buttons ──────────────────────────────
  // Buttons use data-url attribute instead of onclick (CSP requires this)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-btn');
    if (!btn) return;
    const url = btn.dataset.url;
    if (url) deleteItem(url, btn);
  });

  // ── "Currently working here" checkbox disables end-date input ────────────
  const isCurrentCheckbox = document.getElementById('isCurrentCheckbox');
  const endDateInput = document.getElementById('endDate');
  if (isCurrentCheckbox && endDateInput) {
    isCurrentCheckbox.addEventListener('change', () => {
      endDateInput.disabled = isCurrentCheckbox.checked;
      if (isCurrentCheckbox.checked) endDateInput.value = '';
    });
  }

  // ── Auto-dismiss alerts after 5 seconds ──────────────────────────────────
  const alerts = document.querySelectorAll('.alert');
  alerts.forEach((alertEl) => {
    setTimeout(() => {
      alertEl.style.transition = 'opacity 0.5s';
      alertEl.style.opacity = '0';
      setTimeout(() => alertEl.remove(), 500);
    }, 5000);
  });

});
