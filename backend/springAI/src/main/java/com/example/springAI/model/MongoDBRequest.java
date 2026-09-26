package com.example.springAI.model;

public class MongoDBRequest {

    private String query;

    public MongoDBRequest() {
    }

    public MongoDBRequest(
            String query
    ) {
        this.query = query;
    }

    public String getQuery() {
        return query;
    }

    public void setQuery(
            String query
    ) {
        this.query = query;
    }
}