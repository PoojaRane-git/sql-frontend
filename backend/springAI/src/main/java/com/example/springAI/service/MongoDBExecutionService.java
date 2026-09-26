package com.example.springAI.service;

import com.example.springAI.converter.MongoDBToSqlConverter;
import com.example.springAI.model.MongoDBStep;
import com.example.springAI.parser.MongoDBParsedQuery;
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
import java.util.List;
import java.util.Map;

@Service
public class MongoDBExecutionService {

    @Value("${pipeline.models.explanation:qwen2.5:7b}")
    private String explanationModel;

    @Value("${pipeline.models.steps:qwen2.5:7b}")
    private String stepsModel;

    @Value("${pipeline.models.sample-data:qwen2.5:3b}")
    private String sampleDataModel;

    @Value("${pipeline.models.syntax-check:qwen2.5-coder:7b}")
    private String syntaxCheckModel;

    private static final int MAX_STEPS_RETRIES = 2;

    private final MongoDBToSqlConverter mongoDBToSqlConverter;
    private final OllamaChatModel chatModel;

    private final Object ollamaLock = new Object();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public MongoDBExecutionService(
            MongoDBToSqlConverter mongoDBToSqlConverter,
            OllamaChatModel chatModel
    ) {
        this.mongoDBToSqlConverter = mongoDBToSqlConverter;
        this.chatModel = chatModel;
    }

    // =====================================================
    // PARSE / CONVERT (unchanged — deterministic, no LLM)
    // =====================================================

    public MongoDBParsedQuery parseMongoDB(String mongoQuery) {
        return MongoDBParsedQuery.parse(mongoQuery);
    }

    public MongoDBToSqlConverter.ConversionResult convertToSql(MongoDBParsedQuery parsedQuery) {
        return mongoDBToSqlConverter.convert(parsedQuery);
    }

    // =====================================================
    // JSON CLEANUP (same fence-stripping/fallback as Neo4j)
    // =====================================================

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
                    // fall through
                }
            }
            throw new IllegalStateException(
                    "Failed to parse JSON response from model '" + modelName + "': " + e.getMessage(), e
            );
        }
    }

    // =====================================================
    // STAGE 1 — EXPLANATION (buildSqlConversionPrompt is
    // actually an "explain the deterministic SQL" prompt here,
    // matching MongoDBPromptBuilder's contract)
    // =====================================================

    public String analyzeMongoDBStructured(
            String mongoQuery,
            String parsedMongoQuery,
            String sqlQuery
    ) {
        String rawJson = callWithModel(
                MongoDBPromptBuilder.buildSqlConversionPrompt(mongoQuery, parsedMongoQuery, sqlQuery),
                explanationModel
        );

        JsonNode node = parseModelJson(rawJson, explanationModel);
        return node.path("explanation").asText("");
    }

    // =====================================================
    // STAGE 2 — EXECUTION STEPS (structured, validated,
    // with retry on incomplete step lists)
    // =====================================================

    public static class StepsResult {

        private final String explanation;
        private final List<MongoDBStep> steps;

        public StepsResult(String explanation, List<MongoDBStep> steps) {
            this.explanation = explanation;
            this.steps = steps;
        }

        public String getExplanation() { return explanation; }
        public List<MongoDBStep> getSteps() { return steps; }
    }

    public StepsResult generateMongoStepsStructured(
            String mongoQuery,
            String sqlQuery,
            String parsedMongoQuery
    ) {

        int expectedStepCount = countExpectedMongoSteps(mongoQuery);

        String lastRawJson = null;
        StepsResult lastResult = null;

        for (int attempt = 1; attempt <= MAX_STEPS_RETRIES; attempt++) {

            String rawJson = callWithModel(
                    MongoDBPromptBuilder.buildStepsPrompt(mongoQuery, sqlQuery, parsedMongoQuery),
                    stepsModel
            );

            lastRawJson = rawJson;

            JsonNode node = parseModelJson(rawJson, stepsModel);
            String explanation = node.path("explanation").asText("");

            List<MongoDBStep> steps = new ArrayList<>();
            JsonNode stepsNode = node.path("steps");

            if (stepsNode.isArray()) {
                for (JsonNode s : stepsNode) {
                    steps.add(new MongoDBStep(
                            s.path("operation").asText(""),
                            s.path("mongodb").asText(""),
                            s.path("sql").asText(""),
                            s.path("description").asText("")
                    ));
                }
            }

            lastResult = new StepsResult(explanation, steps);

            if (steps.size() >= expectedStepCount) {
                return lastResult;
            }

            // incomplete — loop again if attempts remain
        }

        throw new IllegalStateException(
                "Steps model returned an incomplete step list ("
                        + (lastResult != null ? lastResult.getSteps().size() : 0)
                        + " of " + expectedStepCount
                        + " expected operations) for model '" + stepsModel
                        + "' after " + MAX_STEPS_RETRIES + " attempts. Raw response: " + lastRawJson
        );
    }

    /**
     * Mirrors the checklist logic in MongoDBPromptBuilder.buildStepsPrompt —
     * counts how many step-worthy operations this query contains, so the
     * steps model's output can be validated against it. Keep in sync.
     */
    private int countExpectedMongoSteps(String mongoQuery) {

        String lower = mongoQuery.toLowerCase();

        int count = 0;
        if (lower.contains(".find(")) count++;
        if (lower.contains(".countdocuments(")) count++;
        if (lower.contains("$match") || hasFindFilter(mongoQuery)) count++;
        if (hasProjection(mongoQuery)) count++;
        if (lower.contains("$group")) count += 2; // GROUP BY + AGGREGATE
        if (lower.contains(".sort(") || lower.contains("$sort")) count++;
        if (lower.contains(".skip(") || lower.contains("$skip")) count++;
        if (lower.contains(".limit(") || lower.contains("$limit")) count++;
        if (lower.contains("$lookup")) count++;
        if (lower.contains("$unwind")) count++;

        return count;
    }

    private boolean hasFindFilter(String query) {
        String lower = query.toLowerCase();
        int findIndex = lower.indexOf(".find(");
        if (findIndex < 0) return false;
        int start = findIndex + ".find(".length();
        int end = query.indexOf(")", start);
        if (end < 0) return false;
        String inside = query.substring(start, end).trim();
        return !inside.isEmpty() && !inside.equals("{}");
    }

    private boolean hasProjection(String query) {
        String lower = query.toLowerCase();
        int findIndex = lower.indexOf(".find(");
        if (findIndex < 0) return false;
        int start = findIndex + ".find(".length();
        int end = query.indexOf(")", start);
        if (end < 0) return false;
        String inside = query.substring(start, end);
        int comma = inside.indexOf(",");
        return comma >= 0 && inside.substring(comma + 1).trim().startsWith("{");
    }

    // =====================================================
    // STAGE 3 — SAMPLE DATA (structured)
    // =====================================================

    public Map<String, Object> generateSampleDataStructured(
            String mongoQuery,
            String sqlQuery,
            Map<String, List<String>> requiredColumns
    ) {
        String rawJson = callWithModel(
                MongoDBPromptBuilder.buildSampleDataPrompt(mongoQuery, sqlQuery, requiredColumns),
                sampleDataModel
        );

        JsonNode node = parseModelJson(rawJson, sampleDataModel);
        JsonNode tablesNode = node.path("tables");

        return objectMapper.convertValue(
                tablesNode,
                new TypeReference<Map<String, Object>>() {}
        );
    }

    // =====================================================
    // STAGE 4 — VALIDATION (optional, mirrors Neo4j's gate)
    // =====================================================

    public String validateSteps(String candidateJson, String mongoQuery, String sqlQuery) {
        String prompt = MongoDBPromptBuilder.buildValidationPrompt(candidateJson, mongoQuery, sqlQuery);
        return callWithModel(prompt, stepsModel);
    }

    // =====================================================
    // SYNTAX ERROR EXPLANATION
    // =====================================================

    public String explainSyntaxError(String mongoQuery, String errorMessage) {
        String prompt = MongoDBPromptBuilder.buildSyntaxErrorPrompt(mongoQuery, errorMessage);
        return callWithModel(prompt, syntaxCheckModel);
    }

    // =====================================================
    // MODEL CALL (synchronized, same as Neo4jExecutionService)
    // =====================================================

    private String callWithModel(String promptText, String model) {

        synchronized (ollamaLock) {

            OllamaChatOptions options =
                    OllamaChatOptions.builder()
                            .model(model)
                            .numPredict(2048)
                            .build();

            ChatResponse response =
                    chatModel.call(new Prompt(promptText, options));

            if (response == null
                    || response.getResult() == null
                    || response.getResult().getOutput() == null) {

                throw new IllegalStateException(
                        "Ollama model '" + model + "' returned no response."
                );
            }

            String text = response.getResult().getOutput().getText();

            if (text == null || text.trim().isEmpty()) {
                throw new IllegalStateException(
                        "Ollama model '" + model + "' returned empty output."
                );
            }

            return text.trim();
        }
    }
}