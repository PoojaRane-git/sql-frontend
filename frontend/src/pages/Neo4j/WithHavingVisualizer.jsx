import React from "react";
import { Circle, ArrowRight, Filter, Calculator } from "lucide-react";

export default function WithHavingVisualizer({
  cypherQuery,
  sqlQuery,
  steps = [],
  sampleData = [],
}) {
  return (
    <div className="space-y-6">

      <div className="bg-white border rounded-xl p-6">

        <h2 className="text-lg font-semibold mb-6">
          WITH + WHERE → GROUP BY + HAVING
        </h2>

        <div className="flex items-center justify-center gap-3 flex-wrap">

          <Node label="User" />

          <ArrowRight />

          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-center">
            <Calculator
              className="mx-auto text-blue-600"
            />

            <p className="font-semibold mt-2">
              COUNT
            </p>
          </div>

          <ArrowRight />

          <div className="rounded-xl bg-amber-50 border border-amber-300 p-4 text-center">
            <Filter
              className="mx-auto text-amber-600"
            />

            <p className="font-semibold mt-2">
              HAVING
            </p>

            <p className="text-xs text-slate-500">
              purchases &gt; 2
            </p>
          </div>

          <ArrowRight />

          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
            Final rows
          </div>

        </div>

      </div>

      <Panel title="Cypher" value={cypherQuery} />

      <Panel
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

function Panel({ title, value }) {
  return (
    <div className="bg-white border rounded-xl p-5">
      <h3 className="font-semibold mb-3">
        {title}
      </h3>

      <pre className="bg-slate-950 text-white p-4 rounded-lg text-sm overflow-auto">
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