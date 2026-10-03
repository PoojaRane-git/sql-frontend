package com.example.springAI.util;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class JsonUtils {

    private static final JsonMapper MAPPER =
            JsonMapper.builder().build();

    private static final Pattern FENCE =
            Pattern.compile(
                    "```(?:json)?\\s*([\\s\\S]*?)```",
                    Pattern.CASE_INSENSITIVE
            );

    private JsonUtils() {
    }

    // ---------------------------------------------------------
    // JSON EXTRACTION
    // ---------------------------------------------------------

    public static String extractJson(String raw) {

        if (raw == null || raw.isBlank()) {
            return "{}";
        }

        String text = raw.trim();

        Matcher matcher = FENCE.matcher(text);

        if (matcher.find()) {
            text = matcher.group(1).trim();
        }

        int objectStart = text.indexOf('{');
        int arrayStart = text.indexOf('[');

        int start;

        if (objectStart == -1) {
            start = arrayStart;
        } else if (arrayStart == -1) {
            start = objectStart;
        } else {
            start = Math.min(objectStart, arrayStart);
        }

        if (start == -1) {
            return text;
        }

        char opening = text.charAt(start);
        char closing = opening == '{' ? '}' : ']';

        int depth = 0;
        boolean inString = false;
        boolean escaped = false;

        for (int i = start; i < text.length(); i++) {

            char current = text.charAt(i);

            if (inString) {

                if (escaped) {
                    escaped = false;
                } else if (current == '\\') {
                    escaped = true;
                } else if (current == '"') {
                    inString = false;
                }

                continue;
            }

            if (current == '"') {
                inString = true;
            } else if (current == opening) {
                depth++;
            } else if (current == closing) {
                depth--;

                if (depth == 0) {
                    return text.substring(start, i + 1);
                }
            }
        }

        throw new IllegalArgumentException(
                "Incomplete JSON returned by the model."
        );
    }

    public static JsonNode parse(String raw) {

        try {
            return MAPPER.readTree(extractJson(raw));
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    "Invalid JSON response: " + e.getMessage(),
                    e
            );
        }
    }

    public static JsonMapper mapper() {
        return MAPPER;
    }

    // ---------------------------------------------------------
    // RESPONSE MERGING
    // ---------------------------------------------------------

    /**
     * Merges Ollama's analysis with the actual execution result
     * returned by the H2 SQL execution engine.
     *
     * This method does not execute SQL or fabricate row snapshots.
     */
    public static ObjectNode mergeStepsAndSampleData(
            JsonNode stepsJson,
            JsonNode sampleDataJson
    ) {

        if (!(stepsJson instanceof ObjectNode)) {
            throw new IllegalArgumentException(
                    "Steps JSON must be a JSON object."
            );
        }

        ObjectNode merged = ((ObjectNode) stepsJson).deepCopy();

        JsonNode sampleData = extractSampleData(sampleDataJson);

        merged.set("sample_data", sampleData);

        // No fake execution status.
        merged.put("execution_supported", false);
        merged.put("execution_status", "NOT_EXECUTED");

        merged.put(
                "execution_message",
                "SQL execution must be performed by the H2 execution engine."
        );

        return merged;
    }

    /**
     * Merge actual H2 execution output.
     *
     * Expected execution result:
     *
     * {
     *   "success": true,
     *   "steps": [...],
     *   "final_output": [...]
     * }
     */
    public static ObjectNode mergeExecutionResult(
            JsonNode analysisJson,
            JsonNode sampleDataJson,
            JsonNode executionJson
    ) {

        if (!(analysisJson instanceof ObjectNode)) {
            throw new IllegalArgumentException(
                    "Analysis JSON must be an object."
            );
        }

        if (!(executionJson instanceof ObjectNode)) {
            throw new IllegalArgumentException(
                    "Execution result must be an object."
            );
        }

        ObjectNode merged = ((ObjectNode) analysisJson).deepCopy();

        merged.set(
                "sample_data",
                extractSampleData(sampleDataJson)
        );

        boolean success = executionJson.path("success").asBoolean(false);

        merged.put("execution_supported", success);

        merged.put(
                "execution_status",
                success ? "COMPLETED" : "FAILED"
        );

        if (executionJson.has("steps")
                && executionJson.get("steps").isArray()) {

            merged.set(
                    "steps",
                    executionJson.get("steps").deepCopy()
            );
        }

        if (executionJson.has("final_output")) {

            merged.set(
                    "final_output",
                    executionJson.get("final_output").deepCopy()
            );
        }

        if (!success && executionJson.has("error")) {

            merged.set(
                    "execution_error",
                    executionJson.get("error").deepCopy()
            );
        }

        return merged;
    }

    // ---------------------------------------------------------
    // SAMPLE DATA NORMALIZATION
    // ---------------------------------------------------------

    private static JsonNode extractSampleData(JsonNode source) {

        if (source == null || source.isNull()) {
            return MAPPER.createObjectNode();
        }

        JsonNode data = source.has("sample_data")
                ? source.get("sample_data")
                : source;

        if (data == null || data.isNull()) {
            return MAPPER.createObjectNode();
        }

        if (!data.isObject()) {
            throw new IllegalArgumentException(
                    "Sample data must be a JSON object containing table names."
            );
        }

        return data.deepCopy();
    }

    // ---------------------------------------------------------
    // EXECUTION STEP CREATION
    // ---------------------------------------------------------

    /**
     * Used by the H2 execution engine when it records a real
     * execution stage.
     */
    public static ObjectNode createExecutionStep(
            int stepNumber,
            String clause,
            String sqlFragment,
            String explanation,
            JsonNode inputRows,
            JsonNode outputRows
    ) {

        ObjectNode step = MAPPER.createObjectNode();

        step.put("step_number", stepNumber);
        step.put("clause", clause);
        step.put("sql_fragment", sqlFragment);
        step.put("execution_order", stepNumber);
        step.put("explanation", explanation);

        step.set(
                "input_rows",
                inputRows == null
                        ? MAPPER.createArrayNode()
                        : inputRows.deepCopy()
        );

        step.set(
                "output_rows",
                outputRows == null
                        ? MAPPER.createArrayNode()
                        : outputRows.deepCopy()
        );

        step.put(
                "input_count",
                inputRows != null && inputRows.isArray()
                        ? inputRows.size()
                        : 0
        );

        step.put(
                "output_count",
                outputRows != null && outputRows.isArray()
                        ? outputRows.size()
                        : 0
        );

        return step;
    }

    public static ArrayNode emptyArray() {
        return MAPPER.createArrayNode();
    }

    public static ObjectNode emptyObject() {
        return MAPPER.createObjectNode();
    }
}