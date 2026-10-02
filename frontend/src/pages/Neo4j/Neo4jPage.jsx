import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Play,
  RotateCcw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

function Neo4jPage() {
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // =========================================================
  // CYPHER → SQL
 
  const convertQuery = async () => {
    const trimmedQuery = query.trim();

    console.log("Query:", trimmedQuery);

    if (!trimmedQuery) {
      setError("Please enter a Cypher query.");
      return;
    }

    setLoading(true);
    setError("");
    setResponse(null);

    try {
      // FIX: Hits the centralized axios instance explicitly using a clean POST route endpoint
      const res = await api.post("/neo4j/convert", { query: trimmedQuery });
      const data = res.data;

      console.log("Neo4j response:", data);
      setResponse(data);
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to connect to the Neo4j backend."
      );
    } finally {
      setLoading(false);
    }
  };

 
  // CLEAR
 
  const resetQuery = () => {
    setQuery("");
    setResponse(null);
    setError("");
  };

 
  // OPEN VISUALIZER
  // =========================================================
  const openVisualizer = () => {
    if (!response) {
      return;
    }

    navigate("/neo4j/visualizer", {
      state: {
        response,
        query,
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* =====================================================
            HEADER
        ===================================================== */}
        <div className="mb-8">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-5 transition"
          >
            <ArrowLeft size={17} />
            Back
          </button>

          <h1 className="text-3xl font-bold text-slate-900">
            Neo4j → SQL Converter
          </h1>

          <p className="text-slate-500 mt-2">
            Enter a Cypher query and convert it into relational SQL.
          </p>
        </div>

        {/* =====================================================
            INPUT
        ===================================================== */}
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Cypher Query
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Enter your Neo4j Cypher query below.
              </p>
            </div>

            <button
              type="button"
              onClick={resetQuery}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition"
            >
              <RotateCcw size={15} />
              Clear
            </button>
          </div>

          <div className="p-6">
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`MATCH (u:User)-[:PURCHASED]->(p:Product)\nWHERE p.price > 1000\nRETURN u.name, p.name, p.price\nORDER BY p.price DESC\nLIMIT 5`}
              rows={11}
              spellCheck={false}
              className="w-full rounded-xl border border-slate-300 bg-slate-950 text-white font-mono text-sm p-5 outline-none focus:ring-2 focus:ring-blue-500 resize-y leading-6"
            />

            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-slate-400">
                Cypher syntax is processed by the backend.
              </p>

              <button
                type="button"
                onClick={convertQuery}
                disabled={loading || !query.trim()}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                <Play size={17} />
                {loading ? "Converting..." : "Convert to SQL"}
              </button>
            </div>

            {error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
                {error}
              </div>
            )}
          </div>
        </section>

        {/* =====================================================
            SQL OUTPUT
        ===================================================== */}
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mt-6">
          <div className="px-6 py-5 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">
              Generated SQL
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              SQL generated from the Cypher query.
            </p>
          </div>

          <div className="p-6">
            <pre className="bg-slate-950 text-white rounded-xl p-5 min-h-[240px] text-sm font-mono overflow-x-auto whitespace-pre-wrap leading-6">
              {response?.sqlQuery || "SQL output will appear here after conversion."}
            </pre>

            {/* =================================================
                OPEN VISUALIZER
            ================================================= */}
            {response && (
              <div className="flex justify-end mt-5">
                <button
                  type="button"
                  onClick={openVisualizer}
                  className="group flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 transition"
                >
                  Open Visualizer
                  <ArrowRight
                    size={17}
                    className="group-hover:translate-x-1 transition-transform"
                  />
                </button>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}

export default Neo4jPage;
