import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function TableView() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const { sql, result } = state || {};

  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const intervalRef = useRef(null);

  useEffect(() => {
    if (!result) {
      navigate("/");
    }
  }, [result, navigate]);

  useEffect(() => {
    if (isPlaying && result?.steps?.length) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= result.steps.length - 1) {
            setIsPlaying(false);
            clearInterval(intervalRef.current);
            return prev;
          }
          return prev + 1;
        });
      }, 2500);
    }

    return () => clearInterval(intervalRef.current);
  }, [isPlaying, result]);

  if (!result) return null;

  const { sample_data = [], steps = [] } = result;
  const step = steps[currentStep] || {};

  const activeIds = new Set(
    step.affected_row_ids || sample_data.map(r => r.id)
  );

  const columns = sample_data.length ? Object.keys(sample_data[0]) : [];

  let visibleRows = [];
  if (
    [
      "FROM",
      "JOIN",
      "WHERE",
      "GROUP BY",
      "HAVING",
      "ORDER BY",
      "LIMIT",
      "AGGREGATE"
    ].includes(step.clause)
  ) {
    visibleRows = sample_data.filter(row => activeIds.has(row.id));
  }

  return (
    <div style={{ width: "900px", margin: "40px auto", fontFamily: "sans-serif" }}>
      <button onClick={() => navigate("/")}>← Back to Explanation</button>

      <h1>Table Execution Animation</h1>

      <pre style={{ background: "#1e1e1e", color: "#ddd", padding: "15px" }}>
        {sql}
      </pre>

      {/* CONTROLS */}
      <div style={{ display: "flex", gap: "10px", margin: "20px 0" }}>
        <button
          disabled={currentStep === 0}
          onClick={() => setCurrentStep(s => Math.max(0, s - 1))}
        >
          ⏮ Prev
        </button>

        <button onClick={() => setIsPlaying(p => !p)}>
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>

        <button
          disabled={currentStep === steps.length - 1}
          onClick={() =>
            setCurrentStep(s => Math.min(steps.length - 1, s + 1))
          }
        >
          Next ⏭
        </button>

        <span>
          Step {currentStep + 1} of {steps.length}
        </span>
      </div>

      {/* EXPLANATION */}
      <div style={{ background: "#fafafa", padding: "15px", border: "1px solid #ddd" }}>
        <h3>
          Step {step.execution_order || currentStep + 1}
          {" — "}
          {step.clause}
        </h3>

        <code>{step.sql_fragment}</code>

        <p>{step.explanation}</p>

        {/* AGGREGATE */}
        {step.clause === "AGGREGATE" && step.calculation && (
          <div
            style={{
              marginTop: "20px",
              padding: "20px",
              background: "#eef2ff",
              textAlign: "center"
            }}
          >
            <h2>
              {step.calculation.function}({step.calculation.column})
            </h2>
            <p>{step.calculation.values_used?.join(" + ")}</p>
            <hr />
            <h1>Result = {step.calculation.result}</h1>
          </div>
        )}
      </div>

      {/* ROW TABLE */}
      {visibleRows.length > 0 && (
        <table style={{ width: "100%", marginTop: "25px", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col}
                  style={{ padding: "10px", borderBottom: "2px solid black", textAlign: "left" }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => (
              <tr key={row.id}>
                {columns.map(col => (
                  <td key={col} style={{ padding: "10px", borderBottom: "1px solid #ddd" }}>
                    {row[col]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* SELECT FINAL OUTPUT */}
      {step.clause === "SELECT" && step.calculation && (
        <table style={{ width: "100%", marginTop: "25px" }}>
          <thead>
            <tr>
              <th>{step.calculation.alias || "Result"}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: "center", fontSize: "30px", fontWeight: "bold" }}>
                {step.calculation.result}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <style>{`
        tr {
          animation: fade .5s ease;
        }
        @keyframes fade {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}