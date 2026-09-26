import React from "react";
import {
  Circle,
  ArrowRight,
  GitBranch,
} from "lucide-react";

export default function OptionalMatchVisualizer({
  cypherQuery,
  sqlQuery,
  steps = [],
  sampleData = [],
}) {
  return (
    <div className="space-y-6">

      <div className="bg-white border rounded-xl p-6">

        <h2 className="text-lg font-semibold mb-6">
          OPTIONAL MATCH → LEFT JOIN
        </h2>

        <div className="flex items-center justify-center gap-4 flex-wrap">

          <Node label="User" />

          <div className="flex flex-col items-center">
            <span className="text-xs text-slate-500 mb-1">
              OPTIONAL
            </span>

            <ArrowRight
              size={35}
              className="text-purple-600"
            />

            <span className="text-xs text-purple-600 font-medium">
              PURCHASED
            </span>
          </div>

          <Node label="Product" />

        </div>

        <div className="mt-6 flex justify-center">

          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-300 px-5 py-3">

            <GitBranch
              size={18}
              className="text-amber-600"
            />

            <span className="font-medium text-amber-700">
              OPTIONAL MATCH = LEFT JOIN
            </span>

          </div>

        </div>

      </div>

      <div className="grid lg:grid-cols-2 gap-5">

        <Panel
          title="Cypher"
          value={cypherQuery}
        />

        <Panel
          title="Generated SQL"
          value={sqlQuery || "Waiting for SQL..."}
        />

      </div>

      <ResultTable data={sampleData} />

      <Steps steps={steps} />

    </div>
  );
}

function Node({ label }) {
  return (
    <div className="text-center">

      <div className="w-20 h-20 rounded-full bg-blue-100 border-2 border-blue-500 flex items-center justify-center">

        <Circle className="text-blue-600" />

      </div>

      <p className="font-semibold mt-2">
        {label}
      </p>

    </div>
  );
}

function Panel({ title, value }) {
  return (
    <div className="bg-white border rounded-xl p-5">

      <h3 className="font-semibold mb-3">
        {title}
      </h3>

      <pre className="bg-slate-950 text-white rounded-lg p-4 text-sm overflow-auto">
        {value}
      </pre>

    </div>
  );
}

function ResultTable({ data }) {
  if (!data?.length) {
    return (
      <div className="bg-white border rounded-xl p-5">
        <h3 className="font-semibold">
          Result
        </h3>

        <p className="text-sm text-slate-500 mt-2">
          No sample data available.
        </p>
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    <div className="bg-white border rounded-xl p-5">

      <h3 className="font-semibold mb-4">
        Result
      </h3>

      <div className="overflow-auto">
        <table className="w-full text-sm">

          <thead>
            <tr className="border-b bg-slate-50">

              {columns.map((column) => (
                <th
                  key={column}
                  className="text-left px-4 py-3"
                >
                  {column}
                </th>
              ))}

            </tr>
          </thead>

          <tbody>

            {data.map((row, index) => (
              <tr
                key={index}
                className="border-b"
              >

                {columns.map((column) => (
                  <td
                    key={column}
                    className="px-4 py-3"
                  >
                    {String(row[column] ?? "")}
                  </td>
                ))}

              </tr>
            ))}

          </tbody>

        </table>
      </div>

    </div>
  );
}

function Steps({ steps }) {
  if (!steps?.length) return null;

  return (
    <div className="bg-white border rounded-xl p-5">

      <h3 className="font-semibold mb-4">
        Execution Steps
      </h3>

      <div className="space-y-3">

        {steps.map((step, index) => (
          <div
            key={index}
            className="border rounded-lg p-4"
          >

            <p className="font-semibold">
              {index + 1}.{" "}
              {step.operation || step.clause}
            </p>

            <p className="text-sm text-slate-500 mt-1">
              {step.description || step.explanation}
            </p>

          </div>
        ))}

      </div>

    </div>
  );
}