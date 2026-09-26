import React from "react";
import { motion } from "framer-motion";

const stageVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.35, duration: 0.4, ease: "easeOut" }
  })
};

const arrowVariants = {
  hidden: { opacity: 0, scaleX: 0 },
  visible: (i) => ({
    opacity: 1,
    scaleX: 1,
    transition: { delay: i * 0.35 + 0.2, duration: 0.3, ease: "easeOut" }
  })
};

// Four-stage animated flow: outer query appears -> arrow into the
// subquery -> inner result returns -> parent query continues.
export default function ExecutionFlow({ outerLabel, subqueryLabel, correlated }) {
  const stages = [
    { key: "outer", label: outerLabel || "Outer Query" },
    { key: "into", label: `↓ executes ${subqueryLabel || "subquery"}` },
    { key: "result", label: correlated ? "Inner result (per outer row)" : "Inner result (computed once)" },
    { key: "continue", label: "↓ outer query continues" }
  ];

  return (
    <div className="sq-execution-flow">
      {stages.map((stage, i) => (
        <React.Fragment key={stage.key}>
          {i > 0 && (
            <motion.div
              className="sq-flow-arrow"
              custom={i}
              initial="hidden"
              animate="visible"
              variants={arrowVariants}
            />
          )}
          <motion.div
            className="sq-flow-stage"
            custom={i}
            initial="hidden"
            animate="visible"
            variants={stageVariants}
          >
            {stage.label}
          </motion.div>
        </React.Fragment>
      ))}
    </div>
  );
}