import React from "react";
import {
  Search,
  Filter,
  GitBranch,
  Network,
  Calculator,
  Layers,
  ArrowDownUp,
  Split,
} from "lucide-react";

const concepts = [
  {
    id: "match",
    title: "MATCH",
    description: "Find nodes from the graph",
    icon: Search,
  },
  {
    id: "match-where",
    title: "MATCH + WHERE",
    description: "Find and filter nodes",
    icon: Filter,
  },
  {
    id: "relationship",
    title: "Relationship",
    description: "Traverse a relationship",
    icon: GitBranch,
  },
  {
    id: "multiple-relationship",
    title: "Multiple Relationships",
    description: "Traverse multiple relationships",
    icon: Network,
  },
  {
    id: "aggregation",
    title: "Aggregation",
    description: "COUNT and grouped results",
    icon: Calculator,
  },
  {
    id: "with-having",
    title: "WITH + HAVING",
    description: "Filter aggregated results",
    icon: Layers,
  },
  {
    id: "order-limit",
    title: "ORDER BY + LIMIT",
    description: "Sort and restrict results",
    icon: ArrowDownUp,
  },
  {
    id: "optional-match",
    title: "OPTIONAL MATCH",
    description: "Neo4j equivalent of LEFT JOIN",
    icon: Split,
  },
];

export default function Neo4jConceptSelector({
  selectedConcept,
  onSelect,
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {concepts.map((concept) => {
        const Icon = concept.icon;
        const active = selectedConcept === concept.id;

        return (
          <button
            key={concept.id}
            type="button"
            onClick={() => onSelect(concept.id)}
            className={`text-left rounded-xl border p-4 transition-all ${
              active
                ? "border-blue-500 bg-blue-50 shadow-sm"
                : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                active
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              <Icon size={20} />
            </div>

            <h3 className="font-semibold text-slate-900">
              {concept.title}
            </h3>

            <p className="text-sm text-slate-500 mt-1">
              {concept.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}