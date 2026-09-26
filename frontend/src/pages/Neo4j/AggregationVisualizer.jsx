import React from "react";
import { Circle, ArrowRight, Calculator } from "lucide-react";

export default function AggregationVisualizer({
  cypherQuery,
  sqlQuery,
  steps = [],
  sampleData = [],
}) {
  return (
    <div className="space-y-6">

      <div className="bg-white border rounded-xl p-6">

        <h2 className="text-lg font-semibold mb-6">
          Aggregation — COUNT
        </h2>

        <div className="flex items-center justify-center gap-4 flex-wrap">

          <Node label="User" />

          <ArrowRight className="text-purple-500" />

          <Node label="Product" />

          <ArrowRight className="text-purple-500" />

          <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-6 py-5 text-center">
            <Calculator
              className="mx-auto text-amber-600"
            />

            <p className="font-semibold mt-2">
              COUNT()
            </p>

            <p className="text-xs text-slate-500">
              Aggregate rows
            </p>
          </div>

        </div>

      </div>

      <QueryPanel
        title="Cypher"
        value={cypherQuery}
      />

      <QueryPanel
        title="Generated SQL"
        value={sqlQuery || "Waiting for SQL..."}
      />

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

function QueryPanel({ title, value }) {
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
        <h3 className="font-semibold mb-3">
          Aggregated Result
        </h3>

        <p className="text-sm text-slate-500">
          No sample data available.
        </p>
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    <div className="bg-white border rounded-xl p-5">

      <h3 className="font-semibold mb-4">
        Aggregated Result
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
              <tr key={index} className="border-b">
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
              Step {index + 1}:{" "}
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