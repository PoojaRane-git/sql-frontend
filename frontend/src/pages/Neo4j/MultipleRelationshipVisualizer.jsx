import React from "react";
import { Circle, ArrowRight } from "lucide-react";

export default function MultipleRelationshipVisualizer({
  cypherQuery,
  sqlQuery,
  steps = [],
  sampleData = [],
}) {
  return (
    <div className="space-y-6">

      <div className="bg-white border rounded-xl p-6">

        <h2 className="text-lg font-semibold mb-6">
          Multiple Relationships
        </h2>

        <div className="flex items-center justify-center gap-3 flex-wrap">

          <Node label="User" />

          <Relationship label="PURCHASED" />

          <Node label="Product" />

          <Relationship label="BELONGS_TO" />

          <Node label="Category" />

        </div>

        <div className="mt-6 text-center text-sm text-slate-500">
          Multiple Neo4j relationships become multiple SQL JOINs.
        </div>

      </div>

      <QueryPanels
        cypherQuery={cypherQuery}
        sqlQuery={sqlQuery}
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

function Relationship({ label }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs text-slate-500">
        {label}
      </span>

      <ArrowRight
        size={30}
        className="text-purple-600"
      />
    </div>
  );
}

function QueryPanels({ cypherQuery, sqlQuery }) {
  return (
    <div className="grid lg:grid-cols-2 gap-5">

      <div className="bg-white border rounded-xl p-5">
        <h3 className="font-semibold mb-3">
          Cypher
        </h3>

        <pre className="bg-slate-950 text-white rounded-lg p-4 text-sm overflow-auto">
          {cypherQuery}
        </pre>
      </div>

      <div className="bg-white border rounded-xl p-5">
        <h3 className="font-semibold mb-3">
          Generated SQL
        </h3>

        <pre className="bg-slate-950 text-white rounded-lg p-4 text-sm overflow-auto">
          {sqlQuery || "Waiting for SQL..."}
        </pre>
      </div>

    </div>
  );
}

function ResultTable({ data }) {
  return (
    <div className="bg-white border rounded-xl p-5">

      <h3 className="font-semibold mb-4">
        Result
      </h3>

      {!data?.length ? (
        <p className="text-sm text-slate-500">
          No sample data available.
        </p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                {Object.keys(data[0]).map((key) => (
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
              {data.map((row, index) => (
                <tr key={index} className="border-b">
                  {Object.keys(data[0]).map((key) => (
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
          </table>
        </div>
      )}

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