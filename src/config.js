// Configuracion compartida de la app modular
window.APP_CONFIG = {
  version: '2026-05-05-40',
  empresas: [
    { id: 'global', nombre: 'Global', siglas: 'GLB' },
    { id: 'corporacion', nombre: 'Corporacion', siglas: 'CORP' },
    { id: 'bridge', nombre: 'Bridge', siglas: 'BRG' },
    { id: 'vallecas', nombre: 'Vallecas Las', siglas: 'VLL' }
  ],
  cuentasAsociadasBase: [
    'Sin cuenta', 'Ventas', 'T. Intercompany', 'Traspaso entre empresas',
    'Suministros', 'Sueldos y SS', 'Banco', 'Gasto Financiacion',
    'Seguros', 'Informatica', 'Mantenimiento', 'Otros impuestos'
  ]
};
