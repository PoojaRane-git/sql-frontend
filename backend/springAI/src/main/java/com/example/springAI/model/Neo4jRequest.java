package com.example.springAI.model;

public class Neo4jRequest {


    private String query;

    public Neo4jRequest() {
    }

    public  Neo4jRequest(String query) {
        this.query = query;
    }

    public String getQuery() {
        return query;
    }

    public void setQuery(String query) {
        this.query = query;
    }
}
