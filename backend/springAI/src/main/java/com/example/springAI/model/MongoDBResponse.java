package com.example.springAI.model;

import java.util.List;
import java.util.Map;

public class MongoDBResponse {

    private String source;
    private String inputQuery;

    private String collection;
    private String operation;

    private List<String> stages;

    private String sqlQuery;
    private String concept;

    private String explanation;

    private List<String> conversionSteps;

    private Map<String, Object> visualization;

    private Map<String, List<String>>
            requiredColumnsByTable;

    // now structured (was String) — matches
    // MongoDBExecutionService.generateSampleDataStructured
    private Map<String, Object> sampleData;

    // Ollama generated execution steps — now structured
    // (was String) — matches MongoDBStep
    private List<MongoDBStep> executionSteps;

    public MongoDBResponse() {
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getInputQuery() {
        return inputQuery;
    }

    public void setInputQuery(String inputQuery) {
        this.inputQuery = inputQuery;
    }

    public String getCollection() {
        return collection;
    }

    public void setCollection(String collection) {
        this.collection = collection;
    }

    public String getOperation() {
        return operation;
    }

    public void setOperation(String operation) {
        this.operation = operation;
    }

    public List<String> getStages() {
        return stages;
    }

    public void setStages(List<String> stages) {
        this.stages = stages;
    }

    public String getSqlQuery() {
        return sqlQuery;
    }

    public void setSqlQuery(String sqlQuery) {
        this.sqlQuery = sqlQuery;
    }

    public String getConcept() {
        return concept;
    }

    public void setConcept(String concept) {
        this.concept = concept;
    }

    public String getExplanation() {
        return explanation;
    }

    public void setExplanation(String explanation) {
        this.explanation = explanation;
    }

    public List<String> getConversionSteps() {
        return conversionSteps;
    }

    public void setConversionSteps(List<String> conversionSteps) {
        this.conversionSteps = conversionSteps;
    }

    public Map<String, Object> getVisualization() {
        return visualization;
    }

    public void setVisualization(Map<String, Object> visualization) {
        this.visualization = visualization;
    }

    public Map<String, List<String>> getRequiredColumnsByTable() {
        return requiredColumnsByTable;
    }

    public void setRequiredColumnsByTable(
            Map<String, List<String>> requiredColumnsByTable
    ) {
        this.requiredColumnsByTable = requiredColumnsByTable;
    }

    public Map<String, Object> getSampleData() {
        return sampleData;
    }

    public void setSampleData(Map<String, Object> sampleData) {
        this.sampleData = sampleData;
    }

    public List<MongoDBStep> getExecutionSteps() {
        return executionSteps;
    }

    public void setExecutionSteps(List<MongoDBStep> executionSteps) {
        this.executionSteps = executionSteps;
    }
}