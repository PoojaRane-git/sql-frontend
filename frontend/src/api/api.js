import axios from "axios";

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8082";

const apiClient = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

// Wrap the client to match the api.sql.analyze structure used in SQLPage
const api = {
  sql: {
    analyze: async (query) => {
      const response = await apiClient.post("/sql/analyze", { query });
      return response.data; 
    },
  },
};

export default api;
