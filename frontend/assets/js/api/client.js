/**
 * API Client
 * Centralized API communication
 */

const config = {
  baseURL: window.location.origin,
  timeout: 10000,
};

/**
 * Make API request
 */
async function apiCall(endpoint, options = {}) {
  const {
    method = 'GET',
    body = null,
    headers = {},
    token = null,
  } = options;

  const url = `${config.baseURL}/api${endpoint}`;
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  // Add token if available
  if (token) {
    defaultHeaders['x-user-token'] = token;
  } else {
    const storedToken = localStorage.getItem('user_token');
    if (storedToken) {
      defaultHeaders['x-user-token'] = storedToken;
    }
  }

  const fetchOptions = {
    method,
    headers: { ...defaultHeaders, ...headers },
  };

  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'API request failed');
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * GET request
 */
async function get(endpoint, options = {}) {
  return apiCall(endpoint, { ...options, method: 'GET' });
}

/**
 * POST request
 */
async function post(endpoint, body, options = {}) {
  return apiCall(endpoint, { ...options, method: 'POST', body });
}

/**
 * PUT request
 */
async function put(endpoint, body, options = {}) {
  return apiCall(endpoint, { ...options, method: 'PUT', body });
}

/**
 * DELETE request
 */
async function deleteRequest(endpoint, options = {}) {
  return apiCall(endpoint, { ...options, method: 'DELETE' });
}

/**
 * PATCH request
 */
async function patch(endpoint, body, options = {}) {
  return apiCall(endpoint, { ...options, method: 'PATCH', body });
}

module.exports = {
  get,
  post,
  put,
  deleteRequest,
  patch,
};
