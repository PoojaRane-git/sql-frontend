package com.example.springAI.controller;

import com.example.springAI.converter.MongoDBToSqlConverter;
import com.example.springAI.model.MongoDBResponse;
import com.example.springAI.model.MongoDBRequest;
import com.example.springAI.model.MongoDBStep;
import com.example.springAI.parser.MongoDBParsedQuery;
import com.example.springAI.service.MongoDBExecutionService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/mongodb")
@CrossOrigin(origins = "*")
public class MongoDBController {

    private final MongoDBExecutionService mongoDBService;

    public MongoDBController(
            MongoDBExecutionService mongoDBService
    ) {
        this.mongoDBService = mongoDBService;
    }

    /**
     * Complete MongoDB → SQL conversion pipeline.
     */
    @PostMapping("/convert")
    public ResponseEntity<?> convert(
            @RequestBody MongoDBRequest request
    ) {

        if (request == null
                || request.getQuery() == null
                || request.getQuery().trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    "MongoDB query cannot be empty."
                            )
                    );
        }

        try {

            String mongoQuery = request.getQuery().trim();

            System.out.println("Query : " + mongoQuery);

            /*
             * 1. Parse MongoDB using the deterministic Java parser.
             */
            MongoDBParsedQuery parsed =
                    mongoDBService.parseMongoDB(mongoQuery);

            /*
             * 2. Deterministic MongoDB → SQL conversion
             *    (no LLM involved — same as before).
             */
            MongoDBToSqlConverter.ConversionResult conversion =
                    mongoDBService.convertToSql(parsed);

            String sql = conversion.getSql();
            Map<String, List<String>> requiredColumns =
                    conversion.getRequiredColumnsByTable();

            String parsedDetails =
                    parsed.getCollection()
                            + " | "
                            + parsed.getOperation()
                            + " | "
                            + parsed.getStages();

            /*
             * 3. Ask Ollama for the educational explanation,
             *    via qwen2.5:7b.
             */
            String explanation =
                    mongoDBService.analyzeMongoDBStructured(
                            mongoQuery,
                            parsedDetails,
                            sql
                    );

            /*
             * 4. Ask Ollama for real per-operation logical
             *    execution steps.
             */
            MongoDBExecutionService.StepsResult stepsResult =
                    mongoDBService.generateMongoStepsStructured(
                            mongoQuery,
                            sql,
                            parsedDetails
                    );

            /*
             * 5. Generate sample data for the inferred tables,
             *    via qwen2.5:3b.
             */
            Map<String, Object> sampleData =
                    mongoDBService.generateSampleDataStructured(
                            mongoQuery,
                            sql,
                            requiredColumns
                    );

            /*
             * 6. Build response.
             */
            MongoDBResponse response = new MongoDBResponse();

            response.setSource("mongodb");
            response.setInputQuery(parsed.getOriginalQuery());
            response.setCollection(parsed.getCollection());
            response.setOperation(parsed.getOperation());
            response.setStages(parsed.getStages());
            response.setSqlQuery(sql);
            response.setConcept(conversion.getConcept());
            response.setExplanation(explanation);
            response.setExecutionSteps(stepsResult.getSteps());
            response.setVisualization(conversion.getVisualization());
            response.setRequiredColumnsByTable(requiredColumns);
            response.setSampleData(sampleData);

            return ResponseEntity.ok(response);

        } catch (IllegalArgumentException e) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    e.getMessage()
                            )
                    );

        } catch (Exception e) {

            return ResponseEntity.internalServerError()
                    .body(
                            Map.of(
                                    "error",
                                    "MongoDB processing failed.",
                                    "details",
                                    e.getMessage()
                            )
                    );
        }
    }

    /**
     * Parse MongoDB only.
     */
    @PostMapping("/parse")
    public ResponseEntity<?> parse(
            @RequestBody MongoDBRequest request
    ) {

        if (request == null
                || request.getQuery() == null
                || request.getQuery().trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    "MongoDB query cannot be empty."
                            )
                    );
        }

        try {

            String mongoQuery = request.getQuery().trim();

            MongoDBParsedQuery parsed =
                    mongoDBService.parseMongoDB(mongoQuery);

            return ResponseEntity.ok(
                    Map.ofEntries(
                            Map.entry("source", "mongodb"),
                            Map.entry("inputQuery", parsed.getOriginalQuery()),
                            Map.entry("collection", parsed.getCollection()),
                            Map.entry("operation", parsed.getOperation()),
                            Map.entry("stages", parsed.getStages()),
                            Map.entry("filters", parsed.getFilters()),
                            Map.entry("projection", parsed.getProjections()),
                            Map.entry("sort", parsed.getSort()),
                            Map.entry("limit", parsed.getLimit() == null ? "" : parsed.getLimit()),
                            Map.entry("skip", parsed.getSkip() == null ? "" : parsed.getSkip()),
                            Map.entry("groupField", safe(parsed.getGroupField())),
                            Map.entry("groupAccumulator", safe(parsed.getGroupAccumulator())),
                            Map.entry("groupValueField", safe(parsed.getGroupValueField())),
                            Map.entry("lookupFrom", safe(parsed.getLookupFrom())),
                            Map.entry("lookupLocalField", safe(parsed.getLookupLocalField())),
                            Map.entry("lookupForeignField", safe(parsed.getLookupForeignField())),
                            Map.entry("lookupAs", safe(parsed.getLookupAs()))
                    )
            );

        } catch (IllegalArgumentException e) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    e.getMessage()
                            )
                    );

        } catch (Exception e) {

            return ResponseEntity.internalServerError()
                    .body(
                            Map.of(
                                    "error",
                                    "MongoDB parsing failed.",
                                    "details",
                                    e.getMessage()
                            )
                    );
        }
    }

    /**
     * Ollama explanation only.
     */
    @PostMapping("/analyze")
    public ResponseEntity<?> analyze(
            @RequestBody Map<String, String> request
    ) {

        String mongoQuery = request.get("mongoQuery");
        String sqlQuery = request.get("sqlQuery");

        if (mongoQuery == null || mongoQuery.trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    "mongoQuery is required."
                            )
                    );
        }

        try {

            MongoDBParsedQuery parsed =
                    mongoDBService.parseMongoDB(mongoQuery);

            String result =
                    mongoDBService.analyzeMongoDBStructured(
                            mongoQuery,
                            parsed.getStages().toString(),
                            sqlQuery == null ? "" : sqlQuery
                    );

            return ResponseEntity.ok(
                    Map.of("result", result)
            );

        } catch (Exception e) {

            return ResponseEntity.internalServerError()
                    .body(
                            Map.of(
                                    "error",
                                    e.getMessage()
                            )
                    );
        }
    }

    /**
     * Generate sample data only.
     */
    @PostMapping("/sample-data")
    public ResponseEntity<?> sampleData(
            @RequestBody Map<String, Object> request
    ) {

        try {

            String mongoQuery = (String) request.get("mongoQuery");
            String sqlQuery = (String) request.get("sqlQuery");

            @SuppressWarnings("unchecked")
            Map<String, List<String>> columns =
                    (Map<String, List<String>>) request.get("requiredColumns");

            if (mongoQuery == null || mongoQuery.trim().isEmpty()) {

                return ResponseEntity.badRequest()
                        .body(
                                Map.of(
                                        "error",
                                        "mongoQuery is required."
                                )
                        );
            }

            if (columns == null) {
                columns = Map.of();
            }

            Map<String, Object> result =
                    mongoDBService.generateSampleDataStructured(
                            mongoQuery,
                            sqlQuery == null ? "" : sqlQuery,
                            columns
                    );

            return ResponseEntity.ok(
                    Map.of("sampleData", result)
            );

        } catch (Exception e) {

            return ResponseEntity.internalServerError()
                    .body(
                            Map.of(
                                    "error",
                                    e.getMessage()
                            )
                    );
        }
    }

    /**
     * Validate generated visualization steps.
     */
    @PostMapping("/validate")
    public ResponseEntity<?> validate(
            @RequestBody Map<String, String> request
    ) {

        String candidateJson = request.get("candidateJson");
        String mongoQuery = request.get("mongoQuery");
        String sqlQuery = request.get("sqlQuery");

        if (candidateJson == null || candidateJson.trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    "candidateJson is required."
                            )
                    );
        }

        if (mongoQuery == null || mongoQuery.trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    "mongoQuery is required."
                            )
                    );
        }

        try {

            String result =
                    mongoDBService.validateSteps(
                            candidateJson,
                            mongoQuery,
                            sqlQuery == null ? "" : sqlQuery
                    );

            return ResponseEntity.ok(
                    Map.of("validation", result)
            );

        } catch (Exception e) {

            return ResponseEntity.internalServerError()
                    .body(
                            Map.of(
                                    "error",
                                    e.getMessage()
                            )
                    );
        }
    }

    /**
     * Explain a MongoDB syntax error.
     */
    @PostMapping("/syntax-error")
    public ResponseEntity<?> syntaxError(
            @RequestBody Map<String, String> request
    ) {

        String mongoQuery = request.get("mongoQuery");
        String errorMessage = request.get("errorMessage");

        if (mongoQuery == null || mongoQuery.trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    "mongoQuery is required."
                            )
                    );
        }

        if (errorMessage == null || errorMessage.trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    "errorMessage is required."
                            )
                    );
        }

        try {

            String result =
                    mongoDBService.explainSyntaxError(
                            mongoQuery,
                            errorMessage
                    );

            return ResponseEntity.ok(
                    Map.of("explanation", result)
            );

        } catch (Exception e) {

            return ResponseEntity.internalServerError()
                    .body(
                            Map.of(
                                    "error",
                                    e.getMessage()
                            )
                    );
        }
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}