import React, { useState, useEffect } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { ModuleRegistry, ClientSideRowModelModule, CellStyleModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Tooltip as ReactTooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";
import api from "../services/api";


// Register AG Grid Modules
ModuleRegistry.registerModules([ClientSideRowModelModule, CellStyleModule]);


// ICONS COMPONENT
const Icons = {
  Join: () => <span style={styles.stepIcon}>🔗</span>,
  Filter: () => <span style={styles.stepIcon}>🔍</span>,
  Sort: () => <span style={styles.stepIcon}>↕️</span>,
  Group: () => <span style={styles.stepIcon}>📊</span>,
  Select: () => <span style={styles.stepIcon}>✨</span>,
  Default: () => <span style={styles.stepIcon}>⚙️</span>,
};

function StepIcon({ clause }) {
  const c = clause?.toUpperCase() || "";
  if (c.includes("JOIN")) return <Icons.Join />;
  if (c.includes("WHERE") || c.includes("HAVING")) return <Icons.Filter />;
  if (c.includes("ORDER")) return <Icons.Sort />;
  if (c.includes("GROUP") || c.includes("AGGREGATE")) return <Icons.Group />;
  if (c.includes("SELECT")) return <Icons.Select />;
  return <Icons.Default />;
}


// ANIMATED FILTER TABLE

function FilterAnimationTable({ prevRows, currRows, stepColumns, groups, groupColors, rowGroupColor, formatCell, runId }) {
  const [visibleRows, setVisibleRows] = useState(prevRows.length > 0 ? prevRows : currRows);

  useEffect(() => {
    setVisibleRows(prevRows.length > 0 ? prevRows : currRows);
    const timer = setTimeout(() => setVisibleRows(currRows), 600);
    return () => clearTimeout(timer);
  }, [prevRows, currRows]);

  const survivingKeys = new Set(currRows.map((r) => r._rowKey));

  return (
    <div style={styles.tableContainerInner}>
      <table style={styles.table}>
        <thead>
          <tr>{stepColumns.map((col) => <th key={col} style={styles.th}>{col}</th>)}</tr>
        </thead>
        <tbody>
          <AnimatePresence mode="popLayout">
            {visibleRows.map((row, i) => {
              const beingRemoved = !survivingKeys.has(row._rowKey);
              return (
                <motion.tr
                  key={`${runId}-f-${row._rowKey || i}`}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: beingRemoved ? 0.3 : 1,
                    scale: beingRemoved ? 0.96 : 1,
                    backgroundColor: beingRemoved ? "#fee2e2" : (rowGroupColor(row._rowKey, groups, groupColors) || "#ffffff")
                  }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.4 }}
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
    </div>
  );
}


export default function SQLPage() {
  const [sql, setSql] = useState("");
  const [steps, setSteps] = useState([]);
  const [summary, setSummary] = useState("");
  const [sampleData, setSampleData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [runId, setRunId] = useState(0);
  const [activeStepTab, setActiveStepTab] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  // FIX: Explicitly hits the axios instance using an explicit POST body mapping configuration
  const explainQuery = async () => {
    if (!sql.trim()) return;

    setLoading(true);
    setError("");

    try {
      // Calls axios instance configured with dynamic environment base URLs
 const data = await api.sql.analyze(sql.trim());


      console.log("SQL response:", data);

      if (data.success && data.data) {
        const result = data.data;

        setSteps(result.steps || []);
        setSummary(result.final_output_description || "");
        setSampleData(result.sample_data || {});
        setRunId((id) => id + 1);
        setActiveStepTab(0);
      } else {
        setError(
          data.error ||
            data.data?.explanation ||
            "Execution Error"
        );
      }
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to connect to the SQL backend."
      );
    } finally {
      setLoading(false);
    }
  };

  function clearOutput() {
    setSteps([]);
    setSummary("");
    setSampleData({});
    setError("");
    setActiveStepTab(0);
    setRunId((id) => id + 1);
  }
  // Helpers
  const getGroupColors = (groups) => {
    const palette = ["#eff6ff", "#f0fdf4", "#fffbeb", "#fef2f2", "#faf5ff"];
    const colors = {};
    if (groups) Object.keys(groups).forEach((g, i) => colors[g] = palette[i % palette.length]);
    return colors;
  };

  const rowGroupColor = (rowKey, groups, groupColors) => {
    if (!groups || !rowKey) return null;
    const found = Object.entries(groups).find(([, keys]) => keys.includes(rowKey));
    return found ? groupColors[found[0]] : null;
  };

  const formatCell = (v) => (v === null || v === undefined ? <span style={{ color: "#94a3b8" }}>Ø</span> : String(v));

  // Step Visual Logic
  function renderStepContent(step, prevStep) {
    const activeRows = step.output_rows || [];
    if (activeRows.length === 0) return <div style={styles.emptyPrompt}>Step resulted in 0 rows.</div>;

    const stepColumns = Object.keys(activeRows[0]).filter(k => k !== "_rowKey");
    const clause = step.clause.toUpperCase();

    // Aggregation / Group By View
    if (clause.includes("GROUP") || clause.includes("AGGREGATE")) {
      const numCol = stepColumns.find(c => typeof activeRows[0]?.[c] === 'number') || stepColumns[1] || stepColumns[0];
      const catCol = stepColumns.find(c => c !== numCol) || stepColumns[0];

      const chartData = activeRows.map(r => ({
        ...r,
        [numCol]: Number(r[numCol]) || 0
      }));

      return (
        <div style={{ height: 280, width: "100%", marginTop: '10px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey={catCol} axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#64748b' }} />
              <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: '#64748b' }} />
              <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
              <Bar dataKey={numCol} fill="#6366f1" radius={[6, 6, 0, 0]} barSize={35} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // Filter View
    if (clause.includes("WHERE") || clause.includes("HAVING")) {
      return <FilterAnimationTable
        prevRows={prevStep?.output_rows || []}
        currRows={activeRows}
        stepColumns={stepColumns}
        groups={step.groups}
        groupColors={getGroupColors(step.groups)}
        rowGroupColor={rowGroupColor}
        formatCell={formatCell}
        runId={runId}
      />;
    }

    if (clause.includes("GROUP BY")) {
      return <FilterAnimationTable
        prevRows={prevStep?.output_rows || []}
        currRows={activeRows}
        stepColumns={stepColumns}
        groups={step.groups}
        groupColors={getGroupColors(step.groups)}
        rowGroupColor={rowGroupColor}
        formatCell={formatCell}
        runId={runId}
        clauseType="GROUP BY"
        disableRemovalHighlight={true}
      />;
    }

    if (clause.includes("ORDER BY")) {
      return <FilterAnimationTable
        prevRows={prevStep?.output_rows || []}
        currRows={activeRows}
        stepColumns={stepColumns}
        groups={step.groups}
        groupColors={getGroupColors(step.groups)}
        rowGroupColor={rowGroupColor}
        formatCell={formatCell}
        runId={runId}
        clauseType="ORDER BY"
        disableRemovalHighlight={true}
      />;
    }

    if (clause.includes("DISTINCT")) {
      return <FilterAnimationTable
        prevRows={prevStep?.output_rows || []}
        currRows={activeRows}
        stepColumns={stepColumns}
        groups={step.groups}
        groupColors={getGroupColors(step.groups)}
        rowGroupColor={rowGroupColor}
        formatCell={formatCell}
        runId={runId}
        clauseType="DISTINCT"
      />;
    }

    if (clause.includes("LIMIT")) {
      return <FilterAnimationTable
        prevRows={prevStep?.output_rows || []}
        currRows={activeRows}
        stepColumns={stepColumns}
        groups={step.groups}
        groupColors={getGroupColors(step.groups)}
        rowGroupColor={rowGroupColor}
        formatCell={formatCell}
        runId={runId}
        clauseType="LIMIT"
      />;
    }

    // Default Table View
    return (
      <div style={styles.tableContainerInner}>
        <table style={styles.table}>
          <thead>
            <tr>{stepColumns.map(c => <th key={c} style={styles.th}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {activeRows.map((r, i) => (
              <tr key={i} style={{ backgroundColor: rowGroupColor(r._rowKey, step.groups, getGroupColors(step.groups)) }}>
                {stepColumns.map(c => <td key={c} style={styles.td}>{formatCell(r[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={styles.pageBackground}>
      <div style={styles.navbar}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>⚡</span>
          <span>SQL Visualizer <span style={{ fontWeight: 300, color: "#94a3b8" }}>Pro</span></span>
        </div>
      </div>

      <div style={styles.mainGrid}>
        {/* SIDEBAR: INPUT */}
        <div style={styles.editorSection}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>SQL Input</h2>
              <span style={styles.statusDot}></span>
            </div>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="SELECT * FROM users WHERE status = 'active'..."
              style={{
                ...styles.textarea,
                ...(isFocused ? styles.textareaFocus : {})
              }}
            />

            <button
              onClick={explainQuery}
              disabled={loading}
              style={styles.primaryButton}
            >
              {loading ? "Analyzing Execution..." : "Run Visualizer"}
            </button>

            {(steps.length > 0 ||
              Object.keys(sampleData).length > 0 ||
              error) && (
                <button
                  onClick={clearOutput}
                  style={styles.clearButton}
                >
                  ✕ Clear Output
                </button>
              )}

          </div>

          {error && <div style={styles.errorBanner}>{error}</div>}

          {Object.keys(sampleData).length > 0 && (
            <div style={{ ...styles.card, marginTop: "20px" }}>
              <div style={styles.cardHeader}><h2 style={styles.cardTitle}>Database Context</h2></div>
              <div style={styles.scrollArea}>
                {Object.entries(sampleData).map(([name, rows]) => (
                  <div key={name} style={styles.miniTableWrapper}>
                    <div style={styles.miniTableName}>{name}</div>
                    <table style={styles.tableMini}>
                      <tbody>
                        {rows.slice(0, 3).map((r, i) => (
                          <tr key={i}>{Object.values(r).map((v, j) => <td key={j} style={styles.tdMini}>{formatCell(v)}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CONTENT: VISUALIZATION */}
        <div style={styles.vizSection}>
          {steps.length > 0 ? (
            <>
              <div style={styles.stepperContainer}>
                {steps.map((step, idx) => (
                  <div
                    key={idx}
                    onClick={() => setActiveStepTab(idx)}
                    style={{
                      ...styles.stepTab,
                      borderColor: activeStepTab === idx ? "#6366f1" : "transparent",
                      background: activeStepTab === idx ? "#fff" : "transparent",
                      boxShadow: activeStepTab === idx ? "0 4px 6px -1px rgba(0,0,0,0.05)" : "none"
                    }}
                  >
                    <div style={{ ...styles.stepTabNumber, background: activeStepTab === idx ? "#6366f1" : "#e2e8f0", color: activeStepTab === idx ? "#fff" : "#64748b" }}>{idx + 1}</div>
                    <div style={{ ...styles.stepTabLabel, color: activeStepTab === idx ? "#1e293b" : "#94a3b8" }}>{step.clause.split(' ')[0]}</div>
                  </div>
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={`${runId}-${activeStepTab}`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  style={styles.activeStepCard}
                >
                  <div style={styles.stepHeaderRow}>
                    <StepIcon clause={steps[activeStepTab].clause} />
                    <div style={{ flex: 1 }}>
                      <h3 style={styles.activeStepTitle}>{steps[activeStepTab].clause}</h3>
                      <p style={styles.activeStepDesc}>{steps[activeStepTab].explanation}</p>
                    </div>
                  </div>

                  <div style={styles.codeSnippet}>
                    <code>{steps[activeStepTab].sql_fragment}</code>
                  </div>

                  <div style={styles.vizContent}>
                    {renderStepContent(steps[activeStepTab], steps[activeStepTab - 1])}
                  </div>
                </motion.div>
              </AnimatePresence>

              {summary && activeStepTab === steps.length - 1 && (
                <div style={styles.summaryCard}>
                  <strong>Final Observation:</strong> {summary}
                </div>
              )}
            </>
          ) : (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>🧪</div>
              <h3>Execution Engine Ready</h3>
              <p>Enter your SQL query and click run to visualize the internal relational algebra steps.</p>
            </div>
          )}
        </div>
      </div>
      <ReactTooltip id="alias-tooltip" />
    </div>
  );
}


// STYLES OBJECT

const styles = {
  pageBackground: { minHeight: "100vh", backgroundColor: "#f8fafc", fontFamily: "'Inter', sans-serif", color: "#1e293b" },
  navbar: { height: "64px", backgroundColor: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", padding: "0 40px", position: "sticky", top: 0, zIndex: 50 },
  logo: { fontWeight: 800, fontSize: "20px", display: "flex", alignItems: "center", gap: "12px" },
  logoIcon: { background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)", color: "#fff", padding: "6px", borderRadius: "8px", fontSize: "16px" },
  mainGrid: { display: "grid", gridTemplateColumns: "400px 1fr", gap: "32px", padding: "32px 40px", maxWidth: "1600px", margin: "0 auto" },

  editorSection: { display: "flex", flexDirection: "column" },
  card: { backgroundColor: "#fff", borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden" },
  cardHeader: { padding: "18px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: '0.05em', color: "#64748b", margin: 0 },
  statusDot: { width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" },

  // THE LILLIET TEXTAREA
  // Update your styles object:
  textarea: {
    width: "100%",
    height: "260px",
    padding: "20px",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#f1f5f9", // Non-shorthand to match focus state safely
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "14px",
    lineHeight: "1.7",
    outline: "none",
    resize: "none",
    boxSizing: "border-box",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    backgroundColor: "#ffffff",
    boxShadow: "0 10px 25px -5px rgba(232, 221, 255, 0.8), 0 8px 10px -6px rgba(232, 221, 255, 0.4)",
  },
  textareaFocus: {
    borderColor: "#a855f7", // Safely overrides borderColor without style bugs
    boxShadow: "0 20px 35px -10px rgba(168, 85, 247, 0.25), 0 0 0 4px rgba(168, 85, 247, 0.1)",
  },

  primaryButton: { margin: "20px", padding: "14px", borderRadius: "12px", border: "none", backgroundColor: "#6366f1", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer", transition: "transform 0.1s", boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)" },
  vizSection: { display: "flex", flexDirection: "column", gap: "24px" },
  stepperContainer: { display: "flex", gap: "10px", paddingBottom: "5px", overflowX: "auto" },
  stepTab: { padding: "12px 20px", borderRadius: "14px", border: "2px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", transition: "all 0.2s" },
  stepTabNumber: { width: "22px", height: "22px", borderRadius: "50%", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 },
  stepTabLabel: { fontSize: "14px", fontWeight: 700 },

  activeStepCard: { backgroundColor: "#fff", borderRadius: "20px", border: "1px solid #e2e8f0", padding: "32px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.03)" },
  stepHeaderRow: { display: "flex", gap: "20px", marginBottom: "24px" },
  stepIcon: { fontSize: "22px", padding: "12px", background: "#f5f3ff", borderRadius: "14px", display: 'flex', alignItems: 'center' },
  activeStepTitle: { margin: "0 0 6px 0", fontSize: "22px", fontWeight: 800, color: "#0f172a" },
  activeStepDesc: { margin: 0, color: "#64748b", fontSize: "15px", lineHeight: "1.6" },

  codeSnippet: { backgroundColor: "#0f172a", padding: "18px", borderRadius: "12px", color: "#cbd5e1", fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", marginBottom: "28px", border: "1px solid #1e293b" },
  vizContent: { marginTop: "10px" },
  tableContainerInner: { borderRadius: "14px", border: "1px solid #f1f5f9", overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "14px" },
  th: { backgroundColor: "#f8fafc", padding: "14px", textAlign: "left", fontWeight: 700, borderBottom: "2px solid #f1f5f9", color: "#475569" },
  td: { padding: "14px", borderBottom: "1px solid #f1f5f9", color: "#334155" },

  summaryCard: { padding: "24px", backgroundColor: "#f0fdf4", borderRadius: "16px", border: "1px solid #dcfce7", color: "#166534", fontSize: "15px", lineHeight: "1.6" },
  emptyState: { textAlign: "center", padding: "120px 40px", color: "#94a3b8" },
  emptyIcon: { fontSize: "56px", marginBottom: "20px", opacity: 0.5 },
  emptyPrompt: { textAlign: "center", padding: "40px", color: "#94a3b8", fontStyle: "italic" },

  miniTableWrapper: { marginBottom: "20px", padding: "0 20px" },
  miniTableName: { fontSize: "11px", fontWeight: 900, color: "#6366f1", marginBottom: "6px", textTransform: "uppercase" },
  tableMini: { width: "100%", fontSize: "11px", borderCollapse: "collapse" },
  tdMini: { padding: "6px 10px", border: "1px solid #f1f5f9", color: "#64748b" },
  errorBanner: { margin: "20px", padding: "16px", background: "#fef2f2", color: "#991b1b", borderRadius: "12px", fontSize: "14px", border: "1px solid #fee2e2" },
  scrollArea: { maxHeight: "450px", overflowY: "auto", paddingBottom: "20px" },

  clearButton: {
  margin: "0 20px 20px 20px",
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  backgroundColor: "#fff",
  color: "#64748b",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
  transition: "all 0.2s"
},
};