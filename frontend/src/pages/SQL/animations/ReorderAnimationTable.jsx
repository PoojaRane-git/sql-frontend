import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { styles } from "../../../styles/styles";

export default function ReorderAnimationTable({
  prevRows,
  currRows,
  stepColumns,
  groups,
  groupColors,
  rowGroupColor,
  formatCell,
  runId,
  stepIndex,
}) {
  const [orderedRows, setOrderedRows] = useState(
    prevRows.length > 0 ? prevRows : currRows
  );

  useEffect(() => {
    setOrderedRows(prevRows.length > 0 ? prevRows : currRows);
    const timer = setTimeout(() => setOrderedRows(currRows), 600);
    return () => clearTimeout(timer);
  }, [prevRows, currRows]);

  return (
    <div
      style={{
        display: "inline-block",
        borderCollapse: "collapse",
        ...styles.table,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", ...styles.th }}>
        {stepColumns.map((col) => (
          <div
            key={col}
            style={{
              flex: 1,
              minWidth: 120,
              padding: "8px 12px",
              fontWeight: "bold",
            }}
          >
            {col}
          </div>
        ))}
      </div>

      {/* Body rows */}
      {orderedRows.map((row, i) => {
        const key = row._rowKey
          ? `${runId}-${row._rowKey}`
          : `${runId}-ord-${stepIndex}-${i}`;
        return (
          <motion.div
            key={key}
            layout
            transition={{ duration: 0.6, ease: "easeInOut" }}
            style={{
              display: "flex",
              backgroundColor:
                rowGroupColor(row._rowKey, groups, groupColors) || "#ffffff",
            }}
          >
            {stepColumns.map((col) => (
              <div
                key={col}
                style={{
                  flex: 1,
                  minWidth: 120,
                  padding: "8px 12px",
                  ...styles.td,
                }}
              >
                {formatCell(row[col])}
              </div>
            ))}
          </motion.div>
        );
      })}
    </div>
  );
}
