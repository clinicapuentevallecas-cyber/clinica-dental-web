// Servicio de autenticacion: punto de extraccion futuro desde app.js.
window.AppAuth = {
  async currentUser() { return window.AppSupabase?.getUser ? window.AppSupabase.getUser() : null; }
};
