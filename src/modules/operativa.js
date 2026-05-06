// Modulos operativos auxiliares: financiaciones, devoluciones, equipo y objetivos
function renderFins() {
  const tot = D.fins.reduce((s, f) => s + (f.financiado || 0), 0);
  const coms = D.fins.reduce((s, f) => s + (f.comision || 0), 0);
  const dscs = D.fins.reduce((s, f) => s + (f.descuento || 0), 0);
  set('f-tot', eur(tot)); set('f-cnt', D.fins.length + ' operaciones');
  set('f-tkt', eur(D.fins.length ? tot / D.fins.length : 0));
  set('f-com', eur(coms)); set('f-dsc', eur(dscs));
  const bb = {}; D.fins.forEach(f => { if (f.ff) bb[f.ff] = (bb[f.ff] || 0) + (f.financiado || 0); });
  mkChart('c-bancos', 'doughnut', Object.keys(bb), [{ data: Object.values(bb), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 4 }], { cutout: '60%' });
  const bc = {}; D.fins.forEach(f => { if (f.canal) bc[f.canal] = (bc[f.canal] || 0) + 1; });
  mkChart('c-canal', 'doughnut', Object.keys(bc), [{ data: Object.values(bc), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 4 }], { cutout: '60%' });
  filterF();
}

function filterF() {
  const q = document.getElementById('f-q').value.toLowerCase();
  const rows = D.fins.filter(f => !q || [f.nombre, f.nif].some(x => x?.toLowerCase().includes(q)));
  document.getElementById('tb-fin').innerHTML = rows.slice(0,200).map(f =>
    `<tr><td style="font-size:12px;color:var(--text3)">${fdate(f.fecha)}</td><td><span class="pill pb" style="font-size:10px">${f.ff||'—'}</span></td><td style="font-size:12px">${f.nombre||'—'}</td><td style="font-size:12px">${f.canal||'—'}</td><td style="text-align:center">${f.meses||'—'}m</td><td class="tr" style="font-weight:600">${eur(f.financiado)}</td><td class="tr">${eur(f.banco)}</td><td><span class="pill ${f.estado==='PAGADA'?'pg':'pa'}" style="font-size:10px">${f.estado||'—'}</span></td></tr>`
  ).join('');
}

function renderDevs() {
  const tot = D.devs.reduce((s, d) => s + (d.euros_pagados || 0), 0);
  const dv = D.devs.reduce((s, d) => s + (d.euros_devolver || 0), 0);
  const pend = D.devs.filter(d => d.estado === 'PENDIENTE');
  set('d-tot', eur(tot)); set('d-cnt', D.devs.length + ' casos');
  set('d-dev', eur(dv));
  set('d-pend', eur(pend.reduce((s, d) => s + (d.euros_devolver||0), 0)));
  set('d-pend-s', pend.length + ' sin resolver');
  set('d-alert', pend.length > 0 ? `<div class="al aw">⚠️ <strong>${pend.length} devolución${pend.length>1?'es':''} pendiente${pend.length>1?'s':''}</strong> — ${pend.map(p=>p.paciente).join(', ')}</div>` : '');
  document.getElementById('tb-dev').innerHTML = D.devs.map(d =>
    `<tr><td style="font-size:12px;color:var(--text3)">${fdate(d.fecha_solicitud)}</td><td style="font-weight:500">${d.paciente||'—'}</td><td>${eur(d.euros_pagados)}</td><td style="font-weight:600">${eur(d.euros_devolver)}</td><td style="font-size:12px">${d.forma_pago||'—'}</td><td><span class="pill ${d.estado==='RESUELTA'?'pg':'pa'}">${d.estado||'—'}</span></td></tr>`
  ).join('');
}

function renderEquipo() {
  const pl = D.workers.filter(w => w.tipo === 'plantilla');
  const au = D.workers.filter(w => w.tipo === 'autonomo');
  set('e-pl', pl.length); set('e-au', au.length); set('e-tot', D.workers.length);
  const ini = n => n.split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  document.getElementById('e-grid').innerHTML = pl.map((w,i) =>
    `<div style="background:var(--bg2);border-radius:11px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start"><div style="width:36px;height:36px;border-radius:18px;background:${COLORS[i%COLORS.length]};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:600;flex-shrink:0">${ini(w.nombre)}</div><div><p style="font-weight:500;font-size:13px">${w.nombre}</p><p style="font-size:12px;color:var(--text2);margin-top:1px">${w.puesto||'—'}</p>${w.contrato?`<span class="pill pg" style="font-size:10px;margin-top:5px">${w.contrato}</span>`:''}</div></div>`
  ).join('');
  document.getElementById('tb-aut').innerHTML = au.map(w =>
    `<tr><td style="font-weight:500">${w.nombre}</td><td>${w.puesto||'—'}</td><td>${w.jornada||'—'}</td><td class="tr" style="font-weight:600">${w.tarifa_consulta?eur(w.tarifa_consulta):'—'}</td></tr>`
  ).join('');
}

const OBJ = {1:86000,2:88000,3:95000,4:86000,5:90000,6:90000,7:90000,8:55000,9:85000,10:90000,11:75000,12:70000};
function renderObjs() {
  const cajas = filtrarEmp(D.cajas, 'empresa');
  const cm = {}; cajas.forEach(c => { const m = +c.fecha.slice(5,7); cm[m] = (cm[m]||0) + (c.total||0); });
  const data = M.map((mes,i) => {
    const m=i+1, real=cm[m]||null, obj=OBJ[m], diff=real!=null?real-obj:null, pct=real!=null?(real/obj)*100:null;
    return { mes, m, real, obj, diff, pct };
  });
  const cd = data.filter(d => d.real != null);
  const cum = cd.filter(d => d.diff >= 0).length;
  const tR = cd.reduce((s,d)=>s+(d.real||0),0), tO = cd.reduce((s,d)=>s+d.obj,0);
  set('o-cum', cum + ' / ' + cd.length); set('o-cum-s', 'Meses con datos');
  set('o-pct', tO > 0 ? ((tR/tO)*100).toFixed(1)+'%' : '—'); set('o-pct-s', eur(tR)+' vs '+eur(tO));
  const dv = tR - tO; set('o-dev', eur(dv)); setC('o-dev', 'mv '+(dv>=0?'up':'dn'));
  mkChart('c-obj', 'bar', MS, [
    { label: 'Real', data: data.map(d=>d.real||0), backgroundColor: '#1B5FA8', borderRadius: 5, barPercentage: 0.6 },
    { label: 'Objetivo', data: data.map(d=>d.obj), backgroundColor: 'rgba(27,95,168,0.2)', borderRadius: 5, barPercentage: 0.6 },
  ]);
  document.getElementById('tb-obj').innerHTML = data.map(d =>
    `<tr><td style="font-weight:500">${d.mes}</td><td class="tr">${eur(d.obj)}</td><td class="tr">${d.real!=null?eur(d.real):'—'}</td><td class="tr" style="font-weight:600;color:${d.diff==null?'var(--text3)':d.diff>=0?'var(--green)':'var(--red)'}">${d.diff!=null?(d.diff>=0?'+':'')+eur(d.diff):'—'}</td><td class="tr">${d.pct!=null?d.pct.toFixed(1)+'%':'—'}</td><td>${d.real==null?'<span class="pill pz">Pendiente</span>':d.diff>=0?'<span class="pill pg">✓ Cumplido</span>':'<span class="pill pr">No cumplido</span>'}</td></tr>`
  ).join('');
}

// ============================================================
