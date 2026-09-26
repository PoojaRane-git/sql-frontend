import React, { useState } from "react";
import SubqueryTree from "./components/subquery/SubqueryTree";

const EXAMPLE_QUERY = `SELECT *
FROM employees
WHERE salary >
(
  SELECT AVG(salary)
  FROM employees
);`;

// Route: /subquery
// Reuses the existing POST /generate endpoint (same one the main
// visualizer uses) — no backend contract changes needed. This page just
// renders the SUBQUERY steps as a tree instead of a flat list.
export default function SubqueryVisualizer() {
  const [sql, setSql] = useState(EXAMPLE_QUERY);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runQuery = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("http://localhost:5000/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to analyze query");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sq-visualizer-page">
      <h1>Subquery Visualizer</h1>

      <textarea
        className="sq-query-input"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        rows={8}
        placeholder="Enter a query with a subquery (IN, EXISTS, scalar, FROM, SELECT expression, HAVING, ORDER BY)..."
      />

      <button className="sq-run-button" onClick={runQuery} disabled={loading || !sql.trim()}>
        {loading ? "Analyzing..." : "Visualize"}
      </button>

      {error && <div className="sq-error">{error}</div>}

      {result && (
        <SubqueryTree
          query={result.query}
          steps={result.steps}
          finalOutputDescription={result.final_output_description}
        />
      )}
    </div>
  );
}