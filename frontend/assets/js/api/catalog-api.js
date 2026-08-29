/**
 * Catalog API
 * Client للتواصل مع Catalog endpoints (عام)
 */

const catalogApi = {
  // Search
  async search(query) {
    return fetch('/api/catalog/search?q=' + encodeURIComponent(query))
      .then(r => r.json());
  },

  // Get all products
  async getAll(page = 1, limit = 20) {
    return fetch('/api/catalog?page=' + page + '&limit=' + limit)
      .then(r => r.json());
  },

  // Get product detail
  async getDetail(id) {
    return fetch('/api/catalog/' + id)
      .then(r => r.json());
  },

  // Get suppliers for product
  async getSuppliers(productId) {
    return fetch('/api/catalog/' + productId + '/suppliers')
      .then(r => r.json());
  },

  // Get categories
  async getCategories() {
    return fetch('/api/catalog/categories/all')
      .then(r => r.json());
  },

  // Get brands
  async getBrands() {
    return fetch('/api/catalog/brands/all')
      .then(r => r.json());
  }
};
