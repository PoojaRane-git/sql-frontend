package com.example.springAI.model;

import java.util.List;
import java.util.Map;

public class Neo4jResponse {

    private String source;

    private String inputQuery;

    private String sqlQuery;

    private String explanation;

    private String parsedDetails;

    private List<Neo4jStep> steps;

    private Map<String, List<String>> requiredColumnsByTable;

    private Map<String, Object> sampleData;

    public Neo4jResponse() {
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

    public String getSqlQuery() {
        return sqlQuery;
    }

    public void setSqlQuery(String sqlQuery) {
        this.sqlQuery = sqlQuery;
    }

    public String getExplanation() {
        return explanation;
    }

    public void setExplanation(String explanation) {
        this.explanation = explanation;
    }

    public String getParsedDetails() {
        return parsedDetails;
    }

    public void setParsedDetails(String parsedDetails) {
        this.parsedDetails = parsedDetails;
    }

    public List<Neo4jStep> getSteps() {
        return steps;
    }

    public void setSteps(List<Neo4jStep> steps) {
        this.steps = steps;
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
}