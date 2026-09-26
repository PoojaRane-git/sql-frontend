import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect,useState } from "react";
// Pages
import TRIQLPlatform from "./pages/Home/TRIQLPlatform";
import SQLPage from "./pages/SQL/SQLPage";
// import MongoDBPage from "./pages/MongoDB/MongoDBPage";
// import Neo4jPage from "./pages/Neo4j/Neo4jPage";
import Neo4jPage from './pages/Neo4j/Neo4jPage';
import Neo4jVisualizer from "./pages/Neo4j/Neo4jVisualizer";
import MongoDB from "./pages/MongoDB/MongoDB";

function App() {
return (

    <BrowserRouter>

    {/* <nav style={{ padding: "10px", background: "#f0f0f0", marginBottom: "20px" }}>
        <Link to="/" style={{ marginRight: "15px" }}>Home</Link>
        <Link to="/sql">SQL Visualizer</Link>
      </nav> */}
     <Routes>
        {/* <p style={{ paddingLeft: "10px", color: "#666" }}>
        <small>Backend Status: {title}</small>
      </p> */}

    //     {/* Home */}
    //     <Route path="/" element={<TRIQLPlatform />} />

    //     {/* SQL Visualizer */}
    //     <Route path="/sql" element={<SQLPage />} />

    //     {/* MongoDB → SQL */}
   <Route path="/mongodb" element={<MongoDB />} />

        {/* Neo4j → SQL */}
        { <Route path="/neo4j" element={<Neo4jPage />} /> }
        <Route
  path="/neo4j/visualizer"
  element={<Neo4jVisualizer />}
/>

    //     {/* Invalid URL → Home */}
    //     <Route path="*" element={<TRIQLPlatform />} />

    </Routes>
    </BrowserRouter>

    
  );
}

export default App; 