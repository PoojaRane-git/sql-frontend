import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  Filter,
  GitBranch,
  Hash,
  Layers,
  ListFilter,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Table2,
} from "lucide-react";

import api from "../services/api";

const DEFAULT_QUERY =
  'db.users.find({age: {$gt: 25}, city: "Mumbai"})';

// ============================================================
// MAIN COMPONENT
// ============================================================

const MongoDB = () => {
  const navigate = useNavigate();

  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [sql, setSql] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [converted, setConverted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const examples = [
    { label: "Find", query: `db.users.find({})` },
    { label: "Condition", query: `db.users.find({age: {$gt: 25}})` },
    { label: "Projection", query: `db.users.find({}, {name: 1, age: 1})` },
    {
      label: "Multiple Conditions",
      query: `db.users.find({age: {$gt: 25}, city: "Mumbai"})`,
    },
    { label: "Sort", query: `db.products.find().sort({price: -1})` },
    { label: "Limit", query: `db.products.find().limit(5)` },
    {
      label: "Count",
      query: `db.orders.countDocuments({status: "Completed"})`,
    },
    {
      label: "Group",
      query: `db.orders.aggregate([
  {$group: {_id: "$customerId", total: {$sum: "$amount"}}}
])`,
    },
    {
      label: "Match + Group",
      query: `db.orders.aggregate([
  {$match: {status: "Completed"}},
  {$group: {_id: "$customerId", total: {$sum: "$amount"}}}
])`,
    },
    {
      label: "Lookup",
      query: `db.orders.aggregate([
  {
    $lookup: {
      from: "customers",
      localField: "customerId",
      foreignField: "_id",
      as: "customer"
    }
  }
])`,
    },
  ];

  // ==========================================================
  // STEPS (structured — each step carries `meta` so the
  // pipeline below never has to re-guess what it does)
  // ==========================================================

  const steps = useMemo(() => {
    if (!result) return [];

    let generated = result.executionSteps;
    if (typeof generated === "string") {
      try {
        generated = JSON.parse(generated);
      } catch {
        generated = null;
      }
    }

    let rawSteps = [];
    if (Array.isArray(generated)) {
      rawSteps = generated;
    } else if (generated && Array.isArray(generated.steps)) {
      rawSteps = generated.steps;
    }

    // Deterministic steps are built straight from the structured
    // `result` fields (filters/sort/limit/skip/groupField/...), so
    // they carry real `meta` the pipeline can execute exactly.
    // Whenever they exist, prefer them over the free-text steps an
    // LLM (Ollama) may have produced, since those can't be trusted
    // to run correctly for every query shape.
    const derivedSteps = buildDeterministicSteps(result, query, sql);
    if (derivedSteps.length > 0) {
      return derivedSteps;
    }

    if (rawSteps.length > 0) {
      return rawSteps.map((step, index) => {
        const operation =
          step?.operation || step?.type || step?.title || `STEP ${index + 1}`;

        return {
          title: String(operation),
          description:
            step?.description ||
            step?.explanation ||
            getFallbackDescription(operation),
          mongodb:
            step?.mongodb ||
            step?.mongo ||
            step?.mongodb_fragment ||
            step?.mongodbFragment ||
            "",
          sql: step?.sql || step?.sql_fragment || step?.sqlFragment || "",
          type: getStepType(operation),
          meta: null,
        };
      });
    }

    if (Array.isArray(result.conversionSteps) && result.conversionSteps.length > 0) {
      return result.conversionSteps.map((step, index) => {
        const operation =
          typeof step === "string"
            ? step
            : step?.operation || step?.type || step?.title || `STEP ${index + 1}`;

        return {
          title: String(operation),
          description:
            typeof step === "string"
              ? getFallbackDescription(operation)
              : step?.description || step?.explanation || getFallbackDescription(operation),
          mongodb: typeof step === "object" ? step?.mongodb || step?.mongo || "" : "",
          sql: typeof step === "object" ? step?.sql || "" : "",
          type: getStepType(operation),
          meta: null,
        };
      });
    }

    if (Array.isArray(result.stages) && result.stages.length > 0) {
      return result.stages.map((stage, index) => ({
        title: String(stage),
        description: getFallbackDescription(stage),
        mongodb: getMongoFragmentForStage(query, stage, result),
        sql: getSqlFragmentForStage(sql, stage),
        type: getStepType(stage),
        meta: null,
      }));
    }

    return [
      {
        title: "RESULT",
        description: "The MongoDB query was successfully converted into SQL.",
        mongodb: query,
        sql,
        type: "table",
        meta: null,
      },
    ];
  }, [result, query, sql]);

  // ==========================================================
  // SAMPLE DATA
  // ==========================================================

  const sampleTables = useMemo(() => {
    if (!result) return {};

    let data = result.sampleData;
    if (!data) return {};

    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return {};
      }
    }

    if (data && typeof data === "object" && data.tables && typeof data.tables === "object") {
      return data.tables;
    }

    if (data && typeof data === "object") {
      return data;
    }

    return {};
  }, [result]);

  // ==========================================================
  // PIPELINE — the actual fix. Each step is executed against the
  // OUTPUT of the previous step, not the raw sample data. This is
  // what makes every step (filter, sort, skip, limit, group,
  // lookup, ...) show a result consistent with the ones before it,
  // for any MongoDB query shape.
  // ==========================================================

  const pipeline = useMemo(
    () => buildPipeline(steps, sampleTables, result),
    [steps, sampleTables, result]
  );

  const finalResult = useMemo(() => {
    if (!result) return [];
    if (pipeline.length > 0) {
      return pipeline[pipeline.length - 1].after;
    }
    return buildFinalResult(result, sampleTables);
  }, [result, sampleTables, pipeline]);

  // ==========================================================
  // CONVERT
  // ==========================================================

  const convertToSQL = async () => {
    const trimmed = query.trim();

    if (!trimmed) {
      setError("Please enter a MongoDB query.");
      return;
    }

    console.log("MongoDB Query:", trimmed);

    setLoading(true);
    setError("");
    setConverted(false);
    setResult(null);
    setSql("");
    setCurrentStep(0);

   
    try {
      const data = await api.mongodb.convert(trimmed);
      if (!data) throw new Error("Empty response received from server.");
      if (data.error) throw new Error(data.error);

      setResult(data);
      setSql(data.sqlQuery || "");
      setConverted(true);
    }  catch (err) {
      console.error("MongoDB conversion error:", err);
      setError(err?.message || "MongoDB conversion failed.");
    } finally {
      setLoading(false);
    }
  };

  const loadExample = (example) => {
    setQuery(example.query);
    setSql("");
    setResult(null);
    setConverted(false);
    setCurrentStep(0);
    setError("");
  };

  const copySQL = async () => {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const resetVisualization = () => setCurrentStep(0);

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((previous) => previous + 1);
    }
  };

  const previousStep = () => {
    if (currentStep > 0) {
      setCurrentStep((previous) => previous - 1);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-[1500px] mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </button>

            <div className="h-6 w-px bg-slate-200" />

            <div>
              <div className="text-xl font-black tracking-tight">
                TRI<span className="text-green-600">QL</span>
              </div>
              <p className="text-xs text-slate-400">Visual Query Learning Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-100">
            <Database className="w-4 h-4 text-green-600" />
            <span className="text-xs font-bold tracking-wider text-green-600">
              MONGODB → SQL
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-6 py-10">
        <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6 items-start">
          <div className="space-y-6">
            <section className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                    <Database className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg">MongoDB Query</h2>
                    <p className="text-xs text-slate-400">Enter your MongoDB query</p>
                  </div>
                </div>

                <div className="relative group">
                  <button
                    type="button"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:border-green-300 hover:text-green-600 hover:bg-green-50 transition"
                  >
                    Examples
                  </button>

                  <div className="hidden group-hover:block absolute right-0 top-full mt-2 z-50 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl p-2">
                    {examples.map((example) => (
                      <button
                        type="button"
                        key={example.label}
                        onClick={() => loadExample(example)}
                        className="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-green-50 hover:text-green-700 transition"
                      >
                        <div className="font-semibold">{example.label}</div>
                        <div className="text-[11px] text-slate-400 font-mono truncate mt-1">
                          {example.query.split("\n")[0]}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-5">
                <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950">
                  <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                      <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    </div>
                    <span className="text-xs text-slate-500 font-mono">mongodb</span>
                  </div>

                  <textarea
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setConverted(false);
                      setResult(null);
                      setSql("");
                      setError("");
                      setCurrentStep(0);
                    }}
                    spellCheck={false}
                    className="w-full min-h-[220px] resize-y bg-slate-950 text-green-100 p-6 font-mono text-sm leading-7 outline-none"
                    placeholder="Enter your MongoDB query..."
                  />

                  <div className="px-5 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-500">MongoDB Query</span>

                    <button
                      type="button"
                      onClick={convertToSQL}
                      disabled={loading}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-500 transition shadow-lg shadow-green-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Converting...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current" />
                          Convert to SQL
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                    <strong>Error:</strong> {error}
                  </div>
                )}
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Database className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg">Generated SQL</h2>
                    <p className="text-xs text-slate-400">Deterministic MongoDB → SQL conversion</p>
                  </div>
                </div>

                {converted && sql && (
                  <button
                    type="button"
                    onClick={copySQL}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy SQL
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="p-5">
                <CodePanel code={sql} language="mysql" activeStep={steps[currentStep]} />

                {!converted && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                    <Database className="w-4 h-4" />
                    Convert your MongoDB query to generate SQL.
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden xl:sticky xl:top-6">
            <div className="px-6 py-5 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                    <Table2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg">SQL Visualization</h2>
                    <p className="text-xs text-slate-400">MongoDB → Relational Execution</p>
                  </div>
                </div>

                {converted && (
                  <button
                    type="button"
                    onClick={resetVisualization}
                    className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-green-600 hover:bg-green-50 transition"
                    title="Reset"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>

              {converted && steps.length > 0 && (
                <ExecutionTimeline
                  steps={steps}
                  currentStep={currentStep}
                  setCurrentStep={setCurrentStep}
                />
              )}
            </div>

            <div className="p-6">
              {!converted ? (
                <div className="min-h-[650px] flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 rounded-3xl bg-green-50 flex items-center justify-center mb-5">
                    <Database className="w-9 h-9 text-green-500" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-700 mb-2">Ready to Visualize</h3>
                  <p className="text-sm text-slate-400 max-w-sm leading-6">
                    Enter a MongoDB query and click{" "}
                    <span className="font-semibold text-green-600">Convert to SQL</span> to see how
                    the query moves from documents to relational SQL operations.
                  </p>
                </div>
              ) : steps.length === 0 ? (
                <div className="min-h-[650px] flex items-center justify-center">
                  <div className="text-center">
                    <Search className="w-10 h-10 text-slate-300 mx-auto mb-4" />
                    <p className="font-semibold text-slate-600">SQL generated successfully</p>
                    <p className="text-sm text-slate-400 mt-1">No execution steps were returned.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2.5 py-1 rounded-lg bg-green-50 text-green-600 text-xs font-bold">
                        STEP {currentStep + 1}
                      </span>
                      <span className="text-sm font-bold text-slate-800">
                        {steps[currentStep]?.title}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">{steps[currentStep]?.description}</p>
                  </div>

                  <QueryHighlight mongoQuery={query} sqlQuery={sql} step={steps[currentStep]} />

                  <StepVisualization
                    step={steps[currentStep]}
                    pipelineEntry={pipeline[currentStep]}
                    sampleTables={sampleTables}
                    finalResult={finalResult}
                    result={result}
                  />

                  <div className="mt-8 pt-5 border-t border-slate-200 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={previousStep}
                      disabled={currentStep === 0}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                        currentStep === 0
                          ? "text-slate-300 cursor-not-allowed"
                          : "text-slate-600 border border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </button>

                    <span className="text-xs font-semibold text-slate-400">
                      {steps[currentStep]?.title}
                    </span>

                    <button
                      type="button"
                      onClick={nextStep}
                      disabled={currentStep === steps.length - 1}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                        currentStep === steps.length - 1
                          ? "text-slate-300 cursor-not-allowed"
                          : "bg-green-600 text-white hover:bg-green-500 shadow-lg shadow-green-600/20"
                      }`}
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1500px] mx-auto px-6 py-6 text-center">
          <p className="text-sm text-slate-400">
            TRIQL Platform • Learn queries by seeing how they work
          </p>
        </div>
      </footer>
    </div>
  );
};

// ============================================================
// BUILD DETERMINISTIC STEPS (now with `meta` attached, so the
// pipeline can execute each step exactly instead of re-parsing
// text fragments)
// ============================================================

const buildDeterministicSteps = (result, mongoQuery, sqlQuery) => {
  const steps = [];
  const operation = String(result?.operation || "").toUpperCase();

  const filters = result?.visualization?.filters || result?.filters || {};
  const projection = result?.visualization?.projection || result?.projection || {};
  const sort = result?.visualization?.sort || result?.sort || {};
  const limit = result?.visualization?.limit ?? result?.limit;
  const skip = result?.visualization?.skip ?? result?.skip;
  const lookupFrom = result?.visualization?.lookupFrom || result?.lookupFrom;
  const localField = result?.visualization?.localField || result?.localField;
  const foreignField = result?.visualization?.foreignField || result?.foreignField;
  const asField = result?.visualization?.as || result?.as || lookupFrom;
  const groupField = result?.visualization?.groupField || result?.groupField;

  const hasFilters = filters && typeof filters === "object" && Object.keys(filters).length > 0;
  const hasProjection =
    projection && typeof projection === "object" && Object.keys(projection).length > 0;
  const hasSort = sort && typeof sort === "object" && Object.keys(sort).length > 0;
  const hasLimit = Number.isInteger(Number(limit)) && Number(limit) > 0;
  const hasSkip = Number.isInteger(Number(skip)) && Number(skip) > 0;

  const filterSteps = () =>
    Object.entries(filters).map(([field, condition]) => {
      if (field.startsWith("__logical_")) {
        return {
          title: "FILTER",
          description: `MongoDB applies the logical condition ${condition}. SQL represents it using WHERE.`,
          mongodb: condition,
          sql: extractWhereFragment(sqlQuery),
          type: "filter",
          meta: { logical: true, condition },
        };
      }

      return {
        title: "FILTER",
        description: `MongoDB filters documents where ${field} satisfies ${condition}. SQL represents this using WHERE.`,
        mongodb: `${field}: ${condition}`,
        sql: `${field} ${normalizeSqlCondition(condition)}`,
        type: "filter",
        meta: { field, condition },
      };
    });

  if (operation === "FIND" || operation === "FIND_ONE") {
    steps.push({
      title: "FIND",
      description:
        "MongoDB retrieves documents from the collection. SQL represents this using SELECT.",
      mongodb: mongoQuery,
      sql: getSelectSql(sqlQuery),
      type: "table",
      meta: null,
    });

    if (hasFilters) steps.push(...filterSteps());

    if (hasProjection) {
      const fields = Object.entries(projection)
        .filter(([, value]) => Number(value) === 1)
        .map(([field]) => field);

      steps.push({
        title: "PROJECTION",
        description:
          "MongoDB projection selects only the requested fields. SQL represents this through SELECT columns.",
        mongodb: formatProjectionFragment(projection),
        sql: getSelectSql(sqlQuery),
        type: "projection",
        meta: { fields },
      });
    }

    if (hasSort) {
      steps.push({
        title: "SORT",
        description: "MongoDB sort() changes document order. SQL represents this using ORDER BY.",
        mongodb: formatSortFragment(sort),
        sql: extractSqlClause(sqlQuery, "ORDER BY"),
        type: "sort",
        meta: { sort },
      });
    }

    if (hasSkip) {
      steps.push({
        title: "SKIP",
        description: "MongoDB skip() ignores the first documents. SQL represents this using OFFSET.",
        mongodb: `.skip(${skip})`,
        sql: `OFFSET ${skip}`,
        type: "skip",
        meta: { n: Number(skip) },
      });
    }

    if (hasLimit) {
      steps.push({
        title: "LIMIT",
        description:
          "MongoDB limit() restricts the number of returned documents. SQL represents this using LIMIT.",
        mongodb: `.limit(${limit})`,
        sql: `LIMIT ${limit}`,
        type: "limit",
        meta: { n: Number(limit) },
      });
    }

    return steps;
  }

  if (operation === "COUNT_DOCUMENTS" || operation === "COUNT") {
    // Filters run first so the COUNT step sees the already-filtered
    // rows via the pipeline and just reports their length.
    if (hasFilters) steps.push(...filterSteps());

    steps.push({
      title: "COUNT",
      description:
        "MongoDB countDocuments() counts documents matching the condition. SQL represents this using COUNT(*).",
      mongodb: mongoQuery,
      sql: extractSqlClause(sqlQuery, "COUNT"),
      type: "count",
      meta: null,
    });

    return steps;
  }

  if (
    operation === "AGGREGATE" ||
    String(result?.concept || "").toUpperCase().includes("AGGREGATE")
  ) {
    const stages = Array.isArray(result?.stages) ? result.stages : [];
    const seen = new Set();

    stages.forEach((stage) => {
      const value = String(stage).toUpperCase();

      if (value === "$LOOKUP" || value === "LOOKUP" || value === "JOIN") {
        seen.add("join");
        steps.push({
          title: "LOOKUP",
          description:
            "MongoDB $lookup combines documents from another collection. SQL represents this using JOIN.",
          mongodb: "$lookup",
          sql: "JOIN",
          type: "join",
          meta: { from: lookupFrom, localField, foreignField, as: asField },
        });
      } else if (value === "$MATCH" || value === "MATCH" || value === "FILTER") {
        seen.add("filter");
        if (hasFilters) {
          steps.push(...filterSteps());
        } else {
          steps.push({
            title: "FILTER",
            description:
              "MongoDB $match filters documents before the next aggregation stage. SQL represents this using WHERE.",
            mongodb: "$match",
            sql: "WHERE",
            type: "filter",
            meta: null,
          });
        }
      } else if (value === "$GROUP" || value === "GROUP" || value === "GROUP BY") {
        seen.add("group");
        steps.push({
          title: "GROUP",
          description:
            "MongoDB $group collects documents by a grouping key. SQL represents this using GROUP BY.",
          mongodb: groupField ? `$group: { _id: "$${groupField}" }` : "$group",
          sql: groupField ? `GROUP BY ${groupField}` : "GROUP BY",
          type: "group",
          meta: { groupField },
        });
      } else if (value === "$SORT" || value === "SORT" || value === "ORDER BY") {
        seen.add("sort");
        steps.push({
          title: "SORT",
          description:
            "MongoDB $sort changes the order of the aggregation result. SQL represents this using ORDER BY.",
          mongodb: hasSort ? formatSortFragment(sort) : "$sort",
          sql: extractSqlClause(sqlQuery, "ORDER BY"),
          type: "sort",
          meta: hasSort ? { sort } : null,
        });
      } else if (value === "$LIMIT" || value === "LIMIT") {
        seen.add("limit");
        steps.push({
          title: "LIMIT",
          description:
            "MongoDB $limit restricts the number of returned documents. SQL represents this using LIMIT.",
          mongodb: hasLimit ? `$limit: ${limit}` : "$limit",
          sql: hasLimit ? `LIMIT ${limit}` : "LIMIT",
          type: "limit",
          meta: hasLimit ? { n: Number(limit) } : null,
        });
      } else if (value === "$SKIP" || value === "SKIP" || value === "OFFSET") {
        seen.add("skip");
        steps.push({
          title: "SKIP",
          description: "MongoDB $skip ignores the first documents. SQL represents this using OFFSET.",
          mongodb: hasSkip ? `$skip: ${skip}` : "$skip",
          sql: hasSkip ? `OFFSET ${skip}` : "OFFSET",
          type: "skip",
          meta: hasSkip ? { n: Number(skip) } : null,
        });
      }
    });

    // Fill in anything the backend's stage list omitted but the
    // structured fields tell us actually happened.
    if (hasFilters && !seen.has("filter")) {
      steps.push(...filterSteps());
    }

    if (groupField && !seen.has("group")) {
      steps.push({
        title: "GROUP",
        description: "MongoDB groups documents by a key. SQL represents this using GROUP BY.",
        mongodb: `$group: { _id: "$${groupField}" }`,
        sql: `GROUP BY ${groupField}`,
        type: "group",
        meta: { groupField },
      });
    }

    if (hasSort && !seen.has("sort")) {
      steps.push({
        title: "SORT",
        description: "MongoDB sorts the aggregation result. SQL represents this using ORDER BY.",
        mongodb: formatSortFragment(sort),
        sql: extractSqlClause(sqlQuery, "ORDER BY"),
        type: "sort",
        meta: { sort },
      });
    }

    if (hasSkip && !seen.has("skip")) {
      steps.push({
        title: "SKIP",
        description: "MongoDB skips the first documents. SQL represents this using OFFSET.",
        mongodb: `$skip: ${skip}`,
        sql: `OFFSET ${skip}`,
        type: "skip",
        meta: { n: Number(skip) },
      });
    }

    if (hasLimit && !seen.has("limit")) {
      steps.push({
        title: "LIMIT",
        description: "MongoDB limits the result. SQL represents this using LIMIT.",
        mongodb: `$limit: ${limit}`,
        sql: `LIMIT ${limit}`,
        type: "limit",
        meta: { n: Number(limit) },
      });
    }

    if (lookupFrom && !seen.has("join")) {
      steps.unshift({
        title: "LOOKUP",
        description: `MongoDB joins the ${lookupFrom} collection using $lookup. SQL represents this using JOIN.`,
        mongodb: "$lookup",
        sql: "JOIN",
        type: "join",
        meta: { from: lookupFrom, localField, foreignField, as: asField },
      });
    }

    return steps;
  }

  return [];
};

// ============================================================
// PIPELINE — runs every step against the rows the step before it
// produced. This is the core fix.
// ============================================================

const buildPipeline = (steps, sampleTables, result) => {
  const firstTable = firstTableData(sampleTables);
  let rows = firstTable ? firstTable.rows : [];

  return steps.map((step) => {
    const before = rows;
    let after = rows;

    switch (step?.type) {
      case "filter":
        after = applyFilterStep(rows, step, result);
        break;
      case "projection":
        after = applyProjectionStep(rows, step, result);
        break;
      case "sort":
        after = applySortStep(rows, step);
        break;
      case "skip": {
        const n = step?.meta?.n ?? extractSkip(step?.mongodb, result);
        after = rows.slice(n);
        break;
      }
      case "limit": {
        const n = step?.meta?.n ?? extractLimit(step?.mongodb, result);
        after = rows.slice(0, n);
        break;
      }
      case "group": {
        const field = step?.meta?.groupField;
        after = field
          ? buildGroupedRowsByField(rows, field)
          : buildGroupedRows(rows, result);
        break;
      }
      case "join":
        after = applyJoinStep(rows, step, sampleTables);
        break;
      default:
        // FIND / COUNT / AGGREGATE-summary steps don't reshape rows;
        // they just observe whatever came before them.
        after = rows;
    }

    rows = after;
    return { ...step, before, after };
  });
};

const applyFilterStep = (rows, step, result) => {
  if (!Array.isArray(rows)) return [];

  if (step?.meta?.logical) {
    return rows.filter((row) => evaluateLogicalExpression(row, step.meta.condition));
  }

  if (step?.meta?.field !== undefined) {
    return rows.filter((row) => evaluateCondition(row?.[step.meta.field], step.meta.condition));
  }

  // No structured meta (e.g. an LLM-authored step) — try to parse
  // "field: condition" out of the mongodb fragment, else fall back
  // to applying every known filter at once.
  const fragment = String(step?.mongodb || "");
  const match = fragment.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.+)\s*$/);
  if (match) {
    return rows.filter((row) => evaluateCondition(row?.[match[1]], match[2]));
  }

  return applyFilterVisualization(rows, result);
};

const applyProjectionStep = (rows, step, result) => {
  if (!Array.isArray(rows)) return [];

  const fields = step?.meta?.fields;
  if (Array.isArray(fields) && fields.length > 0) {
    return rows.map((row) => {
      const output = {};
      fields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(row, field)) {
          output[field] = row[field];
        }
      });
      return output;
    });
  }

  return applyProjectionVisualization(rows, result);
};

const applySortStep = (rows, step) => {
  if (!Array.isArray(rows)) return [];

  if (step?.meta?.sort && typeof step.meta.sort === "object") {
    return sortRowsBySortObject(rows, step.meta.sort);
  }

  return sortRows(rows, step?.mongodb);
};

const sortRowsBySortObject = (rows, sortObj) => {
  const entries = Object.entries(sortObj || {});
  if (!entries.length) return rows;

  return [...rows].sort((a, b) => {
    for (const [field, direction] of entries) {
      const dir = Number(direction) === -1 ? -1 : 1;
      const av = a?.[field];
      const bv = b?.[field];

      let cmp;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      }

      if (cmp !== 0) return cmp * dir;
    }
    return 0;
  });
};

const applyJoinStep = (rows, step, sampleTables) => {
  if (!Array.isArray(rows)) return [];

  const from = step?.meta?.from;
  const localField = step?.meta?.localField;
  const foreignField = step?.meta?.foreignField;
  const asField = step?.meta?.as || from;

  if (!from || !sampleTables?.[from]) {
    // We don't know (or don't have sample data for) the joined
    // collection — pass rows through unchanged rather than
    // fabricating a join.
    return rows;
  }

  const foreignRows = Array.isArray(sampleTables[from]) ? sampleTables[from] : [];

  if (!localField || !foreignField) {
    // We know which collection is joined but not the join keys —
    // same reasoning: don't fabricate the merge.
    return rows;
  }

  return rows.map((row) => ({
    ...row,
    [asField]: foreignRows.filter((frow) => frow?.[foreignField] === row?.[localField]),
  }));
};

const buildGroupedRowsByField = (rows, groupField) => {
  if (!Array.isArray(rows) || !groupField) return rows || [];

  const groups = new Map();
  rows.forEach((row) => {
    const key = row?.[groupField];
    if (!groups.has(key)) {
      groups.set(key, { [groupField]: key, count: 0 });
    }
    groups.get(key).count += 1;
  });

  return Array.from(groups.values());
};

// ============================================================
// EXECUTION TIMELINE
// ============================================================

const ExecutionTimeline = ({ steps, currentStep, setCurrentStep }) => {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-slate-500">QUERY EXECUTION</span>
        <span className="text-xs font-bold text-green-600">
          {currentStep + 1} / {steps.length}
        </span>
      </div>

      <div className="flex items-center overflow-x-auto pb-2">
        {steps.map((step, index) => (
          <React.Fragment key={index}>
            <button
              type="button"
              onClick={() => setCurrentStep(index)}
              className="flex flex-col items-center min-w-[76px] group"
              title={step.title}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition ${
                  index === currentStep
                    ? "bg-green-600 text-white shadow-md shadow-green-600/20 scale-110"
                    : index < currentStep
                    ? "bg-emerald-100 text-emerald-600"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {index < currentStep ? <Check className="w-4 h-4" /> : index + 1}
              </div>

              <span
                className={`mt-2 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap ${
                  index === currentStep
                    ? "text-green-600"
                    : index < currentStep
                    ? "text-emerald-600"
                    : "text-slate-400"
                }`}
              >
                {step.title}
              </span>
            </button>

            {index < steps.length - 1 && (
              <div
                className={`h-0.5 min-w-[25px] flex-1 ${
                  index < currentStep ? "bg-emerald-300" : "bg-slate-200"
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// QUERY HIGHLIGHT
// ============================================================

const QueryHighlight = ({ mongoQuery, sqlQuery, step }) => {
  return (
    <div className="space-y-4 mb-6">
      {step?.mongodb && (
        <CodeHighlightCard title="MongoDB" code={mongoQuery} fragment={step.mongodb} type="mongodb" />
      )}
      {step?.sql && (
        <CodeHighlightCard title="SQL" code={sqlQuery} fragment={step.sql} type="sql" />
      )}
    </div>
  );
};

const CodeHighlightCard = ({ title, code, fragment, type }) => {
  const lines = String(code || "").split("\n");
  const normalizedFragment = String(fragment || "").trim().toLowerCase();

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950">
      <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-400 font-mono">{title}</span>
        <span
          className={`text-[10px] font-bold uppercase ${
            type === "mongodb" ? "text-green-400" : "text-blue-400"
          }`}
        >
          highlighted
        </span>
      </div>

      <div className="p-4 font-mono text-xs leading-6 overflow-x-auto">
        {lines.map((line, index) => {
          const highlighted = normalizedFragment && line.toLowerCase().includes(normalizedFragment);
          return (
            <div
              key={index}
              className={`px-2 rounded transition ${
                highlighted
                  ? type === "mongodb"
                    ? "bg-green-500/20 text-green-200 ring-1 ring-green-500/40"
                    : "bg-blue-500/20 text-blue-200 ring-1 ring-blue-500/40"
                  : "text-slate-400"
              }`}
            >
              {line || " "}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================
// CODE PANEL
// ============================================================

const CodePanel = ({ code, language, activeStep }) => {
  const lines = String(code || "").split("\n");

  return (
    <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden">
      <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-500 font-mono">{language}</span>
        {code && <span className="text-xs text-emerald-400 font-semibold">Converted</span>}
      </div>

      <div className="min-h-[230px] max-h-[400px] overflow-auto p-6 font-mono text-sm leading-7">
        {!code ? (
          <span className="text-slate-600">Generated SQL will appear here...</span>
        ) : (
          lines.map((line, index) => {
            const fragment = activeStep?.sql;
            const normalized = String(fragment || "").trim().toLowerCase();
            const highlighted = normalized && line.toLowerCase().includes(normalized);

            return (
              <div
                key={index}
                className={`rounded px-2 transition ${
                  highlighted
                    ? "bg-blue-500/20 text-blue-200 ring-1 ring-blue-500/40"
                    : "text-blue-100"
                }`}
              >
                {line || " "}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// ============================================================
// STEP VISUALIZATION — every branch now reads from
// `pipelineEntry.before` / `pipelineEntry.after` instead of
// recomputing its own view of the raw sample data.
// ============================================================

const StepVisualization = ({ step, pipelineEntry, sampleTables, finalResult, result }) => {
  const type = step?.type || getStepType(step?.title);
  const firstTable = firstTableData(sampleTables);
  const before = pipelineEntry?.before ?? firstTable?.rows ?? [];
  const after = pipelineEntry?.after ?? before;

  if (type === "table") {
    return (
      <div className="space-y-5">
        <InfoBanner
          icon={<Search className="w-5 h-5" />}
          title="Document retrieval"
          text="MongoDB retrieves documents from the collection. SQL represents this using SELECT over the corresponding relational table."
          color="green"
        />
        {firstTable && (
          <DataTableCard title={firstTable.name} subtitle="Relational representation" rows={before} />
        )}
      </div>
    );
  }

  if (type === "filter") {
    return (
      <div className="space-y-5">
        <InfoBanner
          icon={<Filter className="w-5 h-5" />}
          title="Filtering"
          text="MongoDB keeps only documents that satisfy this condition. SQL represents the same operation using WHERE."
          color="amber"
        />
        <div className="space-y-4">
          <DataTableCard title={firstTable?.name || "Source"} subtitle="Before filter" rows={before} />
          <TransformationArrow />
          <DataTableCard title="Filtered result" subtitle="Rows satisfying this condition" rows={after} success />
        </div>
      </div>
    );
  }

  if (type === "projection") {
    return (
      <div className="space-y-5">
        <InfoBanner
          icon={<ListFilter className="w-5 h-5" />}
          title="Projection"
          text="MongoDB projection selects specific fields. SQL represents this through selected columns in SELECT."
          color="blue"
        />
        <div className="space-y-4">
          <DataTableCard title={firstTable?.name || "Source"} subtitle="Original document fields" rows={before} />
          <TransformationArrow />
          <DataTableCard title="Projected result" subtitle="Selected fields → SELECT columns" rows={after} success />
        </div>
      </div>
    );
  }

  if (type === "sort") {
    return (
      <div className="space-y-5">
        <InfoBanner
          icon={<ArrowRight className="w-5 h-5" />}
          title="Sorting"
          text="MongoDB sort() changes document order. SQL represents this with ORDER BY."
          color="purple"
        />
        <div className="space-y-4">
          <DataTableCard title={firstTable?.name || "Source"} subtitle="Rows before sort" rows={before} />
          <TransformationArrow />
          <DataTableCard title="Sorted rows" subtitle="MongoDB sort() → SQL ORDER BY" rows={after} success />
        </div>
      </div>
    );
  }

  if (type === "limit") {
    const n = step?.meta?.n ?? extractLimit(step?.mongodb, result);
    return (
      <div className="space-y-5">
        <InfoBanner
          icon={<Layers className="w-5 h-5" />}
          title="Limit"
          text={`MongoDB limit() restricts the returned documents. SQL uses LIMIT ${n}.`}
          color="blue"
        />
        <div className="space-y-4">
          <DataTableCard
            title={firstTable?.name || "Source"}
            subtitle={`${before.length} rows before limit`}
            rows={before}
          />
          <TransformationArrow />
          <DataTableCard title="Limited result" subtitle={`First ${n} rows`} rows={after} success />
        </div>
      </div>
    );
  }

  if (type === "skip") {
    const n = step?.meta?.n ?? extractSkip(step?.mongodb, result);
    return (
      <div className="space-y-5">
        <InfoBanner
          icon={<ArrowRight className="w-5 h-5" />}
          title="Skip / Offset"
          text={`MongoDB skip() ignores the first ${n} document(s). SQL represents this using OFFSET ${n}.`}
          color="purple"
        />
        <div className="space-y-4">
          <DataTableCard title={firstTable?.name || "Source"} subtitle="Rows before offset" rows={before} />
          <TransformationArrow />
          <DataTableCard title="Rows after OFFSET" subtitle={`First ${n} row(s) skipped`} rows={after} success />
        </div>
      </div>
    );
  }

  if (type === "count") {
    return (
      <div className="space-y-5">
        <InfoBanner
          icon={<Hash className="w-5 h-5" />}
          title="Count documents"
          text="MongoDB countDocuments() counts documents satisfying the condition. SQL represents this using COUNT(*)."
          color="indigo"
        />

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
            Matching documents
          </p>
          <div className="text-4xl font-black text-indigo-600">{before.length}</div>
        </div>

        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-500 mb-2">
            SQL Aggregate
          </p>
          <p className="font-mono text-lg font-bold text-indigo-700">COUNT(*)</p>
        </div>
      </div>
    );
  }

  if (type === "group") {
    return (
      <div className="space-y-5">
        <InfoBanner
          icon={<Layers className="w-5 h-5" />}
          title="Grouping"
          text="MongoDB $group collects documents with the same grouping key. SQL represents this using GROUP BY."
          color="purple"
        />
        <div className="space-y-4">
          <DataTableCard title={firstTable?.name || "Source"} subtitle="Rows before grouping" rows={before} />
          <TransformationArrow />
          <DataTableCard title="Grouped result" subtitle="MongoDB $group → SQL GROUP BY" rows={after} success />
        </div>
      </div>
    );
  }

  if (type === "aggregate") {
    return (
      <div className="space-y-5">
        <InfoBanner
          icon={<Hash className="w-5 h-5" />}
          title="Aggregation"
          text="MongoDB aggregation operators map to SQL aggregate functions."
          color="purple"
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {["$sum → SUM()", "$avg → AVG()", "$min → MIN()", "$max → MAX()"].map((item) => (
            <div key={item} className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-center">
              <p className="font-mono text-xs font-bold text-purple-700">{item}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "join") {
    const from = step?.meta?.from;
    const tables = Object.entries(sampleTables || {});
    const joined = pipelineEntry ? pipelineEntry.after !== pipelineEntry.before : false;

    return (
      <div className="space-y-5">
        <InfoBanner
          icon={<GitBranch className="w-5 h-5" />}
          title="MongoDB $lookup → SQL JOIN"
          text="MongoDB combines documents from another collection. In SQL this becomes a JOIN between relational tables."
          color="green"
        />

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
          {tables.slice(0, 2).map(([name], index) => (
            <React.Fragment key={name}>
              <div className="px-6 py-6 rounded-2xl bg-green-50 border border-green-200 text-center">
                <Database className="w-6 h-6 text-green-600 mx-auto mb-3" />
                <p className="text-[10px] uppercase font-bold text-green-500">Relational table</p>
                <p className="font-bold text-slate-800 mt-1">{name}</p>
              </div>

              {index === 0 && tables.length > 1 && (
                <div className="flex flex-col items-center">
                  <ArrowRight className="w-7 h-7 text-green-500" />
                  <span className="text-[10px] font-black text-green-600 mt-1">JOIN</span>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {tables.slice(0, 2).map(([name]) => (
          <DataTableCard
            key={name}
            title={name}
            subtitle="Sample relational data"
            rows={Array.isArray(sampleTables[name]) ? sampleTables[name] : []}
          />
        ))}

        {joined ? (
          <DataTableCard
            title="Joined result"
            subtitle={`Rows with the ${from || "related"} data attached`}
            rows={after}
            success
          />
        ) : (
          <p className="text-xs text-slate-400 text-center">
            Join keys weren&apos;t available in the response, so the merged result can&apos;t be
            shown accurately — the two tables above are shown for reference only.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <InfoBanner
        icon={<Check className="w-5 h-5" />}
        title="Final SQL Result"
        text="The relational data produced by the translated query."
        color="emerald"
      />

      {finalResult.length > 0 ? (
        <DataTableCard title="Query Result" subtitle="Final relational result" rows={finalResult} success />
      ) : (
        <EmptyResult />
      )}
    </div>
  );
};

const TransformationArrow = () => (
  <div className="flex items-center justify-center py-1">
    <div className="flex items-center gap-2 text-green-600">
      <div className="h-px w-10 bg-green-200" />
      <ArrowRight className="w-5 h-5" />
      <span className="text-[10px] font-bold uppercase tracking-wider">transform</span>
      <ArrowRight className="w-5 h-5" />
      <div className="h-px w-10 bg-green-200" />
    </div>
  </div>
);

const DataTableCard = ({ title, subtitle, rows = [], success = false }) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const columns = safeRows.length > 0 ? Object.keys(safeRows[0]) : [];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-sm">{title}</p>
            <p className="text-xs text-slate-400 font-mono mt-1">{subtitle}</p>
          </div>
          <Table2 className={`w-5 h-5 ${success ? "text-emerald-500" : "text-green-500"}`} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {columns.map((column) => (
                <th
                  key={column}
                  className="text-left px-5 py-3 text-[11px] uppercase tracking-wider font-bold text-slate-400 whitespace-nowrap"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {safeRows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} className="px-5 py-8 text-center text-sm text-slate-400">
                  No rows available.
                </td>
              </tr>
            ) : (
              safeRows.map((row, index) => (
                <tr
                  key={index}
                  className={`border-b border-slate-100 last:border-0 ${
                    success ? "bg-emerald-50/40" : "bg-white hover:bg-slate-50"
                  }`}
                >
                  {columns.map((column) => (
                    <td key={column} className="px-5 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {formatCell(row[column])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const InfoBanner = ({ icon, title, text, color = "green" }) => {
  const styles = {
    green: "bg-green-50 border-green-200 text-green-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };

  return (
    <div className={`flex items-start gap-3 px-4 py-4 rounded-xl border ${styles[color] || styles.green}`}>
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider">{title}</p>
        <p className="text-sm mt-1 text-slate-600 leading-6">{text}</p>
      </div>
    </div>
  );
};

const firstTableData = (sampleTables) => {
  const entries = Object.entries(sampleTables || {});
  if (!entries.length) return null;

  return {
    name: entries[0][0],
    rows: Array.isArray(entries[0][1]) ? entries[0][1] : [],
  };
};

// Legacy single-field regex fallback, kept only for steps that
// arrive without structured `meta` (e.g. LLM-authored steps).
const sortRows = (rows, mongoFragment) => {
  if (!Array.isArray(rows)) return [];

  const fragment = String(mongoFragment || "");
  const match = fragment.match(/\{\s*([A-Za-z0-9_]+)\s*:\s*(-?1)\s*\}/);
  if (!match) return rows;

  return sortRowsBySortObject(rows, { [match[1]]: Number(match[2]) });
};

const applyFilterVisualization = (rows, result) => {
  if (!Array.isArray(rows)) return [];

  const filters = result?.visualization?.filters || result?.filters;
  if (!filters || typeof filters !== "object") return rows;

  const entries = Object.entries(filters);

  return rows.filter((row) =>
    entries.every(([field, condition]) => {
      if (field.startsWith("__logical_")) {
        return evaluateLogicalExpression(row, condition);
      }
      return evaluateCondition(row?.[field], condition);
    })
  );
};

const parseSqlValue = (raw) => {
  const value = String(raw ?? "").trim();

  if (value === "NULL") return null;
  if (value === "TRUE") return true;
  if (value === "FALSE") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }

  return value;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const evaluateCondition = (value, condition) => {
  if (condition === null || condition === undefined) return true;
  if (typeof condition !== "string") return true;

  const text = condition.trim();
  let match;

  if (text === "IS NOT NULL") return value !== null && value !== undefined && value !== "";
  if (text === "IS NULL") return value === null || value === undefined || value === "";

  if ((match = text.match(/^>=\s*(.+)$/))) return Number(value) >= Number(parseSqlValue(match[1]));
  if ((match = text.match(/^<=\s*(.+)$/))) return Number(value) <= Number(parseSqlValue(match[1]));
  if ((match = text.match(/^<>\s*(.+)$/))) return String(value) !== String(parseSqlValue(match[1]));
  if ((match = text.match(/^>\s*(.+)$/))) return Number(value) > Number(parseSqlValue(match[1]));
  if ((match = text.match(/^<\s*(.+)$/))) return Number(value) < Number(parseSqlValue(match[1]));

  if ((match = text.match(/^=\s*(.+)$/))) {
    const target = parseSqlValue(match[1]);
    if (typeof target === "number") return Number(value) === target;
    return String(value) === String(target);
  }

  if ((match = text.match(/^NOT IN\s*\((.+)\)$/i))) {
    const list = match[1].split(",").map((item) => parseSqlValue(item.trim()));
    return !list.some((item) => String(item) === String(value));
  }

  if ((match = text.match(/^IN\s*\((.+)\)$/i))) {
    const list = match[1].split(",").map((item) => parseSqlValue(item.trim()));
    return list.some((item) => String(item) === String(value));
  }

  if ((match = text.match(/^LIKE\s*'(.*)'$/i))) {
    const pattern = match[1];
    const regex = new RegExp("^" + pattern.split("%").map(escapeRegex).join(".*") + "$", "i");
    return regex.test(String(value ?? ""));
  }

  return String(value) === text;
};

const splitTopLevel = (text, separator) => {
  const parts = [];
  let depth = 0;
  let current = "";

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "(") depth++;
    if (char === ")") depth--;

    if (depth === 0 && text.slice(index, index + separator.length) === separator) {
      parts.push(current.trim());
      current = "";
      index += separator.length - 1;
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts.length ? parts : [text];
};

const evaluateLogicalExpression = (row, expression) => {
  let text = String(expression || "").trim();
  if (text.startsWith("(") && text.endsWith(")")) text = text.slice(1, -1);

  const orParts = splitTopLevel(text, " OR ");
  if (orParts.length > 1) return orParts.some((part) => evaluateLogicalExpression(row, part));

  const andParts = splitTopLevel(text, " AND ");
  if (andParts.length > 1) return andParts.every((part) => evaluateLogicalExpression(row, part));

  let atom = text.trim();
  if (atom.startsWith("(") && atom.endsWith(")")) atom = atom.slice(1, -1).trim();

  const match = atom.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
  if (!match) return true;

  return evaluateCondition(row?.[match[1]], match[2]);
};

const applyProjectionVisualization = (rows, result) => {
  if (!Array.isArray(rows)) return [];

  const projection = result?.visualization?.projection || result?.projection;
  if (!projection || typeof projection !== "object") return rows;

  const fields = Object.entries(projection)
    .filter(([, value]) => Number(value) === 1)
    .map(([field]) => field);

  if (!fields.length) return rows;

  return rows.map((row) => {
    const output = {};
    fields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(row, field)) output[field] = row[field];
    });
    return output;
  });
};

const buildGroupedRows = (rows, result) => {
  if (!Array.isArray(rows)) return [];

  const visualization = result?.visualization || {};
  const groupField = visualization.groupField || result?.groupField || null;
  if (!groupField) return rows;

  return buildGroupedRowsByField(rows, groupField);
};

const extractLimit = (mongoFragment, result) => {
  const backendLimit = result?.visualization?.limit ?? result?.limit;
  if (Number.isInteger(Number(backendLimit)) && Number(backendLimit) > 0) {
    return Number(backendLimit);
  }

  const match = String(mongoFragment || "").match(/\.limit\(\s*(\d+)\s*\)/);
  if (match) return Number(match[1]);

  return 5;
};

const extractSkip = (mongoFragment, result) => {
  const backendSkip = result?.visualization?.skip ?? result?.skip;
  if (Number.isInteger(Number(backendSkip)) && Number(backendSkip) >= 0) {
    return Number(backendSkip);
  }

  const match = String(mongoFragment || "").match(/\.skip\(\s*(\d+)\s*\)/);
  if (match) return Number(match[1]);

  return 0;
};

const buildFinalResult = (result, sampleTables) => {
  if (Array.isArray(result?.visualization?.result)) return result.visualization.result;
  if (Array.isArray(result?.visualization?.finalResult)) return result.visualization.finalResult;

  const entries = Object.entries(sampleTables || {});
  if (!entries.length) return [];

  return Array.isArray(entries[0][1]) ? entries[0][1] : [];
};

const getStepType = (operation) => {
  const value = String(operation || "").toUpperCase();

  if (value.includes("WHERE") || value.includes("MATCH") || value.includes("FILTER")) return "filter";
  if (value.includes("JOIN") || value.includes("LOOKUP")) return "join";
  if (value.includes("GROUP")) return "group";
  if (value.includes("AGGREGATE")) return "aggregate";
  if (value.includes("SORT") || value.includes("ORDER")) return "sort";
  if (value.includes("LIMIT")) return "limit";
  if (value.includes("SKIP") || value.includes("OFFSET")) return "skip";
  if (value.includes("COUNT")) return "count";
  if (value.includes("PROJECT")) return "projection";
  if (value.includes("FIND") || value.includes("SELECT")) return "table";

  return "table";
};

const getFallbackDescription = (operation) => {
  const value = String(operation || "").toUpperCase();

  if (value === "FIND" || value === "SELECT") {
    return "MongoDB retrieves documents from the collection. SQL represents this using SELECT.";
  }
  if (value === "FILTER" || value === "WHERE" || value === "$MATCH" || value === "MATCH") {
    return "MongoDB filters documents using a condition. SQL represents this using WHERE.";
  }
  if (value === "PROJECTION" || value === "PROJECT" || value === "$PROJECT") {
    return "MongoDB selects specific fields. SQL represents these fields using SELECT columns.";
  }
  if (value === "SORT" || value === "ORDER BY") {
    return "MongoDB changes document ordering. SQL represents this using ORDER BY.";
  }
  if (value === "LIMIT") {
    return "MongoDB limits the number of returned documents. SQL represents this using LIMIT.";
  }
  if (value === "SKIP" || value === "OFFSET") {
    return "MongoDB skips documents. SQL represents this using OFFSET.";
  }
  if (value === "COUNT" || value === "COUNT_DOCUMENTS") {
    return "MongoDB counts matching documents. SQL represents this using COUNT(*).";
  }
  if (value === "$GROUP" || value === "GROUP" || value === "GROUP BY") {
    return "MongoDB groups documents. SQL represents this using GROUP BY.";
  }
  if (value === "AGGREGATE" || value === "AGGREGATION") {
    return "MongoDB aggregation operators map to SQL aggregate functions.";
  }
  if (value === "$LOOKUP" || value === "LOOKUP" || value === "JOIN") {
    return "MongoDB combines documents from another collection. SQL represents this using JOIN.";
  }

  return "This MongoDB operation is translated into its corresponding SQL operation.";
};

const getMongoFragmentForStage = (mongoQuery, stage, result) => {
  const value = String(stage || "").toUpperCase();

  if (value === "FIND") return mongoQuery;

  if (value === "FILTER" || value === "WHERE" || value === "$MATCH" || value === "MATCH") {
    const filters = result?.visualization?.filters || result?.filters || {};
    const first = Object.entries(filters)[0];
    return first ? `${first[0]}: ${first[1]}` : "$match";
  }

  if (value === "PROJECTION" || value === "PROJECT" || value === "$PROJECT") return "$project";
  if (value === "GROUP" || value === "$GROUP") return "$group";
  if (value === "LOOKUP" || value === "$LOOKUP") return "$lookup";
  if (value === "SORT") return ".sort()";
  if (value === "LIMIT") return ".limit()";
  if (value === "SKIP" || value === "OFFSET") return ".skip()";

  return "";
};

const getSqlFragmentForStage = (sqlQuery, stage) => {
  const value = String(stage || "").toUpperCase();

  if (value === "FIND" || value === "SELECT") return "SELECT";
  if (value === "FILTER" || value === "WHERE" || value === "$MATCH" || value === "MATCH") return "WHERE";
  if (value === "PROJECTION" || value === "PROJECT" || value === "$PROJECT") return "SELECT";
  if (value === "GROUP" || value === "$GROUP" || value === "GROUP BY") return "GROUP BY";
  if (value === "LOOKUP" || value === "$LOOKUP" || value === "JOIN") return "JOIN";
  if (value === "SORT" || value === "ORDER BY") return "ORDER BY";
  if (value === "LIMIT") return "LIMIT";
  if (value === "SKIP" || value === "OFFSET") return "OFFSET";

  return sqlQuery;
};

const getSelectSql = (sqlQuery) => {
  const sql = String(sqlQuery || "");
  const match = sql.match(/SELECT[\s\S]*?(?=\nFROM|\sFROM)/i);
  return match ? match[0].trim() : "SELECT";
};

const extractSqlClause = (sqlQuery, clause) => {
  const sql = String(sqlQuery || "");
  const regex = new RegExp(
    `${clause}[\\s\\S]*?(?=\\n(?:WHERE|GROUP BY|ORDER BY|LIMIT|OFFSET)|;|$)`,
    "i"
  );
  const match = sql.match(regex);
  return match ? match[0].trim() : clause;
};

const extractWhereFragment = (sqlQuery) => {
  const sql = String(sqlQuery || "");
  const match = sql.match(/WHERE[\s\S]*?(?=GROUP BY|ORDER BY|LIMIT|OFFSET|;|$)/i);
  return match ? match[0].trim() : "WHERE";
};

const normalizeSqlCondition = (condition) => String(condition || "").trim();

const formatProjectionFragment = (projection) => {
  const fields = Object.entries(projection || {})
    .filter(([, value]) => Number(value) === 1)
    .map(([field]) => field);

  return fields.length ? `{ ${fields.join(", ")} }` : "$project";
};

const formatSortFragment = (sort) => {
  const entries = Object.entries(sort || {});
  if (!entries.length) return ".sort()";

  return `.sort({${entries.map(([field, direction]) => `${field}: ${direction}`).join(", ")}})`;
};

const formatCell = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const EmptyResult = () => (
  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
    <Table2 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
    <p className="font-semibold text-slate-600">No result rows available</p>
    <p className="text-xs text-slate-400 mt-1">
      The generated sample data did not contain a displayable result.
    </p>
  </div>
);

export default MongoDB;