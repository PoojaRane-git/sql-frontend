import ReactFlow from "reactflow";
import "reactflow/dist/style.css";

export default function JoinFlow({ step }) {
  const joinType = (step.join_type || "").toUpperCase();
  const rightLabel = step.join_alias || step.join_table || "Right Table Schema";
  let nodes, edges;

  if (joinType.includes("LEFT")) {
    nodes = [
      { id: "l", data: { label: "Left Table (kept in full)" }, position: { x: 30, y: 60 } },
      { id: "r", data: { label: rightLabel }, position: { x: 320, y: 60 } },
      { id: "null", data: { label: "NULLs where no match" }, position: { x: 320, y: 160 }, style: { background: "#fee2e2", fontSize: 11 } }
    ];
    edges = [
      { id: "e1", source: "l", target: "r", animated: true, label: "Matched rows" },
      { id: "e2", source: "l", target: "null", animated: true, label: "Unmatched left rows", style: { stroke: "#f87171" } }
    ];
  } else if (joinType.includes("RIGHT")) {
    nodes = [
      { id: "l", data: { label: "Left Table" }, position: { x: 30, y: 60 } },
      { id: "r", data: { label: `${rightLabel} (kept in full)` }, position: { x: 320, y: 60 } },
      { id: "null", data: { label: "NULLs where no match" }, position: { x: 30, y: 160 }, style: { background: "#fee2e2", fontSize: 11 } }
    ];
    edges = [
      { id: "e1", source: "r", target: "l", animated: true, label: "Matched rows" },
      { id: "e2", source: "r", target: "null", animated: true, label: "Unmatched right rows", style: { stroke: "#f87171" } }
    ];
  } else if (joinType.includes("FULL")) {
    nodes = [
      { id: "l", data: { label: "Left Table (all rows)" }, position: { x: 30, y: 30 } },
      { id: "r", data: { label: `${rightLabel} (all rows)` }, position: { x: 320, y: 30 } },
      { id: "nulll", data: { label: "NULL right side" }, position: { x: 30, y: 150 }, style: { background: "#fee2e2", fontSize: 11 } },
      { id: "nullr", data: { label: "NULL left side" }, position: { x: 320, y: 150 }, style: { background: "#fee2e2", fontSize: 11 } }
    ];
    edges = [
      { id: "e1", source: "l", target: "r", animated: true, label: "Matched rows" },
      { id: "e2", source: "l", target: "nulll", animated: true, style: { stroke: "#f87171" } },
      { id: "e3", source: "r", target: "nullr", animated: true, style: { stroke: "#f87171" } }
    ];
  } else {
    nodes = [
      { id: "l", data: { label: "Left Table Schema" }, position: { x: 50, y: 60 } },
      { id: "r", data: { label: rightLabel }, position: { x: 320, y: 60 } }
    ];
    edges = [
      { id: "e1", source: "l", target: "r", animated: true, label: "Matched rows only" }
    ];
  }

  return (
    <div style={{ height: 200, width: "100%", border: "1px solid #e5e5e5", borderRadius: "8px", marginTop: "10px" }}>
      <ReactFlow nodes={nodes} edges={edges} fitView />
    </div>
  );
}