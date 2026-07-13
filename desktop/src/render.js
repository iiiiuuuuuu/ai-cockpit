export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderEyeIcon(off = false) {
  return `
    <svg class="secret-eye-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2.5 10s2.8-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.8 4.5-7.5 4.5S2.5 10 2.5 10Z"></path>
      <circle cx="10" cy="10" r="2.2"></circle>
      ${off ? '<path d="M4 4l12 12"></path>' : ''}
    </svg>
  `;
}
