package com.example.springAI.model;

public class Neo4jStep {

    private String operation;
    private String cypher;
    private String sql;
    private String description;

    public Neo4jStep() {
    }

    public Neo4jStep(
            String operation,
            String cypher,
            String sql,
            String description
    ) {
        this.operation = operation;
        this.cypher = cypher;
        this.sql = sql;
        this.description = description;
    }

    public String getOperation() {
        return operation;
    }

    public void setOperation(String operation) {
        this.operation = operation;
    }

    public String getCypher() {
        return cypher;
    }

    public void setCypher(String cypher) {
        this.cypher = cypher;
    }

    public String getSql() {
        return sql;
    }

    public void setSql(String sql) {
        this.sql = sql;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}