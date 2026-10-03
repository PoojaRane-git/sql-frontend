package com.example.springAI.controller;

import com.example.springAI.service.SQLExecutionService;
import com.example.springAI.util.JsonUtils;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.Collections;

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

    public record ResponseNode(boolean success, JsonNode data, String error) {
    }

    @PostMapping("/analyze")
    public ResponseNode visualize(@RequestBody VisualizeRequest request) {
        String query = request == null ? null : request.query();
        if (query == null || query.isBlank()) {
            return new ResponseNode(false, null, "Query is empty.");
        }

        try {
            // 1) Steps first. On a CPU-only machine running both calls in parallel does not make
            //    anything faster (they share the same cores), and if steps fail we skip sample data.
            JsonNode stepsJson = JsonUtils.parse(sqlExecutionService.analyzeSQL(query));

            // The prompt returns {"success": false, "error_code": ...} for invalid / unsupported SQL.
            if (!stepsJson.path("success").asBoolean(false)) {
                return explainFailure(query);
            }

            // 2) Cheap Java-side repair/check instead of a second long LLM call.
            ObjectNode steps = sqlExecutionService.repairAndCheckSteps(stepsJson, query);

            // 3) Sample data.
            JsonNode sampleDataJson = JsonUtils.parse(
                    sqlExecutionService.generateSampleData(query, Collections.emptyMap()));

            ObjectNode merged = JsonUtils.mergeStepsAndSampleData(steps, sampleDataJson);
            return new ResponseNode(true, merged, null);

        } catch (Exception e) {
            // Timeout, connection error, or model output that is not usable JSON.
            // Do NOT call another LLM here: it would just be slow and probably fail the same way.
            return new ResponseNode(false, null, "Pipeline failed: " + e.getMessage());
        }
    }

    /** Only used when the steps model says the SQL itself is invalid / unsupported. */
    private ResponseNode explainFailure(String query) {
        try {
            // No raw DB error exists here, so pass null (the prompt then analyzes the query text itself).
            JsonNode explanation = JsonUtils.parse(sqlExecutionService.explainSyntaxError(query, null));
            return new ResponseNode(false, explanation,
                    "This query could not be visualized; see explanation.");
        } catch (Exception e) {
            return new ResponseNode(false, null,
                    "Query could not be visualized and the explanation failed: " + e.getMessage());
        }
    }
}