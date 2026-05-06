// Modulo Movimientos bancarios - codigo productivo extraido de app.js v43
async function loadOpenBankingInstitutions() {
  try {
    setOBStatus('Cargando conectores bancarios de Powens para España...');
    const data = await openBankingCall('institutions', { country: 'ES' });
    const target = ['caixa','caixabank','bbva','sabadell','cajamar','tajamar','laboral','kutxa'];
    const all = Array.isArray(data.institutions) ? data.institutions : [];
    const filtered = all.filter(b => target.some(t => normTxt((b.name || '') + ' ' + (b.id || '') + ' ' + (b.uuid || '')).includes(t)));
    const banks = filtered.length ? filtered : all;
    const sel = document.getElementById('ob-bank-select');
    sel.innerHTML = '<option value="">Selecciona banco</option>' + banks.map(b => {
      const id = b.uuid || b.id;
      const nm = (b.name || '').replace(/"/g,'&quot;');
      return `<option value="${id}" data-name="${nm}" data-id-connector="${b.id || ''}">${b.name} · ${b.id || b.uuid}</option>`;
    }).join('');
    setOBStatus(`${banks.length} conectores cargados. Selecciona uno para iniciar el Webview de Powens.`, 'ok');
  } catch (err) {
    console.error(err);
    setOBStatus(err.message || String(err), 'err');
  }
}
async function createBankConnection() {
  try {
    const sel = document.getElementById('ob-bank-select');
    const institution_id = sel.value;
    if (!institution_id) return alert('Selecciona un banco.');
    const banco = sel.selectedOptions[0]?.dataset?.name || sel.selectedOptions[0]?.textContent || institution_id;
    const id_connector = sel.selectedOptions[0]?.dataset?.idConnector || '';
    const empresa = document.getElementById('ob-empresa').value;
    const alias = document.getElementById('ob-alias').value.trim() || `${banco} · ${empresa}`;
    setOBStatus('Creando enlace seguro de Powens Webview...');
    const redirect_url = window.location.origin + window.location.pathname + '?powens_return=1';
    const data = await openBankingCall('create_connection', { institution_id, id_connector, banco, empresa, alias, redirect_url });
    if (data.link) {
      setOBStatus('Redirigiendo a Powens para autorizar el banco...', 'ok');
      window.location.href = data.link;
    } else {
      setOBStatus('Conexión creada, pero Powens no devolvió enlace.', 'err');
    }
  } catch (err) {
    console.error(err);
    setOBStatus(err.message || String(err), 'err');
  }
}
async function completeReturnedBankConnection() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('powens_return') && !params.has('code') && !params.has('connection_id') && !params.has('connection_ids') && !params.has('id_connection') && !params.has('error')) return;
  const returnedError = params.get('error') || params.get('error_description') || '';
  if (returnedError) {
    setOBStatus('Powens no completó la autorización: ' + returnedError + '. La conexión no se usará hasta reconectar y obtener token.', 'err');
    history.replaceState({}, document.title, window.location.pathname);
    return;
  }
  try {
    setOBStatus('Completando conexión bancaria de Powens...');
    const code = params.get('code') || '';
    const connection_id = params.get('connection_id') || params.get('id_connection') || '';
    const connection_ids = params.get('connection_ids') || '';
    const state = params.get('state') || '';
    if (!code && !connection_id && !connection_ids) throw new Error('Powens no devolvió code ni connection_id. Hay que reconectar desde Webview.');
    await openBankingCall('complete_connection', { code, connection_id, connection_ids, state });
    setOBStatus('Conexión bancaria completada. Sincronizando datos...', 'ok');
    await openBankingCall('sync_all', {});
    await loadDB();
    history.replaceState({}, document.title, window.location.pathname);
  } catch (err) {
    console.warn(err);
    setOBStatus('No se pudo completar automáticamente. Usa Reconectar o trabaja con extractos Excel/CSV. ' + (err.message || ''), 'err');
  }
}
async function syncBankConnection(id) {
  try {
    const conn = (D.bankConnections || []).find(c => String(c.id) === String(id));
    if (conn && !['connected','active'].includes(String(conn.status || '').toLowerCase())) {
      throw new Error('Esta conexión está pendiente/incompleta. Pulsa Reconectar o elimina la fila.');
    }
    setOBStatus('Sincronizando banco con Powens...');
    const data = await openBankingCall('sync_connection', { connection_id: id });
    setOBStatus(`Sincronizado: ${data.inserted || 0} movimientos procesados.`, 'ok');
    await loadDB();
  } catch (err) {
    console.error(err);
    setOBStatus(err.message || String(err), 'err');
  }
}
async function syncAllBankConnections() {
  try {
    setOBStatus('Sincronizando todas las conexiones Powens...');
    const data = await openBankingCall('sync_all', {});
    setOBStatus(`Sincronización completada: ${data.inserted || 0} movimientos procesados.`, 'ok');
    await loadDB();
  } catch (err) {
    console.error(err);
    setOBStatus(err.message || String(err), 'err');
  }
}
function renderBankConnections() {
  const tbody = document.getElementById('tb-bank-connections');
  if (!tbody) return;
  const rows = D.bankConnections || [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text3)">Sin bancos conectados todavía. Carga bancos Powens y crea la conexión Webview.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(c => {
    const validUntil = c.consent_expires_at ? new Date(c.consent_expires_at).toLocaleDateString('es-ES') : '—';
    const status = c.status || 'pendiente';
    const connected = status === 'connected' || status === 'active';
    const pill = connected ? 'pg' : (status === 'error' ? 'pr' : 'pa');
    const actions = connected
      ? `<button class="eb" onclick="syncBankConnection('${c.id}')">Actualizar</button>`
      : `<button class="eb" onclick="createBankConnection()">Reconectar</button> <button class="eb" onclick="deleteBankConnection('${c.id}')">Eliminar</button>`;
    const statusLabel = status === 'webview_created' || status === 'created' ? 'pendiente autorización' : status;
    return `<tr><td style="font-weight:600">${c.banco || c.institution_id || 'Banco'}</td><td>${c.empresa || ''}</td><td>${safeAccount(c.alias || c.account_iban || c.cuenta || '')}</td><td><span class="pill ${pill}">${statusLabel}</span></td><td>${validUntil}</td><td>${c.last_sync_at ? new Date(c.last_sync_at).toLocaleString('es-ES') : '—'}</td><td>${actions}</td></tr>`;
  }).join('');
}

async function deleteBankConnection(id) {
  if (!confirm('Eliminar esta conexión bancaria pendiente/incompleta?')) return;
  try {
    if (sb) {
      const { error } = await sb.from('bank_connections').delete().eq('id', id);
      if (error) throw error;
    }
    D.bankConnections = (D.bankConnections || []).filter(c => String(c.id) !== String(id));
    setOBStatus('Conexión eliminada.', 'ok');
    renderBankConnections();
  } catch (err) {
    console.error(err);
    setOBStatus('No se pudo eliminar: ' + (err.message || err), 'err');
  }
}

// ============================================================
// MOVIMIENTOS BANCARIOS
// ============================================================
function bankMoveKey(m) {
  return [m.empresa || '', m.fecha || '', m.banco || '', m.cuenta || '', m.concepto || '', m.referencia || '', Number(m.importe)||0, Number(m.saldo)||0]
    .map(x => normTxt(String(x))).join('|');
}
function loadBankMovementsLocal() {
  try { return JSON.parse(localStorage.getItem('bank_movimientos_backup') || '[]'); } catch (_) { return []; }
}
function saveBankMovementsLocal() {
  localStorage.setItem('bank_movimientos_backup', JSON.stringify(D.movimientos || []));
}
function bankMovementDbPayload(m, batchId=null) {
  const payload = {
    id: String(m.id || '').trim(),
    empresa: m.empresa || '',
    fecha: m.fecha || null,
    fecha_valor: m.fecha_valor || m.fecha || null,
    banco: m.banco || '',
    cuenta: m.cuenta || '',
    iban_mask: m.iban_mask || maskIban(m.cuenta || ''),
    concepto: m.concepto || '',
    referencia: m.referencia || '',
    forma_pago: m.forma_pago || '',
    importe: Number(m.importe) || 0,
    saldo: Number(m.saldo) || 0,
    estado_validacion: m.estado_validacion || 'pendiente',
    validado: !!m.validado,
    es_nuevo: m.es_nuevo !== false,
    incidencia: !!m.incidencia,
    nota_incidencia: m.nota_incidencia || '',
    cuenta_asociada: m.cuenta_asociada || '',
    categoria_asociada: m.categoria_asociada || '',
    tipo_movimiento: m.tipo_movimiento || (Number(m.importe) >= 0 ? 'ingreso' : 'gasto'),
    estado_clasificacion: m.estado_clasificacion || 'sin_clasificar',
    proveedor_asociado: m.proveedor_asociado || '',
    regla_id: m.regla_id || '',
    estado_conciliacion: m.estado_conciliacion || 'sin_conciliar',
    entidad_relacionada_tipo: m.entidad_relacionada_tipo || '',
    entidad_relacionada_id: m.entidad_relacionada_id || '',
    entidad_relacionada_label: m.entidad_relacionada_label || '',
    sugerencia_conciliacion_tipo: m.sugerencia_conciliacion_tipo || '',
    sugerencia_conciliacion_id: m.sugerencia_conciliacion_id || '',
    sugerencia_conciliacion_label: m.sugerencia_conciliacion_label || '',
    impacto_resultado: !!m.impacto_resultado,
    impacto_tesoreria: m.impacto_tesoreria !== false,
    impacto_balance: !!m.impacto_balance,
    es_intercompany: !!m.es_intercompany,
    tipo_intercompany: m.tipo_intercompany || '',
    empresa_origen: m.empresa_origen || '',
    empresa_destino: m.empresa_destino || '',
    movimiento_relacionado_id: m.movimiento_relacionado_id || '',
    nota_intercompany: m.nota_intercompany || '',
    archivo_origen: m.archivo_origen || '',
    origen: m.origen || 'extracto_manual',
    formato_banco: m.formato_banco || '',
    import_batch_id: batchId || m.import_batch_id || null,
    duplicate_key: m.duplicate_key || bankMoveKey(m),
    fuente_prioritaria: m.fuente_prioritaria || 'banco',
    requiere_conciliacion: m.requiere_conciliacion !== false,
    fecha_importacion: m.fecha_importacion || new Date().toISOString(),
    uploaded_at: m.uploaded_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: currentUser?.id || null
  };
  return payload;
}
async function createBankImportBatch(meta, total, added, duplicates) {
  if (!sb) return null;
  const row = {
    empresa: meta?.empresa || document.getElementById('bank-import-empresa')?.value || '',
    banco: meta?.banco || '',
    cuenta_alias: meta?.cuenta_alias || document.getElementById('bank-import-alias')?.value || '',
    formato_banco: meta?.formato_banco || document.getElementById('bank-import-format')?.value || 'auto',
    archivo_nombre: meta?.archivo_nombre || '',
    registros_total: total || 0,
    registros_nuevos: added || 0,
    registros_duplicados: duplicates || 0,
    estado: 'procesado'
  };
  const { data, error } = await sb.from('bank_import_batches').insert(row).select('id').single();
  if (error) { console.warn('[Import batch] No se pudo crear lote:', error.message); return null; }
  return data?.id || null;
}
async function saveBankMovementsSupabase(importMeta=null) {
  // Guardamos una copia local solo como respaldo técnico, pero la fuente real es Supabase.
  saveBankMovementsLocal();
  if (!sb) throw new Error('No hay conexión con Supabase. Revisa Configuración.');
  const { data: sess } = await sb.auth.getSession();
  if (!sess?.session) throw new Error('Debes iniciar sesión para guardar movimientos bancarios en Supabase.');
  if (!(D.movimientos || []).length) return { saved: 0, batchId: null };

  const batchId = importMeta ? await createBankImportBatch(importMeta, importMeta.total, importMeta.added, importMeta.duplicates) : null;

  // Importante: Supabase/Postgres no permite que un mismo UPSERT contenga dos filas
  // con la misma clave de conflicto. Si un extracto trae duplicados o quedaron copias
  // de versiones anteriores en localStorage, primero consolidamos por ID.
  const byId = new Map();
  for (const m of (D.movimientos || [])) {
    const row = bankMovementDbPayload(m, batchId);
    if (!row.id) row.id = 'mb_' + btoa(unescape(encodeURIComponent(row.duplicate_key || bankMoveKey(row)))).replace(/[^a-zA-Z0-9]/g,'').slice(0,42);
    // Si hay duplicado, conservamos el más reciente / más completo.
    const prev = byId.get(row.id);
    if (!prev || String(row.updated_at || '') >= String(prev.updated_at || '')) byId.set(row.id, row);
  }
  const rows = Array.from(byId.values());

  // También dejamos D.movimientos limpio para que no vuelva a intentar subir duplicados.
  D.movimientos = rows.map(r => ({ ...r })).sort((a,b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')));
  saveBankMovementsLocal();

  for (let i = 0; i < rows.length; i += 250) {
    const chunk = rows.slice(i, i + 250);
    const { error } = await sb.from('movimientos_bancarios').upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error('Supabase no guardó los movimientos bancarios: ' + error.message);
  }
  return { saved: rows.length, batchId };
}
function loadBankRulesLocal() {
  try { return JSON.parse(localStorage.getItem('bank_rules') || '[]'); } catch (_) { return []; }
}
function saveBankRulesLocal() { localStorage.setItem('bank_rules', JSON.stringify(D.reglasBanco || [])); }
async function saveBankRulesSupabase() {
  saveBankRulesLocal();
  if (!sb) return;
  try {
    const rows = (D.reglasBanco || []).map(r => ({...r, activa: r.activa !== false}));
    if (rows.length) {
      const { error } = await sb.from('reglas_conciliacion_bancaria').upsert(rows, { onConflict: 'id' });
      if (error) console.warn('[Reglas conciliación] No se pudieron guardar en Supabase. Uso localStorage.', error.message);
    }
  } catch (err) { console.warn('[Reglas conciliación] Tabla no disponible. Uso localStorage.', err.message || err); }
}
function cuentaAsociadaCategorias() {
  const setCats = new Set((D.gastos || []).map(g => (g.fuente_gasto || g.categoria || '').trim()).filter(Boolean));
  // Cuentas de ingresos necesarias para movimientos bancarios positivos y traspasos internos.
  ['Ventas', 'T. Intercompany', 'Traspaso entre empresas'].forEach(c => setCats.add(c));
  return Array.from(setCats).sort((a,b)=>a.localeCompare(b,'es'));
}
function gastoCategorias() {
  return cuentaAsociadaCategorias();
}

function intercompanyTypeLabel(t) {
  if (t === 'dividendo') return 'Reparto de dividendos';
  if (t === 'prestamo_intercompany') return 'Préstamo intersocietario';
  if (t === 'devolucion_prestamo_intercompany') return 'Devolución préstamo intersocietario';
  if (t === 'transferencia_interna') return 'Transferencia interna';
  return 'No intercompany';
}
function inferIntercompanyFromConcept(m) {
  const txt = normTxt([m.concepto, m.referencia, m.cuenta_asociada, m.categoria_asociada].join(' '));
  const empresa = String(m.empresa || '');
  const isCorpBridge = (txt.includes('corporacion') || txt.includes('corporación') || empresa === 'Corporacion') && txt.includes('bridge');
  const isBridgeVallecas = (txt.includes('bridge') || empresa === 'Bridge') && (txt.includes('vallecas') || txt.includes('vallecas las'));
  if (txt.includes('dividendo') || txt.includes('reparto') || isCorpBridge) {
    return { es_intercompany: true, tipo_intercompany: 'dividendo', empresa_origen: 'Corporacion', empresa_destino: 'Bridge', tipo_movimiento: 'intercompany', cuenta_asociada: 'Reparto de dividendos', categoria_asociada: 'Reparto de dividendos', impacto_resultado: false, impacto_tesoreria: true, impacto_balance: true };
  }
  if (txt.includes('prestamo intersocietario') || txt.includes('préstamo intersocietario') || txt.includes('prestamo intercompany') || txt.includes('préstamo intercompany') || isBridgeVallecas) {
    return { es_intercompany: true, tipo_intercompany: 'prestamo_intercompany', empresa_origen: 'Bridge', empresa_destino: 'Vallecas Las', tipo_movimiento: 'intercompany', cuenta_asociada: 'Préstamo intersocietario', categoria_asociada: 'Préstamo intersocietario', impacto_resultado: false, impacto_tesoreria: true, impacto_balance: true };
  }
  return null;
}
function applyIntercompanyToMovement(m, overwrite=false) {
  if (!m) return m;
  if (!overwrite && m.es_intercompany) return m;
  const inf = inferIntercompanyFromConcept(m);
  if (!inf) return m;
  Object.assign(m, inf);
  m.estado_clasificacion = m.estado_clasificacion === 'auto' ? 'auto' : 'intercompany';
  return m;
}
async function aplicarIntercompany(overwrite=false) {
  (D.movimientos || []).forEach(m => applyIntercompanyToMovement(m, overwrite));
  await saveBankMovementsSupabase();
  renderMovimientos();
}
function setMovimientoIntercompany(id, tipo) {
  const m = (D.movimientos || []).find(x => x.id === id);
  if (!m) return;
  if (!tipo) {
    m.es_intercompany = false;
    m.tipo_intercompany = '';
    m.empresa_origen = '';
    m.empresa_destino = '';
    m.impacto_resultado = false;
    m.estado_conciliacion = 'sin_conciliar';
    m.entidad_relacionada_tipo = '';
    m.entidad_relacionada_id = '';
    m.entidad_relacionada_label = '';
    m.tipo_movimiento = Number(m.importe) >= 0 ? 'ingreso' : 'gasto';
  } else if (tipo === 'dividendo') {
    Object.assign(m, { estado_conciliacion:'conc_intercompany', entidad_relacionada_tipo:'intercompany', es_intercompany:true, tipo_intercompany:'dividendo', empresa_origen:'Corporacion', empresa_destino:'Bridge', tipo_movimiento:'intercompany', cuenta_asociada:'Reparto de dividendos', categoria_asociada:'Reparto de dividendos', impacto_resultado:false, impacto_tesoreria:true, impacto_balance:true });
  } else if (tipo === 'prestamo_intercompany') {
    Object.assign(m, { estado_conciliacion:'conc_intercompany', entidad_relacionada_tipo:'intercompany', es_intercompany:true, tipo_intercompany:'prestamo_intercompany', empresa_origen:'Bridge', empresa_destino:'Vallecas Las', tipo_movimiento:'intercompany', cuenta_asociada:'Préstamo intersocietario', categoria_asociada:'Préstamo intersocietario', impacto_resultado:false, impacto_tesoreria:true, impacto_balance:true });
  }
  m.estado_clasificacion = tipo ? 'intercompany' : 'sin_clasificar';
  saveBankMovementsSupabase();
  renderMovimientos();
}
function renderIntercompanyTable(all) {
  const tb = document.getElementById('tb-intercompany');
  if (!tb) return;
  const rows = (all || []).filter(m => m.es_intercompany || m.tipo_movimiento === 'intercompany').slice(0,150);
  tb.innerHTML = rows.map(m => `<tr><td>${fdate(m.fecha)}</td><td>${intercompanyTypeLabel(m.tipo_intercompany)}</td><td>${m.empresa_origen || '—'}</td><td>${m.empresa_destino || '—'}</td><td>${m.concepto || '—'}</td><td class="tr" style="font-weight:700">${eur(Math.abs(Number(m.importe)||0))}</td><td><span class="pill pg">Excluido resultado</span></td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:22px">Sin operaciones intercompany detectadas todavía.</td></tr>';
}

function bankConceptSignature(text) {
  let s = normTxt(String(text || ''));
  s = s.replace(/\b(es|iban|ccc)\s*[a-z0-9]{6,}\b/g, ' ');
  s = s.replace(/[a-z]{2}\d{8,}/g, ' ');
  s = s.replace(/\b\d{4,}\b/g, ' ');
  s = s.replace(/x{3,}\d*/g, ' ');
  s = s.replace(/[^a-záéíóúüñ\s]/g, ' ');
  const stop = new Set(['pago','recibo','factura','cargo','abono','rem','num','numero','ref','referencia','operacion','movimiento','fecha','tarj','tarjeta','compra','transferencia','traspaso','sepa','orden','adeudo','emitido','recibido','cuenta','cliente','comerc']);
  const words = s.split(/\s+/).map(w => w.trim()).filter(w => w.length > 2 && !stop.has(w));
  // Quitamos duplicados conservando orden para que reglas parecidas sean estables.
  const seen = new Set();
  const out = [];
  for (const w of words) { if (!seen.has(w)) { seen.add(w); out.push(w); } }
  return out.slice(0, 8).join(' ');
}
function bankConceptTokens(text) {
  return bankConceptSignature(text).split(/\s+/).filter(Boolean);
}
function bankConceptSimilar(ruleText, conceptText) {
  const rSig = bankConceptSignature(ruleText);
  const cSig = bankConceptSignature(conceptText);
  if (!rSig || !cSig) return false;
  if (cSig.includes(rSig) || rSig.includes(cSig)) return true;
  const r = bankConceptTokens(ruleText);
  const c = new Set(bankConceptTokens(conceptText));
  if (!r.length) return false;
  const hits = r.filter(x => c.has(x)).length;
  // Para reglas cortas exigimos coincidencia total; para largas permitimos pequeñas diferencias.
  if (r.length <= 2) return hits === r.length;
  return hits >= Math.max(2, Math.ceil(r.length * 0.67));
}
function tipoFromCuentaAsociada(cat, importe) {
  if (cat === 'Ventas') return 'ingreso';
  if (cat === 'T. Intercompany' || cat === 'Reparto de dividendos' || cat === 'Préstamo intersocietario') return 'intercompany';
  if (cat === 'Traspaso entre empresas') return 'traspaso';
  return Number(importe) >= 0 ? 'ingreso' : 'gasto';
}
function applyCuentaImpact(m, cat, source='auto') {
  if (!m) return m;
  m.cuenta_asociada = cat || '';
  m.categoria_asociada = cat || '';
  m.estado_clasificacion = cat ? source : 'sin_clasificar';
  if (!cat) return m;
  if (cat === 'Ventas') {
    m.tipo_movimiento = 'ingreso';
    m.impacto_resultado = true;
    m.impacto_tesoreria = true;
    m.es_intercompany = false;
    m.tipo_intercompany = '';
    if (!m.estado_conciliacion || m.estado_conciliacion === 'sin_conciliar') m.estado_conciliacion = 'sin_conciliar';
  } else if (cat === 'T. Intercompany') {
    m.tipo_movimiento = 'intercompany';
    m.es_intercompany = true;
    m.tipo_intercompany = m.tipo_intercompany || 'transferencia_interna';
    m.impacto_resultado = false;
    m.impacto_tesoreria = true;
    m.impacto_balance = true;
    m.estado_conciliacion = 'conc_intercompany';
    m.entidad_relacionada_tipo = 'intercompany';
  } else if (cat === 'Traspaso entre empresas') {
    m.tipo_movimiento = 'traspaso';
    m.es_intercompany = false;
    m.tipo_intercompany = '';
    m.empresa_origen = m.empresa_origen || m.empresa || '';
    m.empresa_destino = m.empresa_destino || m.empresa || '';
    m.impacto_resultado = false;
    m.impacto_tesoreria = true;
    m.impacto_balance = false;
    m.estado_conciliacion = 'no_operativo';
    m.entidad_relacionada_tipo = 'traspaso';
  } else {
    m.tipo_movimiento = Number(m.importe) >= 0 ? 'ingreso' : 'gasto';
    m.impacto_resultado = true;
    m.impacto_tesoreria = true;
  }
  return m;
}
function ruleMatchesMovement(rule, m) {
  if (!rule || rule.activa === false || !m) return false;
  const txt = String(rule.texto_contiene || rule.texto || '').trim();
  if (!txt) return false;
  const concepto = [m.concepto, m.referencia].join(' ');
  if (!bankConceptSimilar(txt, concepto)) return false;
  if (rule.empresa && rule.empresa !== 'Global' && m.empresa && rule.empresa !== m.empresa) return false;
  if (rule.banco && normTxt(rule.banco) && normTxt(m.banco) && !normTxt(m.banco).includes(normTxt(rule.banco))) return false;
  return true;
}
function applyBankRulesToMovement(m, overwrite=false) {
  if (!m || (!overwrite && (m.cuenta_asociada || m.categoria_asociada || m.tipo_movimiento === 'traspaso'))) return m;
  const rules = (D.reglasBanco || []).filter(r => r.activa !== false).sort((a,b)=>(Number(b.prioridad)||0)-(Number(a.prioridad)||0));
  const rule = rules.find(r => ruleMatchesMovement(r, m));
  if (!rule) {
    if (!m.tipo_movimiento) m.tipo_movimiento = Number(m.importe) >= 0 ? 'ingreso' : 'gasto';
    if (!m.estado_clasificacion) m.estado_clasificacion = 'sin_clasificar';
    return m;
  }
  const cat = rule.categoria_destino || rule.cuenta_destino || '';
  applyCuentaImpact(m, cat, 'auto');
  m.tipo_movimiento = rule.tipo || tipoFromCuentaAsociada(cat, m.importe);
  m.proveedor_asociado = rule.proveedor_sugerido || m.proveedor_asociado || '';
  m.regla_id = rule.id;
  m.estado_clasificacion = 'auto';
  if (rule.tipo === 'dividendo') {
    Object.assign(m, { estado_conciliacion:'conc_intercompany', entidad_relacionada_tipo:'intercompany', es_intercompany:true, tipo_intercompany:'dividendo', empresa_origen:'Corporacion', empresa_destino:'Bridge', tipo_movimiento:'intercompany', cuenta_asociada:'Reparto de dividendos', categoria_asociada:'Reparto de dividendos', impacto_resultado:false, impacto_tesoreria:true, impacto_balance:true });
  }
  if (rule.tipo === 'prestamo_intercompany') {
    Object.assign(m, { estado_conciliacion:'conc_intercompany', entidad_relacionada_tipo:'intercompany', es_intercompany:true, tipo_intercompany:'prestamo_intercompany', empresa_origen:'Bridge', empresa_destino:'Vallecas Las', tipo_movimiento:'intercompany', cuenta_asociada:'Préstamo intersocietario', categoria_asociada:'Préstamo intersocietario', impacto_resultado:false, impacto_tesoreria:true, impacto_balance:true });
  }
  return m;
}
async function aplicarReglasBancarias(overwrite=false) {
  (D.movimientos || []).forEach(m => { applyBankRulesToMovement(m, overwrite); applyIntercompanyToMovement(m, overwrite); });
  await saveBankMovementsSupabase();
  renderMovimientos();
  renderReglasBancarias();
}
function ruleIdFromFields(texto, empresa, banco, tipo, cat) {
  const raw = [texto, empresa || '', banco || '', tipo || '', cat || ''].map(x=>normTxt(String(x))).join('|');
  try { return 'rbc_' + btoa(unescape(encodeURIComponent(raw))).replace(/[^a-zA-Z0-9]/g,'').slice(0,38); }
  catch(e) { return 'rbc_' + raw.replace(/[^a-zA-Z0-9]/g,'_').slice(0,38); }
}
async function addBankRuleFromForm(textoArg, catArg, tipoArg, empresaArg, bancoArg, proveedorArg) {
  const texto = String(textoArg ?? document.getElementById('rule-text')?.value ?? '').trim();
  const cat = String(catArg ?? document.getElementById('rule-cat')?.value ?? '').trim();
  let tipo = String(tipoArg ?? document.getElementById('rule-tipo')?.value ?? 'gasto').trim();
  const empresa = empresaArg || (empresaActual === 'Global' ? 'Global' : empresaActual);
  const banco = bancoArg || '';
  if (!texto || !cat) { alert('Indica texto del concepto y cuenta destino'); return; }
  if (cat === 'Ventas') tipo = 'ingreso';
  if (cat === 'T. Intercompany') tipo = 'intercompany';
  const rule = {
    id: ruleIdFromFields(texto, empresa, banco, tipo, cat),
    empresa, banco, texto_contiene: texto, tipo,
    categoria_destino: cat, proveedor_sugerido: proveedorArg || '', forma_pago: '', prioridad: 100, activa: true,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  const ix = (D.reglasBanco || []).findIndex(r => r.id === rule.id);
  if (ix >= 0) D.reglasBanco[ix] = {...D.reglasBanco[ix], ...rule}; else D.reglasBanco.push(rule);
  await saveBankRulesSupabase();
  await aplicarReglasBancarias(false);
  const inp = document.getElementById('rule-text'); if (inp) inp.value = '';
}
async function toggleBankRule(id, active) {
  const r = (D.reglasBanco || []).find(x=>x.id===id); if (!r) return;
  r.activa = !!active; r.updated_at = new Date().toISOString();
  await saveBankRulesSupabase(); renderReglasBancarias(); renderMovimientos();
}
async function setMovimientoCategoria(id, value) {
  const m = (D.movimientos || []).find(x => x.id === id); if (!m) return;
  applyCuentaImpact(m, value, value ? 'manual' : 'sin_clasificar');
  await saveBankMovementsSupabase(); renderMovimientos();
}
function suggestedRuleText(concepto) {
  return bankConceptSignature(concepto);
}
async function learnRuleFromMovimiento(id) {
  const m = (D.movimientos || []).find(x => x.id === id);
  if (!m || !m.cuenta_asociada) { alert('Primero asigna una cuenta asociada'); return; }
  const texto = suggestedRuleText([m.concepto, m.referencia].join(' '));
  if (!texto) { alert('No he podido extraer un patrón de este concepto'); return; }
  const tipo = tipoFromCuentaAsociada(m.cuenta_asociada, m.importe);
  const before = (D.movimientos || []).filter(x => !x.cuenta_asociada && ruleMatchesMovement({texto_contiene:texto, empresa:m.empresa || empresaActual, banco:m.banco || '', activa:true}, x)).length;
  await addBankRuleFromForm(texto, m.cuenta_asociada, tipo, m.empresa || empresaActual, m.banco || '', m.proveedor_asociado || '');
  const after = (D.movimientos || []).filter(x => x.regla_id && x.cuenta_asociada === m.cuenta_asociada && ruleMatchesMovement({texto_contiene:texto, empresa:m.empresa || empresaActual, banco:m.banco || '', activa:true}, x)).length;
  alert(`Regla aprendida: "${texto}" → ${m.cuenta_asociada}. Se aplicará automáticamente a movimientos con concepto similar. Coincidencias encontradas: ${Math.max(before, after)}`);
}
function renderReglasBancarias() {
  const catSel = document.getElementById('rule-cat');
  if (catSel) {
    const cats = gastoCategorias();
    catSel.innerHTML = [''].concat(cats).map(c => `<option value="${c}">${c || 'Cuenta destino'}</option>`).join('');
  }
  const tbody = document.getElementById('tb-reglas-banco');
  if (!tbody) return;
  const rows = filterEmpresaFor(D.reglasBanco || [], empresaActual, 'empresa');
  tbody.innerHTML = rows.slice(0,80).map(r => `<tr><td style="font-weight:600">${r.texto_contiene || '—'}</td><td>${r.empresa || 'Global'}</td><td>${r.banco || 'Todos'}</td><td><span class="pill pb">${r.tipo || 'gasto'}</span></td><td>${r.categoria_destino || '—'}</td><td>${r.proveedor_sugerido || '—'}</td><td><input type="checkbox" ${r.activa !== false ? 'checked' : ''} onchange="toggleBankRule('${r.id}',this.checked)"></td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:18px">Sin reglas todavía. Añade una regla o aprende desde un movimiento validado.</td></tr>';
}

function pickAny(row, names) {
  const keys = Object.keys(row || {});
  const clean = v => normTxt(v).replace(/[^a-z0-9]/g, '');
  for (const n of names) {
    const target = clean(n);
    const k = keys.find(x => clean(x) === target) || keys.find(x => clean(x).includes(target) || target.includes(clean(x)));
    if (k && row[k] != null && row[k] !== '') return row[k];
  }
  return '';
}
function excelDateToISO(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0,10);
  }
  const s = String(v || '').trim();
  // Permite textos tipo "06/04/2026 Hora 13:16"
  const m = s.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
  if (m) return fixDate(m[1]);
  return fixDate(v) || (s.match(/^\d{4}-\d{2}-\d{2}/) ? s.slice(0,10) : null);
}
function inferEmpresaMovimiento(row, fileName) {
  const e = String(pickAny(row, ['Empresa', 'Sociedad', 'Clinica']) || '').trim();
  if (e) return e;
  const f = normTxt(fileName || '');
  if (f.includes('bridge')) return 'Bridge';
  if (f.includes('vallecas')) return 'Vallecas Las';
  return empresaActual !== 'Global' ? empresaActual : 'Corporacion';
}
function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  return String(v).trim();
}
function simpleTxt(v) { return normTxt(v).replace(/[^a-z0-9]/g, ''); }
function rowText(row) { return (row || []).map(cellText).filter(Boolean).join(' '); }
function findHeaderIndex(raw) {
  return raw.findIndex(r => {
    const keys = (r || []).map(simpleTxt).filter(Boolean);
    const hasDate = keys.some(t => ['fecha','fechavalor','fcontable','fvalor','foperativa','fechaoperacion','date'].includes(t) || t.includes('fecha'));
    const hasAmount = keys.some(t => ['importe','importeeur','amount','cargoabono','saldo'].includes(t) || t.includes('importe') || t.includes('saldo'));
    const hasConcept = keys.some(t => ['concepto','movimiento','descripcion','descripcion','detalle','observaciones','masdatos'].includes(t) || t.includes('concepto') || t.includes('movimiento'));
    return keys.length >= 3 && hasDate && hasAmount && hasConcept;
  });
}
function makeUniqueHeaders(arr) {
  const seen = {};
  return (arr || []).map((h, i) => {
    let base = String(h || ('Columna ' + (i + 1))).trim();
    if (!base) base = 'Columna ' + (i + 1);
    const k = simpleTxt(base) || ('col' + i);
    seen[k] = (seen[k] || 0) + 1;
    return seen[k] > 1 ? `${base} ${seen[k]}` : base;
  });
}
function detectBankContext(raw, fileName) {
  const manual = document.getElementById('bank-import-format')?.value || 'auto';
  const text = normTxt((fileName || '') + ' ' + (raw || []).slice(0, 35).map(rowText).join(' '));
  let banco = '';
  if (manual && manual !== 'auto') banco = manual;
  else if (text.includes('banco bilbao') || text.includes('bbva')) banco = 'BBVA';
  else if (text.includes('caixabank') || text.includes('la caixa') || text.includes('caixa')) banco = 'Caixa';
  else if (text.includes('sabadell') || text.includes('bancsabadell')) banco = 'Sabadell';
  else if (text.includes('cajamar') || text.includes('tajamar')) banco = 'Cajamar';
  else if (text.includes('laboral kutxa') || text.includes('kutxa')) banco = 'Laboral Kutxa';

  let cuenta = '';
  const all = (raw || []).slice(0, 45).map(rowText).join(' ');
  const iban = all.match(/ES[0-9A-Z\s\-]{18,40}/i);
  if (iban) cuenta = iban[0].replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 34);
  if (!cuenta) {
    const ccc = all.match(/\b\d{4}-\d{4}-\d{2}-\d{10}\b/);
    if (ccc) cuenta = ccc[0];
  }
  if (!cuenta) cuenta = document.getElementById('bank-import-alias')?.value || '';

  let alias = document.getElementById('bank-import-alias')?.value || '';
  if (!alias && banco) alias = banco + ' ' + (cuenta ? '· ' + maskIban(cuenta) : '');
  return { banco, cuenta, alias, formato: banco || manual || 'auto' };
}
function buildRowsFromBankSheet(raw, fileName) {
  const headerIdx = findHeaderIndex(raw);
  if (headerIdx < 0) throw new Error('No he encontrado cabecera bancaria reconocible. Formatos soportados: BBVA, Caixa, Sabadell, Cajamar y Laboral Kutxa.');
  const ctx = detectBankContext(raw, fileName);
  const headers = makeUniqueHeaders(raw[headerIdx]);
  return raw.slice(headerIdx + 1).map((arr, idx) => {
    const o = { __context: ctx, __rownum: headerIdx + idx + 2 };
    headers.forEach((h, i) => { o[h] = arr[i]; });
    return o;
  });
}
function joinedConcept(row) {
  const parts = [
    pickAny(row, ['Concepto','Descripción','Descripcion','Detalle','Movimiento','Narrativa']),
    pickAny(row, ['Más datos','Mas datos','Observaciones','Detalle ampliado']),
    pickAny(row, ['Referencia 1','Referencia 2'])
  ].map(v => String(v || '').trim()).filter(Boolean);
  return Array.from(new Set(parts)).join(' · ').replace(/\s+/g, ' ').trim();
}
function normalizeBankMovement(row, fileName) {
  const ctx = row.__context || {};
  const fecha = excelDateToISO(pickAny(row, ['Fecha','F. CONTABLE','F CONTABLE','F. Operativa','F Operativa','Fecha operación','Fecha operacion','Date']))
    || excelDateToISO(pickAny(row, ['Fecha valor','F. VALOR','F Valor']));
  const fechaValor = excelDateToISO(pickAny(row, ['Fecha valor','F. VALOR','F Valor']));
  const importeRaw = pickAny(row, ['Importe','Importe EUR','Amount','Cargo/Abono','Importe operación','Importe operacion']);
  const importe = parseNum(importeRaw);
  const saldo = parseNum(pickAny(row, ['Saldo','Balance','Saldo contable','Saldo disponible','Saldo Posterior']));
  const concepto = joinedConcept(row);
  if (!fecha || Math.abs(importe) < 0.0001 || /^total/i.test(String(concepto || ''))) return null;
  const selectedEmpresa = document.getElementById('bank-import-empresa')?.value;
  const m = {
    id: '',
    empresa: (selectedEmpresa && selectedEmpresa !== 'auto') ? selectedEmpresa : inferEmpresaMovimiento(row, fileName),
    fecha,
    fecha_valor: fechaValor || fecha,
    banco: String(ctx.banco || pickAny(row, ['Banco', 'Entidad']) || '').trim(),
    cuenta: String(ctx.alias || ctx.cuenta || pickAny(row, ['Cuenta', 'IBAN', 'Número cuenta', 'Num cuenta']) || '').trim(),
    iban_mask: ctx.cuenta ? maskIban(ctx.cuenta) : '',
    concepto,
    referencia: String(pickAny(row, ['Referencia', 'Ref', 'Factura', 'Documento', 'Remesa', 'REMESA', 'Referencia 1', 'Referencia 2']) || '').trim(),
    forma_pago: String(pickAny(row, ['Forma de pago', 'Tipo', 'Canal', 'Código', 'CODIGO', 'CÓDIGO']) || '').trim(),
    importe,
    saldo,
    estado_validacion: 'pendiente',
    validado: false,
    es_nuevo: true,
    incidencia: false,
    nota_incidencia: '',
    cuenta_asociada: '',
    categoria_asociada: '',
    tipo_movimiento: Number(importe) >= 0 ? 'ingreso' : 'gasto',
    estado_clasificacion: 'sin_clasificar',
    proveedor_asociado: '',
    regla_id: '',
    estado_conciliacion: 'sin_conciliar',
    entidad_relacionada_tipo: '',
    entidad_relacionada_id: '',
    entidad_relacionada_label: '',
    impacto_resultado: false,
    impacto_tesoreria: true,
    archivo_origen: fileName || '',
    origen: 'extracto_manual',
    formato_banco: ctx.formato || document.getElementById('bank-import-format')?.value || 'auto',
    uploaded_at: new Date().toISOString()
  };
  m.id = 'mb_' + btoa(unescape(encodeURIComponent(bankMoveKey(m)))).replace(/[^a-zA-Z0-9]/g,'').slice(0,42);
  applyBankRulesToMovement(m, false);
  applyIntercompanyToMovement(m, false);
  return m;
}

function downloadTextFile(filename, content, mime='text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
async function downloadBankTemplate(kind='csv') {
  const rows = [
    ['Fecha','Empresa','Banco','Cuenta','Concepto','Referencia','Importe','Saldo','Forma de pago'],
    ['2026-04-30','Corporacion','BBVA','BBVA Corporación','AEAT MODELO 111','REC-001','-6099','25000','Domiciliación'],
    ['2026-04-30','Corporacion','Caixa','Caixa Corporación','TPV CAIXABANK','TPV-001','3200','28200','Tarjeta'],
    ['2026-04-30','Corporacion','BBVA','BBVA Corporación','DIVIDENDO CORPORACION A BRIDGE','INT-001','-20000','8200','Transferencia'],
    ['2026-04-30','Bridge','BBVA','BBVA Bridge','PRESTAMO INTERSOCIETARIO BRIDGE A VALLECAS','INT-002','-15000','5000','Transferencia']
  ];
  if (kind === 'xlsx') {
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
    XLSX.writeFile(wb, 'plantilla_movimientos_bancarios.xlsx');
    return;
  }
  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(';')).join('\n');
  downloadTextFile('plantilla_movimientos_bancarios.csv', csv);
}

async function handleBankMovementsFile(file) {
  if (!file) return;
  try {
    set('bank-upload-result', '<div class="al"><div class="sp"></div> Procesando movimientos bancarios multiformato...</div>');
    const XLSX = await loadXLSX();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: true, codepage: 65001 });
    let nuevos = [];
    let formatos = [];
    for (const shName of wb.SheetNames.slice(0, 3)) {
      const ws = wb.Sheets[shName];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: false });
      if (!raw || !raw.length) continue;
      let rows;
      try { rows = buildRowsFromBankSheet(raw, file.name); }
      catch(e) { continue; }
      const ctx = (rows[0] && rows[0].__context) || detectBankContext(raw, file.name);
      if (ctx.banco) formatos.push(ctx.banco);
      nuevos = nuevos.concat(rows.map(r => normalizeBankMovement(r, file.name)).filter(Boolean));
    }
    if (!nuevos.length) throw new Error('No se han detectado movimientos válidos. Revisa que el archivo sea un extracto de BBVA, Caixa, Sabadell, Cajamar o Laboral Kutxa.');
    const existing = new Map((D.movimientos || []).map(m => [bankMoveKey(m), m]));
    let added = 0;
    nuevos.forEach(m => {
      const key = bankMoveKey(m);
      if (!existing.has(key)) { existing.set(key, m); added++; }
    });
    D.movimientos = Array.from(existing.values()).sort((a,b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.uploaded_at).localeCompare(String(a.uploaded_at)));
    const detected = Array.from(new Set(formatos.filter(Boolean))).join(', ') || 'automático';
    const result = await saveBankMovementsSupabase({ archivo_nombre: file.name, banco: detected, formato_banco: detected, total: nuevos.length, added, duplicates: nuevos.length - added });
    await loadDB();
    set('bank-upload-result', `<div class="al as2">✓ ${added} movimiento(s) nuevo(s) guardado(s) en Supabase. ${nuevos.length - added} duplicado(s) descartado(s). Formato detectado: <strong>${detected}</strong>. Lote: ${result.batchId || 'sin lote'}.</div>`);
    renderMovimientos();
  } catch (err) {
    set('bank-upload-result', `<div class="al ae">❌ Error al importar movimientos: ${err.message}</div>`);
  } finally {
    const inp = document.getElementById('bank-file'); if (inp) inp.value = '';
  }
}
function getIngresoId(i) {
  const raw = [i.empresa||'', i.fecha||'', i.factura||'', i.concepto||'', i.proveedor||'', Number(i.importe)||0].join('|');
  try { return 'ing_' + btoa(unescape(encodeURIComponent(raw))).replace(/[^a-zA-Z0-9]/g,'').slice(0,48); }
  catch(e) { return 'ing_' + raw.replace(/[^a-zA-Z0-9]/g,'_').slice(0,48); }
}
function daysBetween(a,b) {
  const da = new Date(String(a||'').slice(0,10)); const db = new Date(String(b||'').slice(0,10));
  if (isNaN(da) || isNaN(db)) return 9999;
  return Math.abs(Math.round((da-db)/86400000));
}
function textScoreMove(a,b) {
  const A = normTxt(a || ''); const B = normTxt(b || '');
  if (!A || !B) return 0;
  let score = 0;
  const words = B.split(/\s+/).filter(w => w.length > 3).slice(0,8);
  words.forEach(w => { if (A.includes(w)) score += 2; });
  if (A.includes(B) || B.includes(A)) score += 8;
  return score;
}
function getMovementReconStatus(m) {
  if (!m) return 'sin_conciliar';
  if (m.es_intercompany || m.tipo_movimiento === 'intercompany') return 'conc_intercompany';
  if (m.estado_conciliacion && m.estado_conciliacion !== 'pendiente') return m.estado_conciliacion;
  if (m.entidad_relacionada_tipo === 'gasto') return 'conc_gasto';
  if (m.entidad_relacionada_tipo === 'ingreso') return 'conc_ingreso';
  if (m.tipo_movimiento === 'traspaso' || m.tipo_movimiento === 'financiacion' || m.tipo_movimiento === 'no_operativo') return 'no_operativo';
  return 'sin_conciliar';
}
function getMovementReconLabel(m) {
  const st = getMovementReconStatus(m);
  if (st === 'conc_gasto') return '<span class="pill pg">Gasto conciliado</span>';
  if (st === 'conc_ingreso') return '<span class="pill pg">Ingreso conciliado</span>';
  if (st === 'conc_intercompany') return '<span class="pill pb">Intercompany</span>';
  if (st === 'no_operativo') return '<span class="pill pz">No operativo</span>';
  return '<span class="pill pr">Sin conciliar</span>';
}
function getImpactLabel(m) {
  const st = getMovementReconStatus(m);
  if (st === 'sin_conciliar') return '<span class="pill pa">Pendiente</span>';
  if (st === 'conc_intercompany') return '<span class="pill pb">Tesorería + balance</span>';
  if (st === 'no_operativo') return '<span class="pill pz">Solo tesorería</span>';
  return '<span class="pill pg">Solo confirma pago/cobro</span>';
}
function movementReconciliationSuggestion(m) {
  if (!m) return null;
  if (getMovementReconStatus(m) !== 'sin_conciliar') return null;
  const amount = Math.abs(Number(m.importe)||0);
  if (!amount) return null;
  const emp = m.empresa || empresaActual;
  const txt = [m.concepto, m.referencia, m.banco].join(' ');
  if ((Number(m.importe)||0) < 0) {
    const candidates = filterEmpresaFor(D.gastos || [], emp, 'empresa').map(g => {
      const diff = Math.abs(Math.abs(Number(g.importe)||0) - amount);
      if (diff > 1) return null;
      const d = daysBetween(m.fecha, getGastoFechaPago(g) || g.fecha);
      if (d > 45) return null;
      const score = 30 - Math.min(d,30) + textScoreMove(txt, [g.concepto,g.proveedor,g.fuente_gasto].join(' ')) - diff;
      return { tipo:'gasto', id:gastoKey(g), item:g, score, label:`${g.proveedor || 'Proveedor'} · ${g.concepto || g.fuente_gasto || 'Gasto'} · ${fdate(g.fecha)}` };
    }).filter(Boolean).sort((a,b)=>b.score-a.score);
    return candidates[0] || null;
  }
  const candidates = filterEmpresaFor(allIngresosOperativos(), emp, 'empresa').map(i => {
    const diff = Math.abs(Math.abs(Number(i.importe)||0) - amount);
    if (diff > 1) return null;
    const d = daysBetween(m.fecha, i.fecha);
    if (d > 45) return null;
    const score = 30 - Math.min(d,30) + textScoreMove(txt, [i.factura,i.concepto,i.proveedor,i.forma_pago].join(' ')) - diff;
    return { tipo:'ingreso', id:getIngresoId(i), item:i, score, label:`${i.factura || i.concepto || 'Ingreso'} · ${i.proveedor || i.forma_pago || ''} · ${fdate(i.fecha)}` };
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
  return candidates[0] || null;
}
async function reconcileMovement(id, tipo, relId='', label='') {
  const m = (D.movimientos || []).find(x => x.id === id); if (!m) return;
  if (tipo === 'gasto') Object.assign(m, { estado_conciliacion:'conc_gasto', entidad_relacionada_tipo:'gasto', entidad_relacionada_id:relId, entidad_relacionada_label:label, impacto_resultado:false, impacto_tesoreria:true, estado_validacion:'validado', validado:true, es_nuevo:false });
  else if (tipo === 'ingreso') Object.assign(m, { estado_conciliacion:'conc_ingreso', entidad_relacionada_tipo:'ingreso', entidad_relacionada_id:relId, entidad_relacionada_label:label, impacto_resultado:false, impacto_tesoreria:true, estado_validacion:'validado', validado:true, es_nuevo:false });
  else if (tipo === 'no_operativo') Object.assign(m, { estado_conciliacion:'no_operativo', entidad_relacionada_tipo:'no_operativo', entidad_relacionada_id:'', entidad_relacionada_label:label || 'No operativo / ignorado', impacto_resultado:false, impacto_tesoreria:true, estado_validacion:'validado', validado:true, es_nuevo:false, tipo_movimiento:'no_operativo' });
  else if (tipo === 'clear') Object.assign(m, { estado_conciliacion:'sin_conciliar', entidad_relacionada_tipo:'', entidad_relacionada_id:'', entidad_relacionada_label:'', impacto_resultado:false, impacto_tesoreria:true, validado:false, estado_validacion:'pendiente' });
  await saveBankMovementsSupabase(); renderMovimientos();
}
async function acceptReconSuggestion(id) {
  const m = (D.movimientos || []).find(x => x.id === id); if (!m) return;
  const sug = movementReconciliationSuggestion(m);
  if (!sug) { alert('No hay una coincidencia clara para este movimiento'); return; }
  await reconcileMovement(id, sug.tipo, sug.id, sug.label);
}
async function autoSuggestReconciliation(markOnly=false) {
  (D.movimientos || []).forEach(m => {
    if (getMovementReconStatus(m) !== 'sin_conciliar') return;
    const sug = movementReconciliationSuggestion(m);
    if (sug) { m.sugerencia_conciliacion_tipo = sug.tipo; m.sugerencia_conciliacion_id = sug.id; m.sugerencia_conciliacion_label = sug.label; }
  });
  await saveBankMovementsSupabase(); renderMovimientos();
}
function renderConciliacionTable(all) {
  const tb = document.getElementById('tb-conciliacion'); if (!tb) return;
  const rows = (all || []).slice().sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))).slice(0,120);
  tb.innerHTML = rows.map(m => {
    const st = getMovementReconStatus(m);
    const sug = movementReconciliationSuggestion(m) || (m.sugerencia_conciliacion_tipo ? { tipo:m.sugerencia_conciliacion_tipo, id:m.sugerencia_conciliacion_id, label:m.sugerencia_conciliacion_label } : null);
    const suggestion = st === 'sin_conciliar' ? (sug ? `<span class="pill pa">Sugerido ${sug.tipo}</span><br><span style="font-size:12px;color:var(--text3)">${sug.label || ''}</span>` : '<span class="pill pr">Sin coincidencia</span><br><span style="font-size:12px;color:var(--text3)">No crear gasto/ingreso automáticamente</span>') : `${getMovementReconLabel(m)}<br><span style="font-size:12px;color:var(--text3)">${m.entidad_relacionada_label || intercompanyTypeLabel(m.tipo_intercompany) || 'Validado'}</span>`;
    const actions = st === 'sin_conciliar' ? `${sug ? `<button class="eb" onclick="acceptReconSuggestion('${m.id}')">Conciliar</button>` : ''} <button class="eb" onclick="reconcileMovement('${m.id}','no_operativo','','No operativo')">No operativo</button>` : `<button class="eb" onclick="reconcileMovement('${m.id}','clear')">Deshacer</button>`;
    return `<tr><td><strong>${fdate(m.fecha)}</strong> · ${m.empresa || '—'}<br><span style="font-size:12px;color:var(--text3)">${m.concepto || '—'}</span></td><td class="tr" style="font-weight:700;color:${(Number(m.importe)||0)>=0?'var(--green)':'var(--red)'}">${eur(Number(m.importe)||0)}</td><td>${suggestion}</td><td>${getImpactLabel(m)}</td><td>${actions}</td></tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:22px">Sin movimientos para conciliar.</td></tr>';
}

function filterBankMovements() {
  const q = normTxt(document.getElementById('mb-q')?.value || '');
  const st = document.getElementById('mb-estado')?.value || 'all';
  let rows = filterEmpresaFor(D.movimientos || [], empresaActual, 'empresa');
  if (q) rows = rows.filter(m => normTxt([m.fecha,m.empresa,m.banco,m.cuenta,m.concepto,m.referencia,m.cuenta_asociada,m.categoria_asociada,m.tipo_movimiento,m.tipo_intercompany,m.empresa_origen,m.empresa_destino,m.archivo_origen].join(' ')).includes(q));
  if (st === 'pendiente') rows = rows.filter(m => !m.validado);
  if (st === 'nuevo') rows = rows.filter(m => m.es_nuevo);
  if (st === 'validado') rows = rows.filter(m => m.validado);
  if (st === 'incidencia') rows = rows.filter(m => m.incidencia);
  if (st === 'sin_clasificar') rows = rows.filter(m => !m.cuenta_asociada && m.tipo_movimiento !== 'traspaso');
  if (st === 'auto') rows = rows.filter(m => m.estado_clasificacion === 'auto');
  if (st === 'intercompany') rows = rows.filter(m => m.es_intercompany || m.tipo_movimiento === 'intercompany');
  if (st === 'dividendo') rows = rows.filter(m => m.tipo_intercompany === 'dividendo');
  if (st === 'prestamo_intercompany') rows = rows.filter(m => m.tipo_intercompany === 'prestamo_intercompany');
  if (st === 'sin_conciliar') rows = rows.filter(m => getMovementReconStatus(m) === 'sin_conciliar');
  if (st === 'conc_gasto') rows = rows.filter(m => getMovementReconStatus(m) === 'conc_gasto');
  if (st === 'conc_ingreso') rows = rows.filter(m => getMovementReconStatus(m) === 'conc_ingreso');
  if (st === 'conc_intercompany') rows = rows.filter(m => getMovementReconStatus(m) === 'conc_intercompany');
  if (st === 'no_operativo') rows = rows.filter(m => getMovementReconStatus(m) === 'no_operativo');
  return rows;
}
function setMovimientoField(id, field, value) {
  const m = (D.movimientos || []).find(x => x.id === id);
  if (!m) return;
  if (['validado','incidencia','es_nuevo'].includes(field)) m[field] = !!value;
  else m[field] = value;
  if (field === 'validado' && value) { m.estado_validacion = 'validado'; m.es_nuevo = false; }
  if (field === 'validado' && !value) m.estado_validacion = 'pendiente';
  saveBankMovementsSupabase();
  renderMovimientos();
}
function validatedBankPosition(rows) {
  const latest = new Map();
  (rows || []).filter(m => m.validado && Number.isFinite(Number(m.saldo))).forEach(m => {
    const k = `${m.empresa || ''}|${m.banco || ''}|${m.cuenta || ''}`;
    const prev = latest.get(k);
    if (!prev || String(m.fecha).localeCompare(String(prev.fecha)) >= 0) latest.set(k, m);
  });
  return Array.from(latest.values());
}

function bankIconLabel(banco) {
  const b = normTxt(banco || '');
  if (b.includes('bbva')) return 'BBVA';
  if (b.includes('caixa')) return 'CX';
  if (b.includes('sabadell')) return 'SAB';
  if (b.includes('cajamar')) return 'CAJ';
  if (b.includes('kutxa') || b.includes('laboral')) return 'LK';
  return (String(banco || 'B').trim().slice(0,3) || 'B').toUpperCase();
}
function empresaSigla(emp) {
  if (emp === 'Corporacion') return 'CORP';
  if (emp === 'Bridge') return 'BR';
  if (emp === 'Vallecas Las') return 'VL';
  if (emp === 'Global') return 'GLB';
  return String(emp || '—').slice(0,4).toUpperCase();
}
function escAttr(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escHtml(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function movementDetailHtml(m) {
  const items = [
    ['Banco completo', m.banco || '—'], ['Cuenta / IBAN', safeAccount(m.cuenta) || '—'], ['Referencia', m.referencia || '—'], ['Fecha valor', fdate(m.fecha_valor || m.fecha)],
    ['Saldo posterior', Number.isFinite(Number(m.saldo)) ? eur(Number(m.saldo)) : '—'], ['Conciliación', getMovementReconLabel(m)], ['Impacto', getImpactLabel(m)], ['Estado', m.es_nuevo ? 'Nuevo' : 'Revisado'],
    ['Origen → destino', (m.empresa_origen || '—') + ' → ' + (m.empresa_destino || '—')], ['Archivo origen', m.archivo_origen || '—'], ['Lote importación', m.import_batch_id || '—'], ['Texto bruto', m.raw_text || m.concepto || '—']
  ];
  return `<tr class="mov-detail-row" id="mov-detail-${m.id}" style="display:none"><td colspan="8"><div class="mov-detail-grid">${items.map(([k,v]) => `<div class="mov-detail-item"><div class="mov-detail-label">${k}</div><div>${v}</div></div>`).join('')}</div><div style="padding:0 4px 12px"><label style="font-size:12px;color:var(--text3)">Nota / incidencia</label><br><input value="${escAttr(m.nota_incidencia || '')}" onchange="setMovimientoField('${m.id}','nota_incidencia',this.value)" placeholder="Añadir nota" style="width:100%;max-width:520px;padding:8px 10px;border:1px solid var(--border2);border-radius:8px;background:var(--bg);font-family:'DM Sans';font-size:12px"></div></td></tr>`;
}
function toggleMovementDetail(id) {
  const el = document.getElementById('mov-detail-' + id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
}
function rowClickToggle(ev, id) {
  const tag = String(ev.target?.tagName || '').toLowerCase();
  if (['select','option','input','button','a','textarea','label'].includes(tag) || ev.target.closest('select,button,input,a,textarea')) return;
  toggleMovementDetail(id);
}

function renderMovimientos() {
  const rows = filterBankMovements();
  const all = filterEmpresaFor(D.movimientos || [], empresaActual, 'empresa');
  const pend = all.filter(m => !m.validado).length;
  const val = all.filter(m => m.validado).length;
  const inc = all.filter(m => m.incidencia).length;
  const inter = all.filter(m => m.es_intercompany || m.tipo_movimiento === 'intercompany');
  const reconOk = all.filter(m => getMovementReconStatus(m) !== 'sin_conciliar').length;
  const reconPend = all.filter(m => getMovementReconStatus(m) === 'sin_conciliar').length;
  const reconDup = all.filter(m => ['conc_gasto','conc_ingreso','conc_intercompany'].includes(getMovementReconStatus(m))).length;
  const reconNoop = all.filter(m => getMovementReconStatus(m) === 'no_operativo').length;
  const divs = inter.filter(m => m.tipo_intercompany === 'dividendo').reduce((s,m)=>s+Math.abs(Number(m.importe)||0),0);
  const loans = inter.filter(m => m.tipo_intercompany === 'prestamo_intercompany').reduce((s,m)=>s+Math.abs(Number(m.importe)||0),0);
  set('mb-total', all.length); set('mb-total-s', empresaActual === 'Global' ? 'Todas las empresas' : empresaActual);
  set('mb-pend', pend); set('mb-val', val); set('mb-inc', inc);
  set('mb-ic-total', eur(inter.reduce((s,m)=>s+Math.abs(Number(m.importe)||0),0))); set('mb-ic-s', inter.length + ' movimiento(s)');
  set('mb-ic-div', eur(divs)); set('mb-ic-loan', eur(loans));
  set('mb-recon-ok', reconOk); set('mb-recon-pend', reconPend); set('mb-recon-dup', reconDup); set('mb-recon-noop', reconNoop);
  set('mb-filter-info', `${rows.length} mostrados`);
  mkChart('c-mov-estados', 'doughnut', ['Pendientes','Validados','Incidencias'], [{ data: [pend, val, inc], backgroundColor: ['#D4502A','#1A9E72','#B87318'], borderWidth: 0 }]);
  const pos = validatedBankPosition(all);
  mkChart('c-mov-saldos', 'bar', pos.map(m => (m.empresa ? m.empresa + ' · ' : '') + (m.banco || m.cuenta || 'Cuenta')), [{ data: pos.map(m => Number(m.saldo)||0), backgroundColor:'#1B5FA8', borderRadius:5 }]);
  const tbody = document.getElementById('tb-movimientos');
  if (!tbody) return;
  const cats = gastoCategorias();
  tbody.innerHTML = rows.slice(0, 300).map(m => {
    const cls = m.estado_clasificacion === 'auto' ? '<span class="pill pg">Auto</span>' : (m.cuenta_asociada ? '<span class="pill pb">Manual</span>' : '<span class="pill pz">Sin clasificar</span>');
    const catOptions = [''].concat(cats).map(c => `<option value="${c}" ${String(m.cuenta_asociada || m.categoria_asociada || '')===c?'selected':''}>${c || 'Sin cuenta'}</option>`).join('');
    const conceptoCorto = escHtml(m.concepto || '—');
    const detalle = movementDetailHtml(m);
    const row = `<tr class="mov-row" onclick="rowClickToggle(event,'${m.id}')">
      <td>${fdate(m.fecha)}</td>
      <td><span class="sigla" title="${escAttr(m.empresa || '')}">${empresaSigla(m.empresa)}</span></td>
      <td><span class="bank-icon" title="${escAttr(m.banco || '')}">${bankIconLabel(m.banco)}</span></td>
      <td class="tr" style="font-weight:800;color:${(Number(m.importe)||0)>=0?'var(--green)':'var(--red)'}">${eur(Number(m.importe)||0)}</td>
      <td><select onchange="setMovimientoCategoria('${m.id}',this.value)" style="width:190px;padding:7px 9px;border:1px solid var(--border2);border-radius:9px;background:var(--bg);font-family:'DM Sans';font-size:12px">${catOptions}</select><br>${cls} <button class="eb" style="font-size:11px;padding:3px 7px;margin-top:4px" onclick="learnRuleFromMovimiento('${m.id}')" title="Guardar regla y aplicar a conceptos similares">Aprender</button></td>
      <td><input class="compact-check" type="checkbox" ${m.validado ? 'checked' : ''} onchange="setMovimientoField('${m.id}','validado',this.checked)"></td>
      <td><input class="compact-check" type="checkbox" ${m.incidencia ? 'checked' : ''} onchange="setMovimientoField('${m.id}','incidencia',this.checked)"></td>
      <td><strong>${conceptoCorto}</strong><br><span style="font-size:12px;color:var(--text3)">${getMovementReconLabel(m)} ${getImpactLabel(m)}</span></td>
    </tr>`;
    return row + detalle;
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:26px">Sin movimientos bancarios. Sube un Excel o CSV para empezar a validar la tesorería.</td></tr>';
  renderIntercompanyTable(all);
  renderConciliacionTable(all);
}
function exportBankMovementsCSV() {
  const rows = filterBankMovements();
  const headers = ['fecha','empresa','banco','cuenta','concepto','referencia','cuenta_asociada','tipo_movimiento','es_intercompany','tipo_intercompany','empresa_origen','empresa_destino','impacto_resultado','estado_clasificacion','importe','saldo','validado','incidencia','nota_incidencia','archivo_origen'];
  const csv = [headers.join(';'), ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(';'))].join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'movimientos_bancarios.csv'; a.click(); URL.revokeObjectURL(a.href);
}


function gastoKey(g) {
  const raw = [g.fecha||'', g.empresa||'', g.concepto||'', g.proveedor||'', g.fuente_gasto||'', g.importe||0].join('|');
  try { return btoa(unescape(encodeURIComponent(raw))).replace(/=+$/,''); }
  catch(e) { return raw.replace(/[^a-zA-Z0-9]/g,'_').slice(0,90); }
}
