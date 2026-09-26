package com.example.springAI.controller;

import com.example.springAI.model.Neo4jResponse;
import com.example.springAI.model.QueryRequest;

import com.example.springAI.parser.Neo4jParser;
import com.example.springAI.service.Neo4jExecutionService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/neo4j")
@CrossOrigin(origins = "*")
public class Neo4jController {

    private final Neo4jExecutionService neo4jService;

    public Neo4jController(
            Neo4jExecutionService neo4jService
    ) {
        this.neo4jService = neo4jService;
    }

    /**
     * Complete Neo4j conversion pipeline.
     */
    @PostMapping("/convert")
    public ResponseEntity<?> convert(
            @RequestBody QueryRequest request
    ) {

        if (request == null
                || request.getQuery() == null
                || request.getQuery().trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    "Cypher query cannot be empty."
                            )
                    );
        }

        try {

            String cypher = request.getQuery().trim();

            System.out.println("Query : " + cypher);

            /*
             * 1. Parse Cypher using the official Neo4j parser.
             */
            Neo4jParser.Neo4jParsedQuery parsed = neo4jService.parseCypher(cypher);

            /*
             * 2. Convert the parsed AST into real SQL plus the
             *    inferred table schema, via qwen2.5-coder:7b.
             */
            Neo4jExecutionService.SqlConversionResult sqlResult =
                    neo4jService.convertToSql(
                            cypher,
                            parsed.getParsedCypher()
                    );

            String sql = sqlResult.getSql();
            Map<String, List<String>> requiredColumns = sqlResult.getTables();

            /*
             * 3. Ask Ollama for the educational explanation
             *    and real per-clause logical execution steps.
             */
            Neo4jExecutionService.AnalysisResult analysis =
                    neo4jService.analyzeCypherStructured(
                            cypher,
                            sql
                    );

            /*
             * 4. Generate sample data for the inferred tables,
             *    via qwen2.5:3b.
             */
            Map<String, Object> sampleData =
                    neo4jService.generateSampleDataStructured(
                            cypher,
                            sql,
                            requiredColumns
                    );

            /*
             * 5. Build response.
             */
            Neo4jResponse response =
                    new Neo4jResponse();

            response.setSource(
                    "neo4j"
            );

            response.setInputQuery(
                    cypher
            );

            response.setSqlQuery(
                    sql
            );

            response.setParsedDetails(
                    parsed.getParsedCypher()
            );

            response.setSteps(
                    analysis.getSteps()
            );

            response.setExplanation(
                    analysis.getExplanation()
            );

            response.setRequiredColumnsByTable(
                    requiredColumns
            );

            response.setSampleData(
                    sampleData
            );

            return ResponseEntity.ok(
                    response
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
                                    "Neo4j processing failed.",
                                    "details",
                                    e.getMessage()
                            )
                    );
        }
    }

    /**
     * Parse Cypher only.
     */
    @PostMapping("/parse")
    public ResponseEntity<?> parse(
            @RequestBody QueryRequest request
    ) {

        if (request == null
                || request.getQuery() == null
                || request.getQuery().trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    "Cypher query cannot be empty."
                            )
                    );
        }

        try {

            String cypher =
                    request.getQuery().trim();

            Neo4jParser.Neo4jParsedQuery parsed =
                    neo4jService.parseCypher(
                            cypher
                    );

            return ResponseEntity.ok(
                    Map.of(
                            "source",
                            "neo4j",

                            "inputQuery",
                            cypher,

                            "parsedQuery",
                            parsed.getParsedCypher(),

                            "sqlQuery",
                            parsed.getSql(),

                            "steps",
                            parsed.getSteps()
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
                                    "Neo4j parsing failed.",
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

        String cypher =
                request.get("cypherQuery");

        String sql =
                request.get("sqlQuery");

        if (cypher == null
                || cypher.trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    "cypherQuery is required."
                            )
                    );
        }

        try {

            String result =
                    neo4jService.analyzeCypher(
                            cypher,
                            sql == null ? "" : sql
                    );

            return ResponseEntity.ok(
                    Map.of(
                            "result",
                            result
                    )
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
     * Generate sample data.
     *
     * This endpoint is kept because the Neo4j service
     * already supports sample-data generation.
     */
    @PostMapping("/sample-data")
    public ResponseEntity<?> sampleData(
            @RequestBody Map<String, Object> request
    ) {

        try {

            String cypher =
                    (String) request.get(
                            "cypherQuery"
                    );

            String sql =
                    (String) request.get(
                            "sqlQuery"
                    );

            @SuppressWarnings("unchecked")
            Map<String, List<String>> columns =
                    (Map<String, List<String>>)
                            request.get(
                                    "requiredColumns"
                            );

            if (cypher == null
                    || cypher.trim().isEmpty()) {

                return ResponseEntity.badRequest()
                        .body(
                                Map.of(
                                        "error",
                                        "cypherQuery is required."
                                )
                        );
            }

            if (columns == null) {
                columns = Map.of();
            }

            String result =
                    neo4jService.generateSampleData(
                            cypher,
                            sql == null ? "" : sql,
                            columns
                    );

            return ResponseEntity.ok(
                    Map.of(
                            "sampleData",
                            result
                    )
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

        String candidateJson =
                request.get("candidateJson");

        String cypher =
                request.get("cypherQuery");

        if (candidateJson == null
                || candidateJson.trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    "candidateJson is required."
                            )
                    );
        }

        if (cypher == null
                || cypher.trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    "cypherQuery is required."
                            )
                    );
        }

        try {

            String result =
                    neo4jService.validateSteps(
                            candidateJson,
                            cypher
                    );

            return ResponseEntity.ok(
                    Map.of(
                            "validation",
                            result
                    )
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
     * Explain a Cypher syntax error.
     */
    @PostMapping("/syntax-error")
    public ResponseEntity<?> syntaxError(
            @RequestBody Map<String, String> request
    ) {

        String cypher =
                request.get("cypherQuery");

        String errorMessage =
                request.get("errorMessage");

        if (cypher == null
                || cypher.trim().isEmpty()) {

            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "error",
                                    "cypherQuery is required."
                            )
                    );
        }

        if (errorMessage == null
                || errorMessage.trim().isEmpty()) {

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
                    neo4jService.explainSyntaxError(
                            cypher,
                            errorMessage
                    );

            return ResponseEntity.ok(
                    Map.of(
                            "explanation",
                            result
                    )
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
}