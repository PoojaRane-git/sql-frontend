package com.example.springAI.model;

public class QueryResponse {
    private String explanation;
    private String parsedDetails;

    public QueryResponse(String explanation, String parsedDetails) {
        this.explanation = explanation;
        this.parsedDetails = parsedDetails;
    }

    public String getExplanation() { return explanation; }
    public String getParsedDetails() { return parsedDetails; }
}