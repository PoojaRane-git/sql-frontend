package com.example.springAI.controller;

import com.example.springAI.service.SQLExecutionService;
import com.example.springAI.util.JsonUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/sql")
@CrossOrigin // tighten this to your React origin in production
public class SQLController {

    private final SQLExecutionService sqlExecutionService;

    public SQLController(SQLExecutionService sqlExecutionService) {
        this.sqlExecutionService = sqlExecutionService;
    }

    public record VisualizeRequest(String query) {
    }
    @PostMapping("/analyze")
    public ResponseNode visualize(@RequestBody VisualizeRequest request) {
        String query = request.query();
        System.out.println("query: " + query);


        CompletableFuture<String> stepsFuture =
                CompletableFuture.supplyAsync(() -> sqlExecutionService.analyzeSQL(query));

        CompletableFuture<String> sampleDataFuture =
                CompletableFuture.supplyAsync(() ->
                        sqlExecutionService.generateSampleData(query, Collections.emptyMap()));

        try {
            CompletableFuture.allOf(stepsFuture, sampleDataFuture).join();

            String rawSteps = stepsFuture.get();
            System.out.println("rawSteps: " + rawSteps);
            String rawSampleData = sampleDataFuture.get();

            JsonNode stepsJson = JsonUtils.parse(rawSteps);
            JsonNode sampleDataJson = JsonUtils.parse(rawSampleData);

            // Optional but recommended: catch schema violations (like a missing
            // SELECT step) before returning to the frontend. Costs one more
            // STEPS_MODEL call; drop this if latency matters more than strictness.
            String validatedRaw = sqlExecutionService.validateSteps(stepsJson.toString(), query);
            JsonNode validatedSteps = JsonUtils.parse(validatedRaw);

            ObjectNode merged = JsonUtils.mergeStepsAndSampleData(validatedSteps, sampleDataJson);
            return new ResponseNode(true, merged, null);

        } catch (Exception e) {
            // Model output didn't parse as JSON, or a call failed outright.
            // Fall back to the syntax-error explainer so the frontend still gets something actionable.
            String explanation = sqlExecutionService.explainSyntaxError(query, e.getMessage());
            try {
                JsonNode errorJson = JsonUtils.parse(explanation);
                return new ResponseNode(false, errorJson, "Failed to produce a valid visualization; see explanation.");
            } catch (Exception parseFailure) {
                return new ResponseNode(false, null, "Pipeline failed and error explanation also failed to parse: " + e.getMessage());
            }
        }
    }

    public record ResponseNode(boolean success, JsonNode data, String error) {
    }
}