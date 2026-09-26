import ReactFlow from "reactflow";
import "reactflow/dist/style.css";

export default function SubqueryFlow() {
  const nodes = [
    { id: '1', data: { label: 'Parent Table Query' }, position: { x: 175, y: 20 } },
    { id: '2', data: { label: 'Nested Subquery Table' }, position: { x: 175, y: 120 } }
  ];

  const edges = [
    { id: 'e2-1', source: '2', target: '1', animated: true, label: 'Returns Table Dataset' }
  ];

  return (
    <div style={{ height: 180, width: '100%', border: '1px solid #e5e5e5', borderRadius: '8px', marginTop: '10px' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView />
    </div>
  );
}