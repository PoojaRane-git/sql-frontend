import { motion, AnimatePresence } from "framer-motion";
import { styles } from "../../../styles/styles";

export default function OutputTable({ activeRows, stepColumns, columnAliases, groups, groupColors, rowGroupColor, formatCell, runId, stepNumber }) {
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          {stepColumns.map((col) => {
            const original = columnAliases && columnAliases[col];
            return (
              <th key={col} style={styles.th}>
                {col}{" "}
                {original && (
                  <span
                    style={styles.badge}
                    data-tooltip-id="alias-tooltip"
                    data-tooltip-content={`Originally: ${original}`}
                  >
                    Alias
                  </span>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        <AnimatePresence mode="popLayout">
          {activeRows.map((row, i) => {
            const uniqueRowKey = row._rowKey
              ? `${runId}-${row._rowKey}`
              : `${runId}-row-${stepNumber}-${i}`;
            return (
              <motion.tr
                key={uniqueRowKey}
                layout
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.3 }}
                style={{ backgroundColor: rowGroupColor(row._rowKey, groups, groupColors) || "#fff" }}
              >
                {stepColumns.map((col) => (
                  <td key={col} style={styles.td}>{formatCell(row[col])}</td>
                ))}
              </motion.tr>
            );
          })}
        </AnimatePresence>
      </tbody>
    </table>
  );
}