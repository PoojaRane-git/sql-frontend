package com.example.springAI.service;

import com.example.springAI.parser.Neo4jParser;
import com.example.springAI.parser.Neo4jParser.Neo4jParsedQuery;
import com.example.springAI.model.Neo4jStep;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.ollama.OllamaChatModel;
import org.springframework.ai.ollama.api.OllamaChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class Neo4jExecutionService {

    @Value("${pipeline.models.sql-conversion:qwen2.5-coder:7b}")
    private String sqlConversionModel;

    @Value("${pipeline.models.steps:qwen2.5-coder:7b}")
    private String stepsModel;

    @Value("${pipeline.models.sample-data:qwen2.5:3b}")
    private String sampleDataModel;

    @Value("${pipeline.models.syntax-check:qwen2.5-coder:7b}")
    private String syntaxCheckModel;

    private final OllamaChatModel chatModel;

    private final Neo4jParser neo4jParser;

    private final Object ollamaLock = new Object();

    private final ObjectMapper objectMapper = new ObjectMapper();

    public Neo4jExecutionService(
            OllamaChatModel chatModel,
            Neo4jParser neo4jParser
    ) {
        this.chatModel = chatModel;
        this.neo4jParser = neo4jParser;
    }

    public Neo4jParsedQuery parseCypher(String cypherQuery) {
        return neo4jParser.parse(cypherQuery);
    }

    /**
     * Cleans a model's raw text response into parseable JSON.
     *
     * Models sometimes ignore "raw JSON only" instructions and wrap
     * their answer in a markdown code fence (```json ... ```). This
     * strips that fencing, and falls back to extracting the first
     * {...} block if the response still isn't clean JSON.
     */
    private JsonNode parseModelJson(String rawResponse, String modelName) {

        String cleaned = rawResponse == null ? "" : rawResponse.trim();

        if (cleaned.startsWith("```")) {
            cleaned = cleaned.replaceFirst("^```[a-zA-Z]*\\s*", "");
            int lastFence = cleaned.lastIndexOf("```");
            if (lastFence >= 0) {
                cleaned = cleaned.substring(0, lastFence);
            }
            cleaned = cleaned.trim();
        }

        try {
            return objectMapper.readTree(cleaned);

        } catch (Exception e) {

            int start = cleaned.indexOf('{');
            int end = cleaned.lastIndexOf('}');

            if (start >= 0 && end > start) {
                try {
                    return objectMapper.readTree(cleaned.substring(start, end + 1));
                } catch (Exception ignored) {
                    // fall through to throw below
                }
            }

            throw new IllegalStateException(
                    "Failed to parse JSON response from model '"
                            + modelName + "': " + e.getMessage(), e
            );
        }
    }

    /**
     * Result of Cypher -> SQL conversion: the SQL string plus
     * the inferred table/column schema, so downstream stages
     * (sample data generation) know what to populate.
     */
    public static class SqlConversionResult {

        private final String sql;
        private final Map<String, List<String>> tables;

        public SqlConversionResult(String sql, Map<String, List<String>> tables) {
            this.sql = sql;
            this.tables = tables;
        }

        public String getSql() {
            return sql;
        }

        public Map<String, List<String>> getTables() {
            return tables;
        }
    }

    /**
     * Stage: parsed AST -> equivalent SQL + inferred table schema,
     * via qwen2.5-coder:7b.
     */
    public SqlConversionResult convertToSql(
            String cypherQuery,
            String parsedCypherAst
    ) {

        String rawJson =
                callWithModel(
                        Neo4jPromptBuilder.buildSqlConversionPrompt(
                                cypherQuery,
                                parsedCypherAst
                        ),
                        sqlConversionModel
                );

        try {
            JsonNode node = parseModelJson(rawJson, sqlConversionModel);
            String sql = node.path("sql").asText("");

            Map<String, List<String>> tables = new LinkedHashMap<>();
            JsonNode tablesNode = node.path("tables");

            if (tablesNode.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> fields = tablesNode.fields();
                while (fields.hasNext()) {
                    Map.Entry<String, JsonNode> entry = fields.next();
                    List<String> cols = new ArrayList<>();
                    if (entry.getValue().isArray()) {
                        for (JsonNode c : entry.getValue()) {
                            cols.add(c.asText(""));
                        }
                    }
                    tables.put(entry.getKey(), cols);
                }
            }

            return new SqlConversionResult(sql, tables);

        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to parse SQL conversion response from model '"
                            + sqlConversionModel + "': " + e.getMessage(), e
            );
        }
    }

    public static class AnalysisResult {

        private final String explanation;
        private final List<Neo4jStep> steps;

        public AnalysisResult(String explanation, List<Neo4jStep> steps) {
            this.explanation = explanation;
            this.steps = steps;
        }

        public String getExplanation() {
            return explanation;
        }

        public List<Neo4jStep> getSteps() {
            return steps;
        }
    }

    /**
     * Ask Ollama for explanation + steps, and parse the JSON
     * into real objects instead of returning a raw JSON string.
     *
     * Throws if the model returned fewer steps than the query's
     * clauses require, instead of silently shipping a partial list.
     */
    public AnalysisResult analyzeCypherStructured(String cypherQuery, String sqlQuery) {

        String rawJson =
                callWithModel(
                        Neo4jPromptBuilder.buildStepsPrompt(cypherQuery, sqlQuery),
                        stepsModel
                );

        JsonNode node = parseModelJson(rawJson, stepsModel);
        String explanation = node.path("explanation").asText("");

        List<Neo4jStep> steps = new ArrayList<>();
        JsonNode stepsNode = node.path("steps");

        if (stepsNode.isArray()) {
            for (JsonNode s : stepsNode) {
                steps.add(new Neo4jStep(
                        s.path("operation").asText(""),
                        s.path("cypher").asText(""),
                        s.path("sql").asText(""),
                        s.path("description").asText("")
                ));
            }
        }

        int expectedClauseCount = countExpectedClauses(cypherQuery);
        if (steps.size() < expectedClauseCount) {
            throw new IllegalStateException(
                    "Steps model returned an incomplete step list ("
                            + steps.size() + " of " + expectedClauseCount
                            + " expected clauses) for model '" + stepsModel
                            + "'. Raw response: " + rawJson
            );
        }

        return new AnalysisResult(explanation, steps);
    }

    /**
     * Counts how many step-worthy clauses/operations this Cypher
     * query contains, to validate the steps model's output against.
     * Keep this in sync with the checklist logic in
     * Neo4jPromptBuilder.buildStepsPrompt.
     */
    private int countExpectedClauses(String cypherQuery) {
        String upper = cypherQuery.toUpperCase();
        boolean hasRelationship = cypherQuery.matches("(?s).*\\)\\s*-+\\s*\\[.*\\]\\s*-+>?\\s*\\(.*");
        boolean hasAggregate = upper.matches("(?s).*\\b(COUNT|SUM|AVG|MIN|MAX|COLLECT)\\s*\\(.*");

        int count = 0;
        if (upper.contains("MATCH")) count++;
        if (hasRelationship) count++;
        if (upper.contains("WHERE")) count++;
        if (upper.contains("WITH")) count++;
        if (upper.contains("GROUP BY") || hasAggregate) count++;
        if (hasAggregate) count++;
        if (upper.contains("HAVING")) count++;
        if (upper.contains("RETURN")) count++;
        if (upper.contains("ORDER BY")) count++;
        if (upper.contains("SKIP")) count++;
        if (upper.contains("LIMIT")) count++;
        return count;
    }

    /**
     * Ask Ollama to explain the Cypher query
     * and generate logical visualization steps.
     * (Raw-string version — kept for the standalone /analyze endpoint.)
     */
    public String analyzeCypher(
            String cypherQuery,
            String sqlQuery
    ) {

        String prompt =
                Neo4jPromptBuilder.buildStepsPrompt(
                        cypherQuery,
                        sqlQuery
                );

        return callWithModel(
                prompt,
                stepsModel
        );
    }

    /**
     * Generate sample relational data.
     * (Raw-string version — kept for the standalone /sample-data endpoint.)
     */
    public String generateSampleData(
            String cypherQuery,
            String sqlQuery,
            Map<String, List<String>> requiredColumns
    ) {

        String prompt =
                Neo4jPromptBuilder.buildSampleDataPrompt(
                        cypherQuery,
                        sqlQuery,
                        requiredColumns
                );

        return callWithModel(
                prompt,
                sampleDataModel
        );
    }

    /**
     * Generate sample relational data, parsed into a structured map
     * (tableName -> list of row objects) for use inside /convert.
     */
    public Map<String, Object> generateSampleDataStructured(
            String cypherQuery,
            String sqlQuery,
            Map<String, List<String>> requiredColumns
    ) {

        String rawJson =
                callWithModel(
                        Neo4jPromptBuilder.buildSampleDataPrompt(
                                cypherQuery,
                                sqlQuery,
                                requiredColumns
                        ),
                        sampleDataModel
                );

        JsonNode node = parseModelJson(rawJson, sampleDataModel);
        JsonNode tablesNode = node.path("tables");

        return objectMapper.convertValue(
                tablesNode,
                new TypeReference<Map<String, Object>>() {
                }
        );
    }

    /**
     * Validate generated visualization steps.
     */
    public String validateSteps(
            String candidateJson,
            String cypherQuery
    ) {

        String prompt =
                Neo4jPromptBuilder.buildValidationPrompt(
                        candidateJson,
                        cypherQuery
                );

        return callWithModel(
                prompt,
                stepsModel
        );
    }

    /**
     * Explain a Cypher syntax/parser error.
     */
    public String explainSyntaxError(
            String cypherQuery,
            String errorMessage
    ) {

        String prompt =
                Neo4jPromptBuilder.buildSyntaxErrorPrompt(
                        cypherQuery,
                        errorMessage
                );

        return callWithModel(
                prompt,
                syntaxCheckModel
        );
    }

    /**
     * Call Ollama using the same Spring AI API
     * as the existing SQLExecutionService.
     *
     * Synchronized so only one model runs at a time, regardless
     * of how many requests arrive concurrently — protects RAM.
     * numPredict is raised so multi-step JSON responses have room
     * to finish instead of being cut off mid-array.
     */
    private String callWithModel(
            String promptText,
            String model
    ) {

        synchronized (ollamaLock) {

            OllamaChatOptions options =
                    OllamaChatOptions.builder()
                            .model(model)
                            .numPredict(2048)
                            .build();

            ChatResponse response =
                    chatModel.call(
                            new Prompt(
                                    promptText,
                                    options
                            )
                    );

            if (response == null
                    || response.getResult() == null
                    || response.getResult().getOutput() == null) {

                throw new IllegalStateException(
                        "Ollama model '" +
                                model +
                                "' returned no response."
                );
            }

            String text =
                    response
                            .getResult()
                            .getOutput()
                            .getText();

            if (text == null || text.trim().isEmpty()) {

                throw new IllegalStateException(
                        "Ollama model '" +
                                model +
                                "' returned empty output."
                );
            }

            return text.trim();
        }
    }
}