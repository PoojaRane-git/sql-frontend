package com.example.springAI.parser;

import com.example.springAI.model.Neo4jStep;
import org.neo4j.cypherdsl.core.Statement;
import org.neo4j.cypherdsl.parser.CypherParser;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class Neo4jParser {                     // ← renamed outer class

    public Neo4jParsedQuery parse(String cypher) {

        if (cypher == null || cypher.trim().isEmpty()) {
            throw new IllegalArgumentException("Cypher query cannot be empty.");
        }

        String query = cypher.trim();

        try {
            Statement statement = CypherParser.parseStatement(query);
            String parsedCypher = statement.getCypher();
            String sql = "";
            List<Neo4jStep> steps = buildBasicSteps(parsedCypher);

            return new Neo4jParsedQuery(parsedCypher, sql, steps, statement);

        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid Cypher query: " + e.getMessage(), e);
        }
    }


    /**
     * Creates the initial visualization operations.
     *
     * These are only high-level educational steps.
     * Ollama will later generate the detailed explanation.
     */
    private List<Neo4jStep> buildBasicSteps(
            String cypher
    ) {

        List<Neo4jStep> steps =
                new ArrayList<>();

        /*
         * Every query containing MATCH starts with
         * graph pattern matching.
         */
        if (cypher.toUpperCase().contains("MATCH")) {

            steps.add(
                    new Neo4jStep(
                            "MATCH",
                            cypher,
                            "",
                            "MATCH searches for nodes and relationships that satisfy the graph pattern."
                    )
            );
        }

        /*
         * WHERE filters the matched result.
         */
        if (cypher.toUpperCase().contains("WHERE")) {

            steps.add(
                    new Neo4jStep(
                            "WHERE",
                            cypher,
                            "",
                            "WHERE filters the matched graph data using a condition."
                    )
            );
        }

        /*
         * RETURN selects the result.
         */
        if (cypher.toUpperCase().contains("RETURN")) {

            steps.add(
                    new Neo4jStep(
                            "RETURN",
                            cypher,
                            "",
                            "RETURN selects the values that should be displayed."
                    )
            );
        }

        /*
         * ORDER BY sorts the result.
         */
        if (cypher.toUpperCase().contains("ORDER BY")) {

            steps.add(
                    new Neo4jStep(
                            "ORDER BY",
                            cypher,
                            "",
                            "ORDER BY sorts the returned results."
                    )
            );
        }

        /*
         * LIMIT restricts the result size.
         */
        if (cypher.toUpperCase().contains("LIMIT")) {

            steps.add(
                    new Neo4jStep(
                            "LIMIT",
                            cypher,
                            "",
                            "LIMIT restricts the number of results returned."
                    )
            );
        }

        return steps;
    }

    /**
     * Parsed Neo4j query.
     */
    public static class Neo4jParsedQuery {

        private final String parsedCypher;

        private final String sql;

        private final List<Neo4jStep> steps;

        private final Statement statement;

        public Neo4jParsedQuery(
                String parsedCypher,
                String sql,
                List<Neo4jStep> steps,
                Statement statement
        ) {

            this.parsedCypher = parsedCypher;
            this.sql = sql;
            this.steps = steps;
            this.statement = statement;
        }

        public String getParsedCypher() {
            return parsedCypher;
        }

        public String getSql() {
            return sql;
        }

        public List<Neo4jStep> getSteps() {
            return steps;
        }

        public Statement getStatement() {
            return statement;
        }
    }
}