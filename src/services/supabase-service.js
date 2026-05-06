// Servicio Supabase compartido
// La instancia productiva sb se inicializa en src/app.js usando las credenciales guardadas en la configuracion.
window.SUPABASE_SERVICE_VERSION = '2026-05-05-43';
function getSupabaseClient() { return typeof sb !== 'undefined' ? sb : null; }
function isSupabaseReady() { return !!getSupabaseClient(); }
