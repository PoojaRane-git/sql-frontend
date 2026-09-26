import api from "../api/api";

export const sqlService = {
  analyzeQuery: async (queryText) => {
    try {
      const response = await api.post("/sql/analyze", { query: queryText });
      return response.data; // Returns { explanation, parsedDetails } from Spring Boot
    } catch (error) {
      console.error("Error communicating with Spring Boot:", error);
      throw error;
    }
  },
};