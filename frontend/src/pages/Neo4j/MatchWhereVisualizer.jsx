import React from "react";
import {
  Circle,
  Filter,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export default function MatchWhereVisualizer({
  cypherQuery,
  sqlQuery,
  steps = [],
  sampleData = [],
}) {
  return (
    <div className="space-y-6">

      <div className="rounded-xl border border-slate-200 bg-white p-6">

        <h2 className="text-lg font-semibold mb-5">
          MATCH + WHERE
        </h2>

        <div className="flex flex-wrap items-center gap-4">

          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-blue-100 border-2 border-blue-500 flex items-center justify-center">
              <Circle className="text-blue-600" />
            </div>
            <span className="text-sm font-medium">
              User
            </span>
          </div>

          <ArrowRight className="text-slate-400" />

          <div className="rounded-lg bg-amber-50 border border-amber-300 px-5 py-4">
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-amber-600" />
              <span className="font-semibold text-amber-700">
                WHERE
              </span>
            </div>

            <p className="text-sm text-slate-600 mt-1">
              Filter matching nodes
            </p>
          </div>

          <ArrowRight className="text-slate-400" />

          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-5 py-4 flex items-center gap-2">
            <CheckCircle2
              size={18}
              className="text-emerald-600"
            />
            Matching rows
          </div>

        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">

        <div className="rounded-xl bg-white border p-5">
          <h3 className="font-semibold mb-3">
            Cypher Query
          </h3>

          <pre className="bg-slate-950 text-white rounded-lg p-4 text-sm overflow-auto">
            {cypherQuery}
          </pre>
        </div>

        <div className="rounded-xl bg-white border p-5">
          <h3 className="font-semibold mb-3">
            SQL Equivalent
          </h3>

          <pre className="bg-slate-950 text-white rounded-lg p-4 text-sm overflow-auto">
            {sqlQuery || "Waiting for SQL..."}
          </pre>
        </div>

      </div>

      <div className="rounded-xl border bg-white p-5">

        <h3 className="font-semibold mb-4">
          Filtered Result
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">

            {sampleData.length > 0 && (
              <>
                <thead>
                  <tr className="border-b bg-slate-50">
                    {Object.keys(sampleData[0]).map((key) => (
                      <th
                        key={key}
                        className="text-left px-4 py-3"
                      >
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {sampleData.map((row, index) => (
                    <tr
                      key={index}
                      className="border-b"
                    >
                      {Object.keys(sampleData[0]).map((key) => (
                        <td
                          key={key}
                          className="px-4 py-3"
                        >
                          {String(row[key] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </>
            )}

          </table>

          {sampleData.length === 0 && (
            <p className="text-sm text-slate-500">
              No sample data available.
            </p>
          )}
        </div>
      </div>

      {steps.length > 0 && (
        <div className="rounded-xl border bg-white p-5">
          <h3 className="font-semibold mb-4">
            Execution Steps
          </h3>

          <div className="space-y-3">
            {steps.map((step, index) => (
              <div
                key={index}
                className="rounded-lg border p-4"
              >
                <div className="font-semibold">
                  {index + 1}.{" "}
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