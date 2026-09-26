import React from "react";
import {
  Circle,
  ArrowRight,
  Link2,
} from "lucide-react";

export default function RelationshipVisualizer({
  cypherQuery,
  sqlQuery,
  steps = [],
  sampleData = [],
}) {
  return (
    <div className="space-y-6">

      <div className="rounded-xl border bg-white p-6">

        <h2 className="text-lg font-semibold mb-6">
          Relationship → JOIN
        </h2>

        <div className="flex items-center justify-center gap-4 flex-wrap">

          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-blue-100 border-2 border-blue-500 flex items-center justify-center">
              <Circle className="text-blue-600" />
            </div>

            <p className="font-semibold mt-2">
              User
            </p>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-xs text-slate-500 mb-1">
              PURCHASED
            </span>

            <ArrowRight
              size={35}
              className="text-purple-600"
            />
          </div>

          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-500 flex items-center justify-center">
              <Circle className="text-emerald-600" />
            </div>

            <p className="font-semibold mt-2">
              Product
            </p>
          </div>

        </div>

        <div className="mt-6 flex justify-center">
          <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-200 rounded-lg">
            <Link2 size={17} />
            <span className="text-sm font-medium">
              Neo4j Relationship = SQL JOIN
            </span>
          </div>
        </div>

      </div>

      <div className="grid lg:grid-cols-2 gap-5">

        <div className="bg-white border rounded-xl p-5">
          <h3 className="font-semibold mb-3">
            Cypher
          </h3>

          <pre className="bg-slate-950 text-white p-4 rounded-lg text-sm overflow-auto">
            {cypherQuery}
          </pre>
        </div>

        <div className="bg-white border rounded-xl p-5">
          <h3 className="font-semibold mb-3">
            SQL
          </h3>

          <pre className="bg-slate-950 text-white p-4 rounded-lg text-sm overflow-auto">
            {sqlQuery || "Waiting for SQL..."}
          </pre>
        </div>

      </div>

      <div className="bg-white border rounded-xl p-5">
        <h3 className="font-semibold mb-4">
          Query Result
        </h3>

        <ResultTable data={sampleData} />
      </div>

      <Steps steps={steps} />

    </div>
  );
}

function ResultTable({ data }) {
  if (!data?.length) {
    return (
      <p className="text-sm text-slate-500">
        No sample data available.
      </p>
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