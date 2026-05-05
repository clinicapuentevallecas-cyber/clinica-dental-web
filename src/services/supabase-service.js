// Wrapper progresivo de Supabase.
// La app actual mantiene compatibilidad con el cliente global `supabase` cargado desde CDN.
window.AppSupabase = {
  get client() { return window.sb || null; },
  async getUser() {
    if (!window.sb) return null;
    const { data, error } = await window.sb.auth.getUser();
    return error ? null : data.user;
  }
};
