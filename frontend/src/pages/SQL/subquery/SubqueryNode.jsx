import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExecutionFlow from "./ExecutionFlow";
import ResultTable from "./ResultTable";

// A single subquery in the tree: SUBQUERY | FROM | IN | NOT_IN | EXISTS |
// NOT_EXISTS | SCALAR | SELECT_EXPRESSION | HAVING | ORDER_BY.
export default function SubqueryNode({ step, index, outerLabel }) {
  const [expanded, setExpanded] = useState(false);
  const correlated = /correlated/i.test(step.explanation || "");

  return (
    <motion.div
      className="sq-node"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.15, duration: 0.35 }}
    >
      <button className="sq-node-header" onClick={() => setExpanded((e) => !e)}>
        <span className="sq-node-badge">{step.clause || "SUBQUERY"}</span>
        <code className="sq-node-fragment">{step.sql_fragment}</code>
        <span className="sq-node-toggle">{expanded ? "−" : "+"}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="sq-node-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <p className="sq-node-explanation">{step.explanation}</p>
            <ExecutionFlow
              outerLabel={outerLabel}
              subqueryLabel={step.clause}
              correlated={correlated}
            />
            <ResultTable rows={step.output_rows} emptyLabel="Subquery returned no rows" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}