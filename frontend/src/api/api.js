import axios from "axios";

const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8082";

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;
