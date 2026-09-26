import { motion } from "framer-motion";
import { styles } from "../../styles/styles";

export default function UnionAnimation({ activeRows, stepColumns, formatCell }) {
  return (
    <div style={styles.tableWrapper}>
      <table style={styles.table}>
        <thead>
          <tr>
            {stepColumns.map((col) => (
              <th key={col} style={styles.th}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activeRows.map((row, i) => (
            <motion.tr
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              {stepColumns.map((col) => (
                <td key={col} style={styles.td}>{formatCell(row[col])}</td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}