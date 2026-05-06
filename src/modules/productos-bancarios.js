// Modulo Productos bancarios - codigo productivo extraido de app.js v43
function renderProductos() {
  const s = getBankSummary();
  set('bp-limite', eur(s.limiteLineas)); set('bp-dispuesto', eur(s.dispuestoLineas)); set('bp-disponible', eur(s.disponibleLineas)); set('bp-prestamo', eur(s.prestamoInicial));
  const lineas = s.productos.filter(p => p.tipo === 'linea');
  mkChart('c-bank-lines', 'bar', lineas.map(p => p.banco), [
    { label: 'Dispuesto', data: lineas.map(p => p.dispuesto || 0), backgroundColor: '#D4502A', borderRadius: 5 },
    { label: 'Disponible', data: lineas.map(p => p.disponible || 0), backgroundColor: '#1A9E72', borderRadius: 5 },
  ], { plugins: { legend: { display: true, labels: { font: { family: 'DM Sans', size: 11 } } }, tooltip: { callbacks: { label: c => (c.dataset.label || '') + ': ' + eur(c.raw) } } }, scales: { x: { stacked: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11, family: 'DM Sans' }, color: '#A8A59F' } }, y: { stacked: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11, family: 'DM Sans' }, color: '#A8A59F', callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } } } });
  const tbody = document.getElementById('tb-bank-products');
  if (!tbody) return;
  tbody.innerHTML = s.productos.map(p => {
    if (p.tipo === 'prestamo') return `<tr><td style="font-weight:500">${p.banco}</td><td>${p.producto}</td><td class="tr" style="font-weight:600">${eur(p.principal)}</td><td class="tr">—</td><td class="tr">—</td><td><span class="pill pz">Principal inicial</span></td><td style="font-size:12px;color:var(--text3)">${p.origen}</td></tr>`;
    const pct = Math.max(0, Math.min(100, p.usoPct || 0));
    return `<tr><td style="font-weight:500">${p.banco}</td><td>${p.producto}</td><td class="tr" style="font-weight:600">${eur(p.limite)}</td><td class="tr"><input value="${p.disponible || 0}" onchange="setManualBankDisponible('${p.id}', this.value)" title="Disponible, no dispuesto" style="width:90px;text-align:right;padding:5px 7px;border:1px solid var(--border2);border-radius:7px;background:var(--bg);font-family:'DM Sans';font-size:12px"> €</td><td class="tr" style="font-weight:600;color:var(--red)">${eur(p.dispuesto)}</td><td><div style="width:120px;background:var(--bg2);border-radius:999px;overflow:hidden;height:8px;margin-bottom:4px"><div style="width:${pct}%;height:8px;background:${pct>80?'#D4502A':pct>50?'#B87318':'#1A9E72'}"></div></div><span style="font-size:11px;color:var(--text3)">${pct.toFixed(1)}% usado</span></td><td style="font-size:12px;color:var(--text3)">${p.origenDato || p.origen}${p.origenDato && p.origenDato.startsWith('Manual') ? ` <button onclick="clearManualBankDisponible('${p.id}')" style="border:0;background:transparent;color:var(--accent);cursor:pointer;font-size:11px">usar Excel</button>` : ''}</td></tr>`;
  }).join('');
}




// ============================================================
// OPEN BANKING / PSD2 VIA POWENS + SUPABASE EDGE FUNCTION
// ============================================================
function openBankingFunctionUrl() {
  const url = localStorage.getItem('cd_url') || '';
  return url ? url.replace(/\/$/, '') + '/functions/v1/powens-banking' : '';
}
async function openBankingCall(action, payload={}) {
  const endpoint = openBankingFunctionUrl();
  const key = localStorage.getItem('cd_key') || '';
  if (!endpoint || !key) throw new Error('Configura Supabase antes de conectar bancos.');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || data.message || 'Error Powens banking');
  return data;
}
function setOBStatus(msg, kind='info') {
  const el = document.getElementById('ob-status');
  if (!el) return;
  const color = kind === 'err' ? 'var(--red)' : (kind === 'ok' ? 'var(--green)' : 'var(--text3)');
  el.style.color = color;
  el.textContent = msg || '';
}
