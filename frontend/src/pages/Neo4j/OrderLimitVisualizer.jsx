import React from "react";
import {
  ArrowDown,
  ArrowDownUp,
  Circle,
  ListOrdered,
} from "lucide-react";

export default function OrderLimitVisualizer({
  cypherQuery,
  sqlQuery,
  steps = [],
  sampleData = [],
}) {
  return (
    <div className="space-y-6">

      <div className="bg-white border rounded-xl p-6">

        <h2 className="text-lg font-semibold mb-6">
          ORDER BY + LIMIT
        </h2>

        <div className="flex items-center justify-center gap-4 flex-wrap">

          <Stage
            icon={<Circle size={22} />}
            title="MATCH"
            description="Find products"
          />

          <ArrowDown />

          <Stage
            icon={<ArrowDownUp size={22} />}
            title="ORDER BY"
            description="price DESC"
          />

          <ArrowDown />

          <Stage
            icon={<ListOrdered size={22} />}
            title="LIMIT"
            description="5 rows"
          />

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

function Stage({ icon, title, description }) {
  return (
    <div className="rounded-xl border bg-slate-50 px-6 py-4 text-center">
      <div className="flex justify-center text-blue-600">
        {icon}
      </div>

      <p className="font-semibold mt-2">
        {title}
      </p>

      <p className="text-xs text-slate-500">
        {description}
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
          Top Results
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
        Final Result
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
            {data.slice(0, 5).map((row, index) => (
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