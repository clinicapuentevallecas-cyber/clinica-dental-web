// Modulo Pedidos clinicos - base funcional v43
const PEDIDOS_CLINICOS_VERSION = '2026-05-05-43';
function calcularCosteMaterialTTO(tto, recetas = [], materiales = []) {
  const recetasTto = recetas.filter(r => String(r.tratamiento_id || r.codigo_tto || '') === String(tto.tratamiento_id || tto.codigo_tto || ''));
  return recetasTto.reduce((sum, r) => {
    const mat = materiales.find(m => String(m.id) === String(r.material_id));
    const coste = Number(r.coste_unitario || mat?.coste_medio || mat?.coste_ultimo || 0);
    return sum + (Number(r.cantidad_estimada || r.cantidad || 0) * coste);
  }, 0);
}
function calcularMargenTTO(tto, costeMaterial = 0) {
  const ingreso = Number(tto.importe || tto.precio || 0);
  return { ingreso, costeMaterial, margen: ingreso - costeMaterial, margenPct: ingreso ? ((ingreso - costeMaterial) / ingreso) * 100 : 0 };
}
function calcularPedidoRecomendado(materiales = [], consumos = []) {
  return materiales.map(m => {
    const consumo = consumos.filter(c => String(c.material_id) === String(m.id)).reduce((s,c)=>s+Number(c.cantidad||0),0);
    const stock = Number(m.stock_actual || 0);
    const minimo = Number(m.stock_minimo || 0);
    const pedir = Math.max(0, consumo + minimo - stock);
    return { ...m, consumo_previsto: consumo, pedir };
  }).filter(x => x.pedir > 0);
}
function renderPedidosClinicosDashboard() {
  const el = document.getElementById('page-pedidos');
  if (!el) return;
  const cards = el.querySelectorAll('.card-v');
  if (cards[0]) cards[0].textContent = 'Preparado';
}
