import React from "react";
import { motion } from "framer-motion";
import SubqueryNode from "./SubqueryNode";
import ResultTable from "./ResultTable";

// Outer Query
//   |
//   ├── Subquery 1
//   ├── Subquery 2
//   ...
// steps: the full steps[] array from /generate (already ordered by the
// backend's enforceExecutionOrder — SUBQUERY steps sort first).
export default function SubqueryTree({ query, steps, finalOutputDescription }) {
  const subquerySteps = (steps || []).filter(
    (s) => (s.clause || "").toUpperCase().replace(/\s+/g, "_") === "SUBQUERY"
  );
  const finalStep = (steps || []).find((s) => (s.clause || "").toUpperCase() === "LIMIT")
    || (steps || []).find((s) => (s.clause || "").toUpperCase() === "SELECT");

  return (
    <div className="sq-tree">
      <motion.div
        className="sq-root-node"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="sq-root-label">Outer Query</div>
        <code className="sq-root-fragment">{query}</code>
      </motion.div>

      {subquerySteps.length > 0 && (
        <div className="sq-tree-branch">
          <div className="sq-tree-line" />
          <div className="sq-tree-children">
            {subquerySteps.map((step, i) => (
              <div className="sq-tree-child" key={step.step_number || i}>
                <div className="sq-tree-connector" />
                <SubqueryNode step={step} index={i} outerLabel="Outer Query" />
              </div>
            ))}
          </div>
        </div>
      )}

      {finalStep && (
        <motion.div
          className="sq-final-result"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: subquerySteps.length * 0.15 + 0.3, duration: 0.4 }}
        >
          <div className="sq-final-label">Final Result</div>
          {finalOutputDescription && <p className="sq-final-desc">{finalOutputDescription}</p>}
          <ResultTable rows={finalStep.output_rows} emptyLabel="No final rows" />
        </motion.div>
      )}
    </div>
  );
}