import React from 'react';
import { Database, Share2, Leaf, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TRIQLPlatform = () => {
  const navigate = useNavigate();

  const learningPaths = [
    {
      title: "SQL",
      subtitle: "Understand SQL visually",
      icon: <Database className="w-8 h-8 text-blue-500" />,
      color: "border-blue-500/20 hover:border-blue-500",
      bg: "bg-blue-50/50",
      description:
        "Master relational databases through interactive visual diagrams and real-time execution.",
      path: "/sql"
    },
    {
      title: "Neo4j → SQL",
      subtitle: "Learn SQL through Cypher",
      icon: <Share2 className="w-8 h-8 text-indigo-500" />,
      color: "border-indigo-500/20 hover:border-indigo-500",
      bg: "bg-indigo-50/50",
      description:
        "Translate graph thinking into relational logic. Perfect for Neo4j developers moving to SQL.",
      path: "/neo4j"
    },
    {
      title: "MongoDB → SQL",
      subtitle: "Learn SQL through MongoDB queries",
      icon: <Leaf className="w-8 h-8 text-emerald-500" />,
      color: "border-emerald-500/20 hover:border-emerald-500",
      bg: "bg-emerald-50/50",
      description:
        "Bridge the gap between NoSQL document stores and structured relational querying.",
      path: "/mongodb"
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-8 px-4 font-sans text-slate-900">

      {/* Header */}
      <header className="text-center mb-10">
        <div className="inline-block px-4 py-1.5 mb-3 text-xs font-semibold tracking-widest text-blue-600 uppercase bg-blue-100 rounded-full">
          Interactive Learning
        </div>

        <h1 className="text-6xl font-black tracking-tighter text-slate-900 mb-1">
          TRI<span className="text-blue-600">QL</span>
        </h1>

        <p className="text-xl text-slate-500 font-medium">
          Visual Query Learning Platform
        </p>
      </header>

      {/* Learning Paths */}
      <main className="max-w-5xl w-full">

        <h2 className="text-center text-sm font-bold tracking-[0.2em] text-slate-400 uppercase mb-7">
          What do you want to learn?
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">

          {learningPaths.map((item, index) => (
            <div
              key={index}
              onClick={() => navigate(item.path)}
              className={`group relative p-8 rounded-3xl border-2 transition-all duration-300 cursor-pointer bg-white hover:shadow-2xl hover:shadow-blue-200/50 hover:-translate-y-1 flex flex-col ${item.color} ${
                index === 2
                  ? 'md:col-span-2 md:w-1/2 md:mx-auto'
                  : ''
              }`}
            >

              <div
                className={`w-16 h-16 rounded-2xl ${item.bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
              >
                {item.icon}
              </div>

              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                {item.title}
              </h3>

              <p className="text-blue-600 font-semibold mb-4 text-sm uppercase tracking-wide">
                {item.subtitle}
              </p>

              <p className="text-slate-500 leading-relaxed mb-6">
                {item.description}
              </p>

              <div className="mt-auto flex items-center text-slate-900 font-bold group-hover:gap-2 transition-all">
                Get Started
                <ArrowRight className="w-5 h-5 ml-2 opacity-0 group-hover:opacity-100 transition-all" />
              </div>

            </div>
          ))}

        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 text-slate-400 text-sm">
        © {new Date().getFullYear()} TRIQL Platform • Built for Visual Learners
      </footer>

    </div>
  );
};

export default TRIQLPlatform;