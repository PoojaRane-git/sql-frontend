import axios from "axios";

// Note: Automatically checks process.env (CRA) or falls back to your live Render endpoint
const BASE_URL = 
  (typeof process !== 'undefined' && process.env?.REACT_APP_API_URL) || 
  "https://onrender.com"; 

const apiClient = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

const api = {
  // SQL Router
  sql: {
    analyze: async (sql) => {
      const response = await apiClient.post("/sql/analyze", { sql });
      return response; 
    },
  },
  // Neo4j Router
  neo4j: {
    convert: async (query) => {
      const response = await apiClient.post("/neo4j/convert", { query });
      return response.data; 
    },
  },
  // MongoDB Router
  mongodb: {
    convert: async (query) => {
      const response = await apiClient.post("/mongodb/convert", { query });
      return response.data; // Directly extracts target data metrics safely
    },
  },
};

export default api;
