// Servicio de autenticacion compartido
// Las funciones productivas de login, logout, perfiles y roles estan en src/app.js
// porque dependen del estado global sb/currentUser/currentProfile.
// Este archivo se mantiene como punto unico para utilidades de auth reutilizables.
window.AUTH_SERVICE_VERSION = '2026-05-05-43';
function authHasSession() { return !!window.currentUser; }
function authCurrentEmail() { return window.currentUser?.email || ''; }
