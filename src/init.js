// Inicializacion de la app modular v43
// INIT
// ============================================================
if (!initSB()) { document.getElementById('authGate').classList.add('open'); setTimeout(openCfg, 600); } else { bootAuth(); }
