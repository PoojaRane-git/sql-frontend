import axios from "axios";

const BASE_URL = 
  (typeof process !== 'undefined' && process.env?.REACT_APP_API_URL) || 
  "https://sql-neo4j-backend.onrender.com"; 

console.log("Using API Base URL:", BASE_URL);

const apiClient = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

const api = {
  // SQL Router
  sql: {
    analyze: async (sqlQuery) => {
      //  FIX: Map the parameter key to "query" to match your Java Record structure
      const response = await apiClient.post("/sql/analyze", { query: sqlQuery });
      return response.data; // Directly extracts target data data models safely
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
      return response.data; 
    },
  },
};

export default api;
