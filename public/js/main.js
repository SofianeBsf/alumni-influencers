/**
 * Client-side JavaScript
 * Handles:
 * - AJAX delete for profile sub-items (credentials, employment)
 * - CSRF token extraction from hidden inputs
 * - Alert auto-dismiss
 */

/**
 * Delete a profile sub-item via AJAX (DELETE request).
 * The CSRF token is read from the nearest form on the page.
 *
 * @param {string} url - The endpoint (e.g. /profile/degrees/<id>)
 * @param {HTMLElement} btn - The clicked button (for removing the table row)
 */
async function deleteItem(url, btn) {
  if (!confirm('Are you sure you want to delete this entry?')) return;

  // Get CSRF token from any hidden input on the page
  const csrfInput = document.querySelector('input[name="_csrf"]');
  const csrfToken = csrfInput ? csrfInput.value : '';

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
    });

    const data = await response.json();

    if (data.success) {
      // Remove the table row from the DOM without a page reload
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

// Auto-dismiss alerts after 5 seconds
document.addEventListener('DOMContentLoaded', () => {
  const alerts = document.querySelectorAll('.alert');
  alerts.forEach((alert) => {
    setTimeout(() => {
      alert.style.transition = 'opacity 0.5s';
      alert.style.opacity = '0';
      setTimeout(() => alert.remove(), 500);
    }, 5000);
  });
});
