package com.example.springAI.service;

import com.example.springAI.util.JsonUtils;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.ollama.OllamaChatModel;
import org.springframework.ai.ollama.api.OllamaChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class SQLExecutionService {

    // Output caps per call (tokens). Too low truncates the JSON; raise if big queries get cut off.
    private static final int STEPS_MAX_TOKENS = 1536;
    private static final int SAMPLE_MAX_TOKENS = 1024;
    private static final int SYNTAX_MAX_TOKENS = 512;
    private static final int VALIDATE_MAX_TOKENS = 1536;

    @Value("${pipeline.models.steps:qwen2.5-coder:3b}")
    private String stepsModel;

    @Value("${pipeline.models.sample-data:qwen2.5-coder:3b}")
    private String sampleDataModel;

    @Value("${pipeline.models.syntax-check:qwen2.5-coder:3b}")
    private String syntaxCheckModel;

    // CPU-friendly defaults for a 6-core / 16 GB machine; override in application.yml.
    @Value("${pipeline.ollama.num-ctx:4096}")
    private int numCtx;

    @Value("${pipeline.ollama.num-thread:6}")
    private int numThread;

    @Value("${pipeline.ollama.keep-alive:30m}")
    private String keepAlive;

    private final OllamaChatModel chatModel;

    public SQLExecutionService(OllamaChatModel chatModel) {
        this.chatModel = chatModel;
    }

    private String callWithModel(String promptText, String model, int maxTokens) {
        OllamaChatOptions options = OllamaChatOptions.builder()
                .model(model)
                .temperature(0.0)
                .numCtx(numCtx)
                .numPredict(maxTokens)
                .numThread(numThread)
                .keepAlive(keepAlive)
                .format("json")
                .build();

        ChatResponse response = chatModel.call(new Prompt(promptText, options));
        String text = response.getResult().getOutput().getText();
        if (text == null) {
            throw new IllegalStateException("Model '" + model + "' returned no text output for this prompt.");
        }
        return text;
    }

    /** Full logical execution-order analysis. */
    public String analyzeSQL(String query) {
        return callWithModel(PromptBuilder.buildStepsPrompt(query), stepsModel, STEPS_MAX_TOKENS);
    }

    /** Raw sample rows. */
    public String generateSampleData(String query, Map<String, List<String>> requiredColumnsByTable) {
        return callWithModel(PromptBuilder.buildSampleDataPrompt(query, requiredColumnsByTable),
                sampleDataModel, SAMPLE_MAX_TOKENS);
    }

    /**
     * Optional LLM corrective pass. No longer called by the controller (it doubles latency on CPU);
     * use repairAndCheckSteps() instead and call this only if you really need it.
     */
    public String validateSteps(String candidateJson, String query) {
        return callWithModel(PromptBuilder.buildValidationPrompt(candidateJson, query),
                stepsModel, VALIDATE_MAX_TOKENS);
    }

    /** Explains a SQL syntax error in plain language. */
    public String explainSyntaxError(String query, String dbErrorMessage) {
        return callWithModel(PromptBuilder.buildSyntaxErrorPrompt(query, dbErrorMessage),
                syntaxCheckModel, SYNTAX_MAX_TOKENS);
    }

    /**
     * Cheap, deterministic replacement for the LLM validation call.
     * - fails fast if the response has no usable steps
     * - renumbers step_number / execution_order (the most common small-model mistake)
     * - fills missing column arrays
     * - forces "query" to the original text (JsonUtils reads it to evaluate WHERE/GROUP BY/...)
     * - records a warning for any sql_fragment that is not part of the query
     */
    public ObjectNode repairAndCheckSteps(JsonNode stepsJson, String query) {
        if (stepsJson == null || !stepsJson.isObject()) {
            throw new IllegalStateException("Steps response is not a JSON object.");
        }
        ObjectNode root = ((ObjectNode) stepsJson).deepCopy();

        JsonNode stepsNode = root.get("steps");
        if (stepsNode == null || !stepsNode.isArray() || stepsNode.isEmpty()) {
            throw new IllegalStateException("Steps response contains no steps.");
        }
        ArrayNode steps = (ArrayNode) stepsNode;

        ArrayNode warnings = (root.has("warnings") && root.get("warnings").isArray())
                ? (ArrayNode) root.get("warnings")
                : JsonUtils.mapper().createArrayNode();

        String normalizedQuery = normalizeWhitespace(query).toLowerCase(Locale.ROOT);

        int n = 1;
        for (JsonNode node : steps) {
            if (!node.isObject()) {
                throw new IllegalStateException("Step " + n + " is not a JSON object.");
            }
            ObjectNode step = (ObjectNode) node;
            if (step.path("clause").asString("").isBlank()) {
                throw new IllegalStateException("Step " + n + " has no clause.");
            }
            step.put("step_number", n);
            step.put("execution_order", n);

            if (!step.has("input_columns") || !step.get("input_columns").isArray()) {
                step.set("input_columns", JsonUtils.mapper().createArrayNode());
            }
            if (!step.has("output_columns") || !step.get("output_columns").isArray()) {
                step.set("output_columns", JsonUtils.mapper().createArrayNode());
            }

            String fragment = normalizeWhitespace(step.path("sql_fragment").asString("")).toLowerCase(Locale.ROOT);
            if (!fragment.isEmpty() && !normalizedQuery.contains(fragment)) {
                warnings.add("Step " + n + ": sql_fragment is not an exact part of the query");
            }
            n++;
        }

        root.set("warnings", warnings);
        root.put("query", query);
        root.put("success", true);
        return root;
    }

    private static String normalizeWhitespace(String s) {
        return s == null ? "" : s.trim().replaceAll("\\s+", " ");
    }
}