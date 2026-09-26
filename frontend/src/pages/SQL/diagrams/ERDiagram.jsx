import ReactFlow from "reactflow";
import "reactflow/dist/style.css";

export default function ERDiagram() {
  const nodes = [
    { id: '1', data: { label: 'Table Schema A' }, position: { x: 50, y: 50 } },
    { id: '2', data: { label: 'Table Schema B' }, position: { x: 300, y: 50 } }
  ];

  const edges = [
    { id: 'e1-2', source: '1', target: '2', animated: true, label: 'Table Relations' }
  ];

  return (
    <div style={{ height: 180, width: '100%', border: '1px solid #e5e5e5', borderRadius: '8px', marginTop: '10px' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView />
    </div>
  );
}   