// Modulo Datos privados - subida Excel privado y procesamiento
// EXCEL PRIVADO
// ============================================================
function dov(e, d) { e.preventDefault(); document.getElementById('uz').classList.toggle('drag', d); }
function ddrop(e) { e.preventDefault(); document.getElementById('uz').classList.remove('drag'); handleXLS(e.dataTransfer.files[0]); }

async function handleXLS(file) {
  if (!file) return;
  if (!sb) { alert('Configura Supabase primero'); openCfg(); return; }
  if (!requireRole('admin','finanzas')) return;
  const XLSX = await loadXLSX();
  set('uz-txt', '<div style="display:flex;align-items:center;gap:10px;justify-content:center"><div class="sp"></div><span>Procesando ' + file.name + '...</span></div>');
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const res = {};
      const jso = name => wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null }) : [];

      // Devoluciones
      const devs = jso('Devoluciones').filter(r => r['PACIENTE']).map(r => ({
        fecha_solicitud: r['FECHA DESOLICITUD'] instanceof Date ? r['FECHA DESOLICITUD'].toISOString().split('T')[0] : null,
        paciente: r['PACIENTE'], euros_pagados: r['€ PAGADOS'], euros_devolver: r['€ A DEVOLVER'],
        forma_pago: r['FORMA DE PAGO'], motivo: r['MOTIVO'],
        fecha_devolucion: r['FECHA DEVOLUCION'] instanceof Date ? r['FECHA DEVOLUCION'].toISOString().split('T')[0] : (r['FECHA DEVOLUCION'] !== 'PENDIENTE' ? r['FECHA DEVOLUCION'] : null)
      }));
      if (devs.length) {
        await sb.from('devoluciones').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await sb.from('devoluciones').insert(devs);
        res['Devoluciones'] = { count: devs.length, error: error?.message };
        D.devs = devs; renderDevs();
      }

      // Trabajadores
      const trabs = jso('Trabajadores').filter(r => r['TRABAJADOR'] && typeof r['TRABAJADOR'] === 'string' && !['AUTÓNOMOS','EX-TRABAJADORES'].includes(r['TRABAJADOR'])).map(r => ({
        nombre: r['TRABAJADOR'], tipo: 'plantilla', puesto: r['PUESTO'], jornada: r['JORNADA'],
        inicio: r['INICIO'] instanceof Date ? r['INICIO'].toISOString().split('T')[0] : null,
        contrato: r['CONTRATO'], bruto: r['BRUTO'], dni: r['DNI'],
        tlf: String(r['TLF'] || ''), email: r['EMAIL']
      }));
      if (trabs.length) {
        await sb.from('trabajadores').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await sb.from('trabajadores').insert(trabs);
        res['Trabajadores'] = { count: trabs.length, error: error?.message };
        D.workers = trabs; renderEquipo();
      }

      set('uz-txt', '<p style="font-size:14px;font-weight:500;margin-bottom:4px">Arrastra el Excel o haz clic</p><p style="font-size:12px;color:var(--text3)">Cuentas_2026.xlsx</p>');
      set('priv-result', `<div class="al as2">✓ <strong>${file.name} procesado correctamente</strong></div><div class="card"><table><thead><tr><th>Sección</th><th class="tr">Registros</th><th>Estado</th></tr></thead><tbody>${Object.entries(res).map(([k,v])=>`<tr><td style="font-weight:500">${k}</td><td class="tr">${v.count}</td><td>${v.error?`<span class="pill pr" style="font-size:10px">${v.error.slice(0,40)}</span>`:'<span class="pill pg" style="font-size:10px">✓ OK</span>'}</td></tr>`).join('')}</tbody></table></div>`);
    } catch (err) {
      set('uz-txt', '<p style="font-size:14px;font-weight:500;margin-bottom:4px">Arrastra el Excel o haz clic</p><p style="font-size:12px;color:var(--text3)">Cuentas_2026.xlsx</p>');
      set('priv-result', `<div class="al ae">❌ Error: ${err.message}</div>`);
    }
  };
  reader.readAsArrayBuffer(file);
}

let _xlsx = null;
async function loadXLSX() {
  if (_xlsx) return _xlsx;
  await new Promise(r => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = r; document.head.appendChild(s); });
  _xlsx = window.XLSX; return _xlsx;
}

// ============================================================
