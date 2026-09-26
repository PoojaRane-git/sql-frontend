const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "";

const request = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const responseText = await response.text();

  let data = {};

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(
      `Backend returned invalid JSON. HTTP ${response.status}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `Request failed. HTTP ${response.status}`
    );
  }

  return data;
};

const api = {
  neo4j: {
    convert: (query) =>
      request("/api/neo4j/convert", {
        method: "POST",
        body: JSON.stringify({ query }),
      }),
  },

  sql: {
    analyze: (query) =>
      request("/api/sql/analyze", {
        method: "POST",
        body: JSON.stringify({ query }),
      }),
  },

  mongodb: {
    convert: (query) =>
      request("/api/mongodb/convert", {
        method: "POST",
        body: JSON.stringify({ query }),
      }),
  },
};

export default api;