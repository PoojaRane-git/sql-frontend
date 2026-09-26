import React from "react";

// Renders an array of plain row objects as a table. Used for both a
// subquery's own output rows and the outer query's final result.
export default function ResultTable({ rows, emptyLabel = "No rows" }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <div className="sq-result-empty">{emptyLabel}</div>;
  }

  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((k) => set.add(k));
      return set;
    }, new Set())
  );

  return (
    <div className="sq-result-table-wrap">
      <table className="sq-result-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row._rowKey || i}>
              {columns.map((col) => (
                <td key={col}>
                  {row[col] === null || row[col] === undefined ? (
                    <span className="sq-null">NULL</span>
                  ) : (
                    String(row[col])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}