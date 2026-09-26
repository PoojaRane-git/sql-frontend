package com.example.springAI.service;

import java.util.List;
import java.util.Map;

public final class Neo4jPromptBuilder {

    private Neo4jPromptBuilder() {
    }

    /**
     * Stage 1 (qwen2.5-coder:7b): Cypher AST -> equivalent SQL.
     */
    public static String buildSqlConversionPrompt(
            String cypherQuery,
            String parsedCypherAst
    ) {

        return """
                You are a precise Cypher-to-SQL translation engine
                for TRIQL, a visual query learning platform.

                You will be given a Neo4j Cypher query and its
                parsed/normalized AST form. Translate it into the
                closest equivalent relational SQL, assuming each
                node label maps to a table and each relationship
                maps to a join (via a foreign key or junction table).

                Cypher (original):
                %s

                Parsed Cypher (AST-normalized):
                %s

                STRICT RULES — violating any of these makes the
                output unusable:
                1. Do NOT invent tables, columns, or relationships
                   that are not directly implied by the Cypher query.
                2. Every node label becomes a table name in
                   PascalCase exactly as written in the query.
                3. Every relationship becomes a JOIN condition using
                   a foreign key named "<TargetTable>Id" unless the
                   relationship implies a many-to-many junction
                   table, in which case name it
                   "<TableA>_<TableB>".
                4. Preserve WHERE, ORDER BY, and LIMIT semantics
                   exactly — do not drop, reorder, or add filters.
                5. If the Cypher query cannot be meaningfully
                   translated to SQL (e.g. variable-length paths,
                   graph algorithms), set "translatable" to false
                   and explain why in "notes" — do NOT force an
                   incorrect SQL approximation.
                                6. "tables" must list EVERY table that appears
                                 anywhere in "sql" — including intermediate
                                 join/junction tables that only appear inside a
                                 JOIN clause and never in SELECT or WHERE. Before
                                 finalizing your answer, scan every FROM and JOIN
                                 clause in "sql" one by one and confirm each table
                                 name has a matching entry in "tables". A junction
                                 table like "Purchased" that only carries foreign
                                 keys still needs its own entry, e.g.
                                 "Purchased": ["UserId", "ProductId"]. Every
                                 column named in "sql" must appear in "tables",
                                 and every column in "tables" must be used in
                                 "sql".
                7. Output ONLY raw JSON. No markdown fences, no
                   commentary, no leading or trailing text.

                Required JSON structure (exact keys, exact types):

                {
                  "translatable": true,
                  "sql": "SELECT ... FROM ... WHERE ...",
                  "tables": {
                    "TableName": ["column1", "column2"]
                  },
                  "notes": "brief note on any translation caveats, or empty string"
                }
                """.formatted(
                cypherQuery,
                parsedCypherAst
        );
    }
    /**
     * Stage 2 (qwen2.5:7b): SQL + Cypher -> logical execution steps.
     */

    public static String buildStepsPrompt(
            String cypherQuery,
            String sqlQuery
    ) {

        String upperCypher = cypherQuery.toUpperCase();
        boolean hasRelationship = cypherQuery.matches("(?s).*\\)\\s*-+\\s*\\[.*\\]\\s*-+>?\\s*\\(.*");
        boolean hasAggregate = upperCypher.matches("(?s).*\\b(COUNT|SUM|AVG|MIN|MAX|COLLECT)\\s*\\(.*");

        StringBuilder checklist = new StringBuilder();
        if (upperCypher.contains("MATCH")) checklist.append("- MATCH\n");
        if (hasRelationship) checklist.append("- JOIN (implied by the relationship pattern in MATCH — every relationship becomes its own JOIN step, listed right after MATCH)\n");
        if (upperCypher.contains("WHERE")) checklist.append("- WHERE\n");
        if (upperCypher.contains("WITH")) checklist.append("- WITH\n");
        if (upperCypher.contains("GROUP BY") || hasAggregate) checklist.append("- GROUP BY (only if the query groups by a non-aggregated field)\n");
        if (hasAggregate) checklist.append("- AGGREGATE (COUNT/SUM/AVG/MIN/MAX/COLLECT)\n");
        if (upperCypher.contains("HAVING")) checklist.append("- HAVING\n");
        if (upperCypher.contains("RETURN")) checklist.append("- RETURN\n");
        if (upperCypher.contains("ORDER BY")) checklist.append("- ORDER BY\n");
        if (upperCypher.contains("SKIP")) checklist.append("- SKIP\n");
        if (upperCypher.contains("LIMIT")) checklist.append("- LIMIT\n");

        return """
            You are an educational assistant for TRIQL,
            a visual query learning platform for students
            learning how Cypher graph queries map to
            relational execution.

            Cypher:
            %s

            Equivalent relational SQL representation:
            %s

            The query contains EXACTLY these clauses/operations —
            you MUST produce one step object for EACH ONE listed
            below, in this order, no more, no fewer:
            %s

            TASK: Break the query into an ORDERED sequence of
            logical execution steps a beginner can follow,
            matching Cypher clauses to their SQL counterparts.

            STRICT RULES — violating any of these makes the
            output unusable:
            1. You MUST include a step for every item listed in
               the checklist above — missing even one makes the
               response incomplete and unusable.
            2. A relationship pattern like (a)-[:REL]->(b) means
               a JOIN step is required even though "JOIN" never
               appears as a literal word in the Cypher. Describe
               it as combining the two related tables.
            3. If the query uses COUNT, SUM, AVG, MIN, or MAX,
               you MUST include an AGGREGATE step describing that
               calculation, separate from any GROUP BY step.
            4. Do NOT invent operations that are not present in
               the Cypher query, and do not add clauses beyond
               the checklist above.
            5. Do NOT execute the query or fabricate row counts,
               sample values, or result sizes.
            6. Order steps exactly as listed in the checklist.
            7. Each step's "cypher" and "sql" fields must quote
               only the relevant fragment of each query, not the
               entire query.
            8. Each "description" must be 1-2 sentences, plain
               language, no jargon a beginner wouldn't know.
            9. Output ONLY raw JSON. No markdown fences, no
               commentary, no leading or trailing text.

            Required JSON structure (exact keys, exact types):

            {
              "explanation": "one short paragraph summarizing what the whole query does",
              "steps": [
                {
                  "operation": "MATCH",
                  "cypher": "relevant Cypher fragment only",
                  "sql": "relevant SQL fragment only",
                  "description": "student-friendly explanation"
                }
              ]
            }
            """.formatted(
                cypherQuery,
                sqlQuery,
                checklist.toString()
        );
    }
    /**
     * Stage 3 (qwen2.5:3b): schema -> sample relational data.
     * Small model: keep instructions extremely explicit and narrow.
     */
    public static String buildSampleDataPrompt(
            String cypherQuery,
            String sqlQuery,
            Map<String, List<String>> requiredColumns
    ) {

        return """
            You are generating small sample relational data
            for TRIQL, a visual Neo4j-to-SQL learning platform.

            The generated data will be displayed interactively
            in a query visualization. Therefore, the data must
            demonstrate the actual operations in the query.

            Original Neo4j Cypher:
            %s

            Equivalent SQL representation:
            %s

            Required schema (table name -> exact column list):
            %s

            STRICT RULES:

            1. Use ONLY the tables and columns listed in the
               required schema above.

            2. Do NOT add, remove, rename, or invent columns.

            3. Generate exactly 3 to 5 rows for every table.

            4. Every row must contain a non-null value for every
               required column.

            5. Do not use empty strings, null, N/A, TBD, unknown,
               or placeholder values.

            6. Values must be realistic and internally consistent.

            7. Respect primary-key and foreign-key relationships.

            8. If a foreign-key column references another table,
               its value MUST correspond to an existing primary/id
               value in that parent table.

            9. IMPORTANT — generate data that demonstrates the
               actual Cypher query.

               If the query contains WHERE conditions, generate
               values both before and after the filter whenever
               possible.

               Example:
               WHERE p.price > 1000

               The Product table should contain some products with
               price greater than 1000 and some products with price
               less than or equal to 1000.

            10. If the query contains ORDER BY, generate different
                values for the ordered column so that the sorting
                effect is visible.

            11. If the query contains LIMIT, generate enough
                matching rows for the LIMIT operation to be visible.

            12. If the query contains GROUP BY, generate repeated
                values for the grouping column so that multiple rows
                belong to the same group.

            13. If the query contains aggregation such as COUNT,
                SUM, AVG, MIN, or MAX, generate data that produces
                meaningful aggregate values.

            14. If the query contains HAVING, generate at least one
                group that passes the HAVING condition and, when
                possible, at least one group that does not pass it.

            15. If the query contains multiple relationships, make
                sure the foreign-key values correctly represent
                those relationships.

            16. Do not generate SQL.

            17. Do not generate explanations.

            18. Do not generate Markdown.

            19. Output ONLY raw JSON.

            20. The JSON must be valid and use exactly this structure:

            {
              "tables": {
                "TableName": [
                  {
                    "column1": "value",
                    "column2": 123
                  }
                ]
              }
            }

            21. Preserve numeric columns as JSON numbers, not strings.

            22. Preserve text columns as JSON strings.

            23. Do not include any table that is not present in the
                required schema.

            24. Do not include any column that is not present in the
                required schema.
            """.formatted(
                cypherQuery,
                sqlQuery,
                requiredColumns
        );
    }

    /**
     * Stage 4 (qwen2.5-coder:7b): validate generated steps against
     * the original Cypher before handing off to the React visualizer.
     */
    public static String buildValidationPrompt(
            String candidateJson,
            String cypherQuery
    ) {

        return """
                You are a strict correctness validator for TRIQL's
                query visualization pipeline. Your output is the
                final gate before results reach the React frontend —
                treat every check as mandatory, not advisory.

                Original Cypher query:
                %s

                Candidate visualization JSON (steps generated by an
                earlier model, to be checked — not trusted):
                %s

                STRICT RULES — violating any of these makes the
                output unusable:
                1. Do NOT invent operations, and do NOT approve any
                   step describing an operation absent from the
                   original Cypher query.
                2. MATCH must represent graph pattern matching only.
                3. WHERE must represent filtering only.
                4. RETURN must represent projection only.
                5. ORDER BY must represent sorting only; flag it
                   invalid if present in steps but absent from the
                   Cypher, or vice versa.
                6. LIMIT must represent row limiting only; same
                   presence/absence check as ORDER BY.
                7. Step order must exactly follow:
                   MATCH -> WHERE -> RETURN -> ORDER BY -> LIMIT.
                8. Set "valid" to true ONLY if every step passes
                   every rule above with zero issues.
                9. "correctedSteps" must contain ONLY the steps that
                   need correction, in the same JSON shape as the
                   input steps — never repeat steps that were already
                   correct.
                10. Output ONLY raw JSON. No markdown fences, no
                    commentary, no leading or trailing text.

                Required JSON structure (exact keys, exact types):

                {
                  "valid": false,
                  "issues": ["short description of each problem found"],
                  "correctedSteps": [
                    {
                      "operation": "MATCH",
                      "cypher": "relevant Cypher fragment",
                      "sql": "relevant SQL fragment",
                      "description": "corrected student-friendly explanation"
                    }
                  ]
                }
                """.formatted(
                cypherQuery,
                candidateJson
        );
    }

    /**
     * Explains a Cypher parser/syntax error to a beginner.
     * (Not part of the main pipeline diagram — kept as a
     * standalone helper for the /syntax-error endpoint.)
     */
    public static String buildSyntaxErrorPrompt(
            String cypherQuery,
            String errorMessage
    ) {

        return """
                You are a Cypher syntax explanation assistant
                for TRIQL, helping a beginner understand a parser
                error without overwhelming them.

                User query:
                %s

                Parser error:
                %s

                STRICT RULES:
                1. Do not rewrite the whole query unless the fix is
                   a single small change (e.g. a missing parenthesis).
                2. Do not invent database schema or assume table/label
                   names not present in the query.
                3. Explain the actual parser error message — do not
                   guess at unrelated issues.
                4. Keep every field to 1-2 sentences.
                5. Output ONLY raw JSON. No markdown fences, no
                   commentary, no leading or trailing text.

                Required JSON structure (exact keys, exact types):

                {
                  "error": "short explanation",
                  "reason": "why it happened",
                  "suggestion": "how to fix it"
                }
                """.formatted(
                cypherQuery,
                errorMessage
        );
    }
}