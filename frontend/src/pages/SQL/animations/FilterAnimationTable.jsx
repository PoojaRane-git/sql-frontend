import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { styles } from "../../styles/styles";

export const ANIMATED_CLAUSES = [
  "WHERE",
  "GROUP BY",
  "HAVING",
  "ORDER BY",
  "DISTINCT",
  "LIMIT"
];

function FilterAnimationTable({
  prevRows,
  currRows,
  stepColumns,
  groups,
  groupColors,
  rowGroupColor,
  formatCell,
  runId,
  clauseType,
  disableRemovalHighlight = false,
  stepIndex
}) {
  const [visibleRows, setVisibleRows] = useState(
    prevRows.length > 0 ? prevRows : currRows
  );

  useEffect(() => {
    setVisibleRows(
      prevRows.length > 0 ? prevRows : currRows
    );

    const timer = setTimeout(() => {
      setVisibleRows(currRows);
    }, 600);

    return () => clearTimeout(timer);
  }, [prevRows, currRows]);

  // Keys of rows that survived this step
  const survivingKeys = new Set(
    currRows.map((row, index) =>
      row._rowKey ?? `current-${index}`
    )
  );

  return (
    <div style={styles.tableContainerInner}>

      {clauseType && (
        <div
          style={{
            fontSize: "12px",
            fontWeight: 600,
            padding: "8px 14px",
            opacity: 0.6
          }}
        >
          {clauseType}
        </div>
      )}

      <table style={styles.table}>

        <thead>
          <tr>
            {stepColumns.map((col) => (
              <th
                key={col}
                style={styles.th}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          <AnimatePresence mode="popLayout">

            {visibleRows.map((row, i) => {

              const rowKey =
                row._rowKey ?? `row-${stepIndex}-${i}`;

              const survives =
                survivingKeys.has(
                  row._rowKey ?? `current-${i}`
                );

              const beingRemoved =
                !disableRemovalHighlight &&
                prevRows.length > 0 &&
                !survives;

              return (
                <motion.tr
                  key={`${runId}-f-${rowKey}`}

                  layout

                  initial={{
                    opacity: 0
                  }}

                  animate={{
                    opacity: beingRemoved ? 0.3 : 1,

                    scale: beingRemoved
                      ? 0.96
                      : 1,

                    backgroundColor:
                      beingRemoved
                        ? "#fee2e2"
                        : (
                            rowGroupColor(
                              row._rowKey,
                              groups,
                              groupColors
                            ) || "#ffffff"
                          )
                  }}

                  exit={{
                    opacity: 0,
                    x: -20
                  }}

                  transition={{
                    duration: 0.4
                  }}
                >

                  {stepColumns.map((col) => (
                    <td
                      key={col}
                      style={styles.td}
                    >
                      {formatCell(row[col])}
                    </td>
                  ))}

                </motion.tr>
              );
            })}

          </AnimatePresence>
        </tbody>

      </table>
    </div>
  );
}

export default FilterAnimationTable;