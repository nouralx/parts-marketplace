/**
 * Authentication Utilities
 * Handle user authentication and tokens
 */

/**
 * Save user token
 */
function saveToken(token) {
  localStorage.setItem('user_token', token);
}

/**
 * Get user token
 */
function getToken() {
  return localStorage.getItem('user_token');
}

/**
 * Save user profile
 */
function saveProfile(profile) {
  localStorage.setItem('user_profile', JSON.stringify(profile));
}

/**
 * Get user profile
 */
function getProfile() {
  const profile = localStorage.getItem('user_profile');
  return profile ? JSON.parse(profile) : null;
}

/**
 * Save user role
 */
function saveRole(role) {
  localStorage.setItem('user_role', role);
}

/**
 * Get user role
 */
function getRole() {
  return localStorage.getItem('user_role');
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
  return !!getToken();
}

/**
 * Check if user is admin
 */
function isAdmin() {
  return getRole() === 'admin';
}

/**
 * Check if user is supplier
 */
function isSupplier() {
  return getRole() === 'supplier';
}

/**
 * Check if user is buyer
 */
function isBuyer() {
  return getRole() === 'buyer';
}

/**
 * Clear all auth data
 */
function clearAuth() {
  localStorage.removeItem('user_token');
  localStorage.removeItem('user_profile');
  localStorage.removeItem('user_role');
}

/**
 * Logout
 */
function logout() {
  clearAuth();
  window.location.href = '/login.html';
}

/**
 * Check authentication and redirect if needed
 */
function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

/**
 * Check admin access
 */
function requireAdmin() {
  if (!isAdmin()) {
    alert('Access denied: Admin only');
    window.location.href = '/';
    return false;
  }
  return true;
}

/**
 * Check supplier access
 */
function requireSupplier() {
  if (!isSupplier()) {
    alert('Access denied: Supplier only');
    window.location.href = '/';
    return false;
  }
  return true;
}

module.exports = {
  saveToken,
  getToken,
  saveProfile,
  getProfile,
  saveRole,
  getRole,
  isAuthenticated,
  isAdmin,
  isSupplier,
  isBuyer,
  clearAuth,
  logout,
  requireAuth,
  requireAdmin,
  requireSupplier,
};
