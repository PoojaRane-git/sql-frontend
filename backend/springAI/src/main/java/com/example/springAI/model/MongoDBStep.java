package com.example.springAI.model;

public class MongoDBStep {

    private final String operation;
    private final String mongodb;
    private final String sql;
    private final String description;

    public MongoDBStep(String operation, String mongodb, String sql, String description) {
        this.operation = operation;
        this.mongodb = mongodb;
        this.sql = sql;
        this.description = description;
    }

    public String getOperation() { return operation; }
    public String getMongodb() { return mongodb; }
    public String getSql() { return sql; }
    public String getDescription() { return description; }
}