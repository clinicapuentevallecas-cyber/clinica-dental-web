// Utilidades de formato compartidas.
window.AppFormat = {
  eur(value) {
    const n = Number(value || 0);
    return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  },
  date(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('es-ES');
  },
  maskIban(value) {
    if (!value) return '—';
    const clean = String(value).replace(/\s+/g, '');
    return clean.length <= 4 ? '••••' : `••••••••${clean.slice(-4)}`;
  }
};
