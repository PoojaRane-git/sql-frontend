package com.example.springAI.service;

import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class SQLExecutionEngine {

    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
    private static final Pattern DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    private static final Pattern DATETIME = Pattern.compile("\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}");
    // H2 file/script functions must never be reachable from user SQL.
    private static final Pattern FORBIDDEN =
            Pattern.compile("(?i)\\b(file_read|file_write|csvread|csvwrite|runscript|link_schema)\\s*\\(");

    /** Runs the full user query once on the sample data. */
    public ObjectNode execute(String query, JsonNode sampleData) {
        if (query == null || query.isBlank()) return failure("SQL query is empty.");
        String sql = query.trim().replaceAll(";\\s*$", "");
        if (!isReadOnlySelect(sql)) return failure("Only SELECT queries are supported.");
        if (FORBIDDEN.matcher(sql).find()) return failure("This function is not allowed.");
        return executeMany(List.of(sql), sampleData).get(0);
    }

    /**
     * One in-memory DB, many queries (used to trace every step of a statement).
     * Never throws: a failure is returned per query.
     */
    public List<ObjectNode> executeMany(List<String> queries, JsonNode sampleData) {
        List<ObjectNode> out = new ArrayList<>();
        String url = "jdbc:h2:mem:triql_" + UUID.randomUUID().toString().replace("-", "")
                + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE";
        try (Connection con = DriverManager.getConnection(url, "sa", "")) {
            createTables(con, sampleData);
            for (String q : queries) out.add(runQuery(con, q));
        } catch (Exception e) {
            String msg = e.getMessage() == null ? "Unknown H2 error." : e.getMessage();
            while (out.size() < queries.size()) out.add(failure(msg));
        }
        return out;
    }

    public boolean isReadOnlySelect(String sql) {
        String cleaned = sql.replaceAll("(?s)/\\*.*?\\*/", "").replaceAll("(?m)--.*$", "")
                .trim().toLowerCase(Locale.ROOT);
        return cleaned.startsWith("select") || cleaned.startsWith("with")
                || cleaned.startsWith("(") || cleaned.startsWith("values") || cleaned.startsWith("table");
    }

    // ------------------------------------------------------------------ run

    private ObjectNode runQuery(Connection con, String sql) {
        ObjectNode result = JsonNodeFactory.instance.objectNode();
        ArrayNode columns = JsonNodeFactory.instance.arrayNode();
        ArrayNode rows = JsonNodeFactory.instance.arrayNode();
        try (Statement st = con.createStatement()) {
            st.setQueryTimeout(10);   // runaway recursive CTE / huge cross join guard
            st.setMaxRows(1000);
            try (ResultSet rs = st.executeQuery(sql)) {
                ResultSetMetaData md = rs.getMetaData();
                int n = md.getColumnCount();
                List<String> labels = new ArrayList<>();
                for (int i = 1; i <= n; i++) {
                    String base = md.getColumnLabel(i);
                    String label = base;
                    int k = 2;
                    while (labels.contains(label)) label = base + "_" + k++;   // duplicate labels (SELECT *)
                    labels.add(label);
                    columns.add(label);
                }
                while (rs.next()) {
                    ObjectNode row = JsonNodeFactory.instance.objectNode();
                    for (int i = 1; i <= n; i++) {
                        Object v = rs.getObject(i);
                        String name = labels.get(i - 1);
                        if (v == null) row.putNull(name);
                        else if (v instanceof Integer || v instanceof Short || v instanceof Byte) row.put(name, ((Number) v).intValue());
                        else if (v instanceof Long) row.put(name, (Long) v);
                        else if (v instanceof Number) row.put(name, ((Number) v).doubleValue());
                        else if (v instanceof Boolean) row.put(name, (Boolean) v);
                        else if (v instanceof Timestamp) row.put(name, v.toString().replaceAll("\\.0$", ""));
                        else row.put(name, v.toString());
                    }
                    rows.add(row);
                }
            }
            result.put("success", true);
            result.put("execution_status", "EXECUTED");
            result.put("execution_message", "SQL query executed successfully in H2.");
            result.set("columns", columns);
            result.set("rows", rows);
            result.put("row_count", rows.size());
        } catch (Exception e) {
            return failure(e.getMessage() == null ? "Unknown H2 execution error." : e.getMessage());
        }
        return result;
    }

    private ObjectNode failure(String message) {
        ObjectNode r = JsonNodeFactory.instance.objectNode();
        r.put("success", false);
        r.put("execution_status", "FAILED");
        r.put("error", message);
        r.set("columns", JsonNodeFactory.instance.arrayNode());
        r.set("rows", JsonNodeFactory.instance.arrayNode());
        r.put("row_count", 0);
        return r;
    }

    // --------------------------------------------------------------- tables

    private void createTables(Connection con, JsonNode sampleData) throws SQLException {
        if (sampleData == null || !sampleData.isObject()) {
            throw new IllegalArgumentException("Sample data must be a JSON object keyed by table name.");
        }
        for (Map.Entry<String, JsonNode> t : sampleData.properties()) {
            String table = t.getKey();
            JsonNode rows = t.getValue();
            check(table);
            if (!rows.isArray() || rows.isEmpty()) {
                throw new IllegalArgumentException("Table '" + table + "' must contain at least one sample row.");
            }
            // union of the keys of ALL rows (not just the first one)
            LinkedHashSet<String> cols = new LinkedHashSet<>();
            for (JsonNode row : rows) {
                if (!row.isObject()) throw new IllegalArgumentException("Every sample row must be an object.");
                for (String c : row.propertyNames()) cols.add(c);
            }
            if (cols.isEmpty()) throw new IllegalArgumentException("Invalid sample row for table: " + table);

            List<String> defs = new ArrayList<>();
            for (String c : cols) {
                check(c);
                defs.add(q(c) + " " + inferType(rows, c));
            }
            try (Statement st = con.createStatement()) {
                st.execute("CREATE TABLE " + q(table) + " (" + String.join(", ", defs) + ")");
            }
            insert(con, table, rows, new ArrayList<>(cols));
        }
    }

    private void insert(Connection con, String table, JsonNode rows, List<String> cols) throws SQLException {
        StringBuilder sql = new StringBuilder("INSERT INTO ").append(q(table)).append(" (");
        for (int i = 0; i < cols.size(); i++) sql.append(i > 0 ? ", " : "").append(q(cols.get(i)));
        sql.append(") VALUES (").append("?, ".repeat(cols.size() - 1)).append("?)");

        try (PreparedStatement ps = con.prepareStatement(sql.toString())) {
            for (JsonNode row : rows) {
                for (int i = 0; i < cols.size(); i++) {
                    JsonNode v = row.get(cols.get(i));
                    int idx = i + 1;
                    if (v == null || v.isNull()) ps.setObject(idx, null);
                    else if (v.isInt()) ps.setInt(idx, v.intValue());
                    else if (v.isLong()) ps.setLong(idx, v.longValue());
                    else if (v.isNumber()) ps.setDouble(idx, v.doubleValue());
                    else if (v.isBoolean()) ps.setBoolean(idx, v.booleanValue());
                    else if (v.isString()) ps.setString(idx, v.asString());
                    else ps.setString(idx, v.toString());
                }
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    /** Looks at EVERY row: 50000 then 52000.5 must give DOUBLE, not INTEGER (which silently rounds). */
    private String inferType(JsonNode rows, String col) {
        boolean i = false, l = false, d = false, b = false, s = false, date = true, ts = true, any = false;
        for (JsonNode row : rows) {
            JsonNode v = row.get(col);
            if (v == null || v.isNull()) continue;
            any = true;
            if (v.isInt()) i = true;
            else if (v.isLong()) l = true;
            else if (v.isNumber()) d = true;
            else if (v.isBoolean()) b = true;
            else {
                s = true;
                String t = v.asString();
                date &= DATE.matcher(t).matches();
                ts &= DATETIME.matcher(t).matches();
            }
        }
        if (!any) return "VARCHAR(1000)";
        boolean num = i || l || d;
        if (s && !num && !b) return date ? "DATE" : ts ? "TIMESTAMP" : "VARCHAR(1000)";
        if (s || (num && b)) return "VARCHAR(1000)";
        if (b) return "BOOLEAN";
        return d ? "DOUBLE" : l ? "BIGINT" : "INTEGER";
    }

    private void check(String name) {
        if (name == null || !IDENTIFIER.matcher(name).matches()) {
            throw new IllegalArgumentException("Invalid SQL identifier: " + name);
        }
    }

    /** Tables/columns are stored lower-case (DATABASE_TO_LOWER), so "Employees" in the data still matches employees in SQL. */
    private String q(String id) {
        check(id);
        return "\"" + id.toLowerCase(Locale.ROOT) + "\"";
    }
}