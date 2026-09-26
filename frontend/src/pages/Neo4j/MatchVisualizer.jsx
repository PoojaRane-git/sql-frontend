import React from "react";
import { Circle, Database, ArrowRight } from "lucide-react";

function DataTable({ data }) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-500">
        No sample rows available.
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-slate-50">
            {columns.map((column) => (
              <th
                key={column}
                className="text-left px-4 py-3 font-semibold text-slate-700"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.map((row, index) => (
            <tr key={index} className="border-b last:border-0">
              {columns.map((column) => (
                <td
                  key={column}
                  className="px-4 py-3 text-slate-600"
                >
                  {String(row[column] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MatchVisualizer({
  cypherQuery,
  sqlQuery,
  steps = [],
  sampleData = [],
}) {
  return (
    <div className="space-y-6">

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          MATCH — Find Nodes
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg bg-slate-900 text-white px-4 py-3 font-mono text-sm">
            MATCH
          </div>

          <ArrowRight className="text-slate-400" size={18} />

          <div className="rounded-full w-16 h-16 bg-blue-100 border-2 border-blue-500 flex items-center justify-center">
            <Circle className="text-blue-600" />
          </div>

          <ArrowRight className="text-slate-400" size={18} />

          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
            <span className="font-semibold text-emerald-700">
              User
            </span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold mb-3">Cypher</h3>

          <pre className="bg-slate-950 text-slate-100 rounded-lg p-4 text-sm overflow-x-auto">
            {cypherQuery}
          </pre>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold mb-3">Generated SQL</h3>

          <pre className="bg-slate-950 text-slate-100 rounded-lg p-4 text-sm overflow-x-auto">
            {sqlQuery || "Waiting for SQL..."}
          </pre>
        </div>

      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database size={18} />
          <h3 className="font-semibold">
            Result
          </h3>
        </div>

        <DataTable data={sampleData} />
      </div>

      {steps.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold mb-4">
            Execution Steps
          </h3>

          <div className="space-y-3">
            {steps.map((step, index) => (
              <div
                key={index}
                className="border rounded-lg p-4"
              >
                <div className="font-semibold text-slate-800">
                  Step {index + 1}:{" "}
                  {step.operation || step.clause}
                </div>

                <p className="text-sm text-slate-500 mt-1">
                  {step.description || step.explanation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}