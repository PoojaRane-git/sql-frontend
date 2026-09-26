import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

export default function SelectGrid({ activeRows, stepColumns, columnAliases }) {
  const rowData = activeRows.map(r => {
    const copy = {};
    stepColumns.forEach(c => copy[c] = r[c]);
    return copy;
  });

  const columnDefs = stepColumns.map(col => {
    const original = columnAliases && columnAliases[col];
    return {
      field: col,
      headerName: original ? `${col} *` : col,
      headerTooltip: original ? `Originally: ${original}` : undefined,
      cellStyle: { backgroundColor: '#f0fdf4', borderRight: '1px solid #d1fae5' },
      sortable: true,
      filter: true,
    };
  });

  return (
    <div className="ag-theme-alpine" style={{ height: 400, width: '100%', marginTop: '10px' }}>
      <AgGridReact
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={{ flex: 1, minWidth: 100, resizable: true }}
        pagination={true}
        paginationPageSize={10}
        rowSelection="multiple"
      />
    </div>
  );
}
