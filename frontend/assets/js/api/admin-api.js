/**
 * Admin API
 * Client للتواصل مع Admin endpoints
 */

const adminApi = {
  // Users Management
  async getUsers(page = 1, limit = 10) {
    return fetch('/api/admin/users?page=' + page + '&limit=' + limit, {
      headers: {
        'x-admin-token': localStorage.getItem('admin_token')
      }
    }).then(r => r.json());
  },

  async getUserDetail(id) {
    return fetch('/api/admin/user-detail/' + id, {
      headers: {
        'x-admin-token': localStorage.getItem('admin_token')
      }
    }).then(r => r.json());
  },

  async toggleUserStatus(userId, status) {
    return fetch('/api/admin/toggle-user-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': localStorage.getItem('admin_token')
      },
      body: JSON.stringify({ userId, status })
    }).then(r => r.json());
  },

  async deleteUser(id) {
    return fetch('/api/admin/users/' + id, {
      method: 'DELETE',
      headers: {
        'x-admin-token': localStorage.getItem('admin_token')
      }
    }).then(r => r.json());
  },

  // Products Management
  async getApprovedProducts(page = 1, limit = 20) {
    return fetch('/api/admin/all-approved-products?page=' + page + '&limit=' + limit, {
      headers: {
        'x-admin-token': localStorage.getItem('admin_token')
      }
    }).then(r => r.json());
  },

  async getProductSuppliers(productId) {
    return fetch('/api/admin/product-suppliers/' + productId, {
      headers: {
        'x-admin-token': localStorage.getItem('admin_token')
      }
    }).then(r => r.json());
  },

  async deleteProduct(id) {
    return fetch('/api/admin/products/' + id, {
      method: 'DELETE',
      headers: {
        'x-admin-token': localStorage.getItem('admin_token')
      }
    }).then(r => r.json());
  }
};
