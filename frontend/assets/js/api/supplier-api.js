/**
 * Supplier API
 * Client للتواصل مع Supplier endpoints
 */

const supplierApi = {
  // Profile
  async getProfile() {
    return fetch('/api/supplier/profile', {
      headers: {
        'x-user-token': localStorage.getItem('user_token')
      }
    }).then(r => r.json());
  },

  // Listings
  async getListings() {
    return fetch('/api/supplier/listings', {
      headers: {
        'x-user-token': localStorage.getItem('user_token')
      }
    }).then(r => r.json());
  },

  async createListing(data) {
    return fetch('/api/supplier/listings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-token': localStorage.getItem('user_token')
      },
      body: JSON.stringify(data)
    }).then(r => r.json());
  },

  // Orders
  async getOrders() {
    return fetch('/api/supplier/orders', {
      headers: {
        'x-user-token': localStorage.getItem('user_token')
      }
    }).then(r => r.json());
  },

  // Stats
  async getStats() {
    return fetch('/api/supplier/dashboard/stats', {
      headers: {
        'x-user-token': localStorage.getItem('user_token')
      }
    }).then(r => r.json());
  }
};
