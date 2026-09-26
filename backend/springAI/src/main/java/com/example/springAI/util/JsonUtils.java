package com.example.springAI.util;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class JsonUtils {

    private static final Pattern FENCE = Pattern.compile("```(?:json)?\\s*([\\s\\S]*?)```", Pattern.MULTILINE);
    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private JsonUtils() {}

    public static String extractJson(String raw) {
        if (raw == null) {
            return "{}";
        }
        String trimmed = raw.trim();

        Matcher m = FENCE.matcher(trimmed);
        if (m.find()) {
            return m.group(1).trim();
        }

        int start = -1;
        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            if (c == '{' || c == '[') {
                start = i;
                break;
            }
        }
        if (start == -1) {
            return trimmed;
        }
        char open = trimmed.charAt(start);
        char close = open == '{' ? '}' : ']';
        int end = trimmed.lastIndexOf(close);
        if (end == -1 || end < start) {
            return trimmed.substring(start);
        }
        return trimmed.substring(start, end + 1);
    }

    public static JsonNode parse(String raw) {
        return MAPPER.readTree(extractJson(raw));
    }

    // =====================================================================
    // MERGE ENTRY POINT
    // =====================================================================

    /**
     * Merges the LLM-produced steps (metadata only — no row data) with the
     * LLM-produced sample_data (raw base rows only), computing a REAL
     * per-clause row pipeline in Java: WHERE / HAVING / GROUP BY / ORDER BY /
     * LIMIT / DISTINCT are actually evaluated against the row data here,
     * rather than the previous behavior of cloning the raw table unfiltered
     * into every step.
     *
     * Known simplifications (not attempted here — out of scope for this fix):
     *  - No real multi-table JOIN row computation; only the first table found
     *    in sample_data is used as the working row set (same limitation the
     *    previous implementation had).
     *  - No real SELECT column projection; output_rows keeps full row shape
     *    rather than only the SELECT list's columns.
     *  - WHERE/HAVING condition chains are evaluated strictly left-to-right
     *    (AND/OR are not given parenthesis-aware precedence).
     */
    public static ObjectNode mergeStepsAndSampleData(JsonNode stepsJson, JsonNode sampleDataJson) {
        ObjectNode merged = ((ObjectNode) stepsJson).deepCopy();
        JsonNode sampleData = sampleDataJson.has("sample_data")
                ? sampleDataJson.get("sample_data")
                : sampleDataJson;
        merged.set("sample_data", sampleData);

        ArrayNode rawTableRows = firstNonEmptyTable(sampleData);
        if (rawTableRows == null) {
            rawTableRows = MAPPER.createArrayNode();
        }

        String query = merged.path("query").asString("");
        if (query.isBlank()) {
            // fall back to whatever the caller already had, if the model omitted "query"
            query = "";
        }

        RowPipeline pipeline = new RowPipeline(query, rawTableRows);

        if (merged.has("steps") && merged.get("steps").isArray()) {
            ArrayNode stepsArray = (ArrayNode) merged.get("steps");

            boolean hasWhere = pipeline.hasClause("WHERE");
            boolean hasGroupBy = pipeline.hasClause("GROUP BY");
            boolean hasHaving = pipeline.hasClause("HAVING");
            boolean hasOrderBy = pipeline.hasClause("ORDER BY");
            boolean hasLimit = pipeline.hasClause("LIMIT");
            boolean hasSelect = query.toUpperCase(Locale.ROOT).contains("SELECT");
            boolean hasDistinct = pipeline.hasDistinct();

            boolean foundWhere = false, foundGroupBy = false, foundHaving = false,
                    foundOrderBy = false, foundLimit = false, foundSelect = false, foundDistinct = false;

            for (JsonNode stepNode : stepsArray) {
                if (!stepNode.isObject()) continue;
                ObjectNode stepObj = (ObjectNode) stepNode;
                String clause = stepObj.path("clause").asString("").toUpperCase(Locale.ROOT);

                if (clause.contains("WHERE")) foundWhere = true;
                if (clause.contains("GROUP")) foundGroupBy = true;
                if (clause.contains("HAVING")) foundHaving = true;
                if (clause.contains("ORDER")) foundOrderBy = true;
                if (clause.contains("LIMIT")) foundLimit = true;
                if (clause.contains("DISTINCT")) foundDistinct = true;
                if (clause.contains("SELECT") && !clause.contains("DISTINCT")) foundSelect = true;

                stepObj.set("output_rows", pipeline.rowsForClause(clause));
            }

            int nextStepNum = stepsArray.size() + 1;

            if (hasWhere && !foundWhere) {
                stepsArray.add(createStepNode(nextStepNum++, "WHERE", "Filtering rows based on condition", pipeline.rowsForClause("WHERE")));
            }
            if (hasGroupBy && !foundGroupBy) {
                stepsArray.add(createStepNode(nextStepNum++, "GROUP BY", "Grouping rows by specified columns", pipeline.rowsForClause("GROUP BY")));
            }
            if (hasHaving && !foundHaving) {
                stepsArray.add(createStepNode(nextStepNum++, "HAVING", "Filtering groups based on aggregate condition", pipeline.rowsForClause("HAVING")));
            }
            if (hasSelect && !foundSelect) {
                stepsArray.add(createStepNode(nextStepNum++, "SELECT", "Projecting final columns", pipeline.rowsForClause("SELECT")));
            }
            if (hasDistinct && !foundDistinct) {
                stepsArray.add(createStepNode(nextStepNum++, "DISTINCT", "Removing duplicate rows", pipeline.rowsForClause("DISTINCT")));
            }
            if (hasOrderBy && !foundOrderBy) {
                stepsArray.add(createStepNode(nextStepNum++, "ORDER BY", "Sorting the final result set", pipeline.rowsForClause("ORDER BY")));
            }
            if (hasLimit && !foundLimit) {
                stepsArray.add(createStepNode(nextStepNum++, "LIMIT", "Restricting the number of output rows", pipeline.rowsForClause("LIMIT")));
            }
        }
        return merged;
    }

    private static ArrayNode firstNonEmptyTable(JsonNode sampleData) {
        if (sampleData != null && sampleData.isObject()) {
            for (Map.Entry<String, JsonNode> entry : sampleData.properties()) {
                if (entry.getValue().isArray() && !entry.getValue().isEmpty()) {
                    return (ArrayNode) entry.getValue();
                }
            }
        }
        return null;
    }

    private static ObjectNode createStepNode(int stepNum, String clause, String explanation, ArrayNode rows) {
        ObjectNode step = MAPPER.createObjectNode();
        step.put("step_number", stepNum);
        step.put("clause", clause);
        step.put("sql_fragment", clause + " clause");
        step.put("execution_order", stepNum);
        step.put("explanation", explanation);
        step.set("input_columns", MAPPER.createArrayNode());
        step.set("output_columns", MAPPER.createArrayNode());
        step.set("output_rows", rows);
        return step;
    }

    public static JsonMapper mapper() {
        return MAPPER;
    }

    // =====================================================================
    // ROW PIPELINE — actually evaluates each clause against real row data
    // =====================================================================

    private static final class RowPipeline {
        private final String query;
        private final String queryUpper;

        private final List<ObjectNode> baseRows;      // raw rows, each with a stable _rowKey
        private final List<ObjectNode> afterWhere;
        private final List<ObjectNode> afterGroupBy;   // grouped+aggregated rows (or same as afterWhere if no GROUP BY)
        private final List<ObjectNode> afterHaving;
        private final List<ObjectNode> afterDistinct;
        private final List<ObjectNode> afterOrderBy;
        private final List<ObjectNode> afterLimit;

        private final boolean hasGroupBy;
        private final boolean hasHaving;

        RowPipeline(String query, ArrayNode rawTableRows) {
            this.query = query;
            this.queryUpper = query.toUpperCase(Locale.ROOT);

            this.baseRows = cloneWithKeys(rawTableRows);

            String whereText = extractClause(query, "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT");
            this.afterWhere = whereText == null ? new ArrayList<>(baseRows) : filterRows(baseRows, whereText);

            this.hasGroupBy = hasClause("GROUP BY");
            if (hasGroupBy) {
                String groupByText = extractClause(query, "GROUP BY", "HAVING", "ORDER BY", "LIMIT");
                List<String> groupCols = splitColumns(groupByText);
                List<AggExpr> aggs = extractAggregates(query);
                this.afterGroupBy = computeGroupedRows(afterWhere, groupCols, aggs);
            } else {
                this.afterGroupBy = new ArrayList<>(afterWhere);
            }

            this.hasHaving = hasClause("HAVING");
            if (hasHaving) {
                String havingText = extractClause(query, "HAVING", "ORDER BY", "LIMIT");
                this.afterHaving = havingText == null ? new ArrayList<>(afterGroupBy) : filterRows(afterGroupBy, havingText);
            } else {
                this.afterHaving = new ArrayList<>(afterGroupBy);
            }

            if (hasDistinct()) {
                this.afterDistinct = distinctRows(afterHaving);
            } else {
                this.afterDistinct = new ArrayList<>(afterHaving);
            }

            if (hasClause("ORDER BY")) {
                String orderByText = extractClause(query, "ORDER BY", "LIMIT");
                this.afterOrderBy = orderByText == null ? new ArrayList<>(afterDistinct) : sortRows(afterDistinct, orderByText);
            } else {
                this.afterOrderBy = new ArrayList<>(afterDistinct);
            }

            if (hasClause("LIMIT")) {
                Integer n = extractLimit(query);
                this.afterLimit = n == null ? new ArrayList<>(afterOrderBy) : afterOrderBy.subList(0, Math.min(n, afterOrderBy.size()));
            } else {
                this.afterLimit = new ArrayList<>(afterOrderBy);
            }
        }

        boolean hasClause(String keyword) {
            return Pattern.compile("(?i)\\b" + Pattern.quote(keyword) + "\\b").matcher(query).find();
        }

        boolean hasDistinct() {
            // Standalone "SELECT DISTINCT" only — DISTINCT inside an aggregate (COUNT(DISTINCT x)) doesn't count.
            return Pattern.compile("(?i)\\bSELECT\\s+DISTINCT\\b").matcher(query).find();
        }

        /** Returns the correct computed row array for a given step's clause label. */
        ArrayNode rowsForClause(String clauseUpper) {
            if (clauseUpper.contains("WHERE")) return toArray(afterWhere);
            if (clauseUpper.contains("HAVING")) return toArray(afterHaving);
            if (clauseUpper.contains("GROUP") || clauseUpper.contains("AGGREGATE")) return toArray(afterGroupBy);
            if (clauseUpper.contains("DISTINCT")) return toArray(afterDistinct);
            if (clauseUpper.contains("ORDER")) return toArray(afterOrderBy);
            if (clauseUpper.contains("LIMIT")) return toArray(afterLimit);
            if (clauseUpper.contains("SELECT")) return toArray(hasGroupBy ? afterGroupBy : afterWhere);
            // FROM, JOIN, SUBQUERY, CTE, WINDOW FUNCTION, UNION, or anything unrecognized:
            // show the base rows (best available approximation without full JOIN/subquery execution).
            return toArray(baseRows);
        }

        private ArrayNode toArray(List<ObjectNode> rows) {
            ArrayNode arr = MAPPER.createArrayNode();
            for (ObjectNode row : rows) arr.add(row);
            return arr;
        }
    }

    private static List<ObjectNode> cloneWithKeys(ArrayNode sourceRows) {
        List<ObjectNode> out = new ArrayList<>();
        int rowKey = 1;
        for (JsonNode row : sourceRows) {
            ObjectNode enriched = (ObjectNode) row.deepCopy();
            enriched.put("_rowKey", rowKey++);
            out.add(enriched);
        }
        return out;
    }

    // kept for any external caller that still wants a plain clone (e.g. FROM step / fallback)
    private static ArrayNode cloneRowsWithKeys(ArrayNode sourceRows) {
        ArrayNode newRows = MAPPER.createArrayNode();
        for (ObjectNode row : cloneWithKeys(sourceRows)) newRows.add(row);
        return newRows;
    }

    // =====================================================================
    // CLAUSE TEXT EXTRACTION
    // =====================================================================

    /** Extracts the text after `keyword` up to whichever of `stopKeywords` appears first (or end of query). */
    private static String extractClause(String query, String keyword, String... stopKeywords) {
        Pattern startPattern = Pattern.compile("(?i)\\b" + Pattern.quote(keyword) + "\\b");
        Matcher startMatcher = startPattern.matcher(query);
        if (!startMatcher.find()) return null;
        int start = startMatcher.end();

        int end = query.length();
        for (String stop : stopKeywords) {
            Matcher stopMatcher = Pattern.compile("(?i)\\b" + Pattern.quote(stop) + "\\b").matcher(query);
            if (stopMatcher.find(start) && stopMatcher.start() < end) {
                end = stopMatcher.start();
            }
        }
        if (start >= end) return null;
        String text = query.substring(start, end).trim();
        // trim a single trailing semicolon if present
        if (text.endsWith(";")) text = text.substring(0, text.length() - 1).trim();
        return text.isEmpty() ? null : text;
    }

    private static List<String> splitColumns(String text) {
        if (text == null) return List.of();
        List<String> out = new ArrayList<>();
        for (String part : text.split(",")) {
            String col = stripTablePrefix(part.trim());
            if (!col.isEmpty()) out.add(col);
        }
        return out;
    }

    private static String stripTablePrefix(String col) {
        int dot = col.lastIndexOf('.');
        return dot >= 0 ? col.substring(dot + 1).trim() : col.trim();
    }

    private static Integer extractLimit(String query) {
        Matcher m = Pattern.compile("(?i)\\bLIMIT\\s+(\\d+)").matcher(query);
        if (m.find()) {
            try { return Integer.parseInt(m.group(1)); } catch (NumberFormatException ignored) { }
        }
        return null;
    }

    // =====================================================================
    // WHERE / HAVING CONDITION EVALUATION
    // =====================================================================

    private record Condition(String column, String operator, String rawValue) {}

    private static List<ObjectNode> filterRows(List<ObjectNode> rows, String conditionText) {
        List<ObjectNode> out = new ArrayList<>();
        for (ObjectNode row : rows) {
            if (evaluateConditionChain(row, conditionText)) out.add(row);
        }
        return out;
    }

    /** Evaluates a (possibly AND/OR chained) condition string against one row. Left-to-right, no parens precedence. */
    private static boolean evaluateConditionChain(ObjectNode row, String conditionText) {
        // crude paren stripping — good enough for simple, non-nested condition groups
        String cleaned = conditionText.replace("(", " ").replace(")", " ").trim();

        String[] tokens = cleaned.split("(?i)\\s+(AND|OR)\\s+");
        Matcher connectorMatcher = Pattern.compile("(?i)\\s+(AND|OR)\\s+").matcher(cleaned);

        if (tokens.length == 0) return true;
        boolean result = evaluateSingleCondition(row, tokens[0]);
        int tokenIndex = 1;
        while (connectorMatcher.find() && tokenIndex < tokens.length) {
            String connector = connectorMatcher.group(1).toUpperCase(Locale.ROOT);
            boolean next = evaluateSingleCondition(row, tokens[tokenIndex]);
            result = connector.equals("AND") ? (result && next) : (result || next);
            tokenIndex++;
        }
        return result;
    }

    private static boolean evaluateSingleCondition(ObjectNode row, String conditionText) {
        String text = conditionText.trim();
        if (text.isEmpty()) return true;

        Matcher nullMatcher = Pattern.compile("(?i)^([\\w.]+)\\s+IS\\s+(NOT\\s+)?NULL$").matcher(text);
        if (nullMatcher.matches()) {
            JsonNode value = getColumnValue(row, nullMatcher.group(1));
            boolean isNull = (value == null || value.isNull());
            boolean negated = nullMatcher.group(2) != null;
            return negated != isNull;
        }

        Matcher condMatcher = Pattern.compile("(?i)^([\\w.]+)\\s*(>=|<=|<>|!=|=|>|<|LIKE)\\s*(.+)$").matcher(text);
        if (!condMatcher.matches()) {
            // unparseable fragment — don't silently drop every row; treat as non-filtering
            return true;
        }

        String column = condMatcher.group(1);
        String operator = condMatcher.group(2).toUpperCase(Locale.ROOT);
        String rawValue = condMatcher.group(3).trim();

        JsonNode actual = getColumnValue(row, column);
        return compare(actual, operator, rawValue);
    }

    private static JsonNode getColumnValue(ObjectNode row, String column) {
        String simple = stripTablePrefix(column);
        if (row.has(simple)) return row.get(simple);
        // case-insensitive fallback, using the same .properties() iteration style
        // already confirmed working elsewhere in this codebase (see mergeStepsAndSampleData)
        for (Map.Entry<String, JsonNode> entry : row.properties()) {
            if (entry.getKey().equalsIgnoreCase(simple)) return entry.getValue();
        }
        return null;
    }

    private static boolean compare(JsonNode actual, String operator, String rawValue) {
        if (actual == null || actual.isNull()) return false;

        String trimmedValue = rawValue.trim();
        boolean isQuotedString = (trimmedValue.length() >= 2)
                && ((trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
                || (trimmedValue.startsWith("\"") && trimmedValue.endsWith("\"")));

        if (operator.equals("LIKE")) {
            String pattern = isQuotedString ? trimmedValue.substring(1, trimmedValue.length() - 1) : trimmedValue;
            String regex = "(?i)^" + Pattern.quote(pattern).replace("%", "\\E.*\\Q").replace("_", "\\E.\\Q") + "$";
            return actual.asString("").matches(regex);
        }

        if (!isQuotedString) {
            Double actualNum = asDouble(actual);
            Double valueNum = tryParseDouble(trimmedValue);
            if (actualNum != null && valueNum != null) {
                int cmp = Double.compare(actualNum, valueNum);
                return switch (operator) {
                    case "=" -> cmp == 0;
                    case "!=", "<>" -> cmp != 0;
                    case ">" -> cmp > 0;
                    case "<" -> cmp < 0;
                    case ">=" -> cmp >= 0;
                    case "<=" -> cmp <= 0;
                    default -> false;
                };
            }
        }

        String actualStr = actual.isString() ? actual.asString() : actual.toString();
        String valueStr = isQuotedString ? trimmedValue.substring(1, trimmedValue.length() - 1) : trimmedValue;
        int cmp = actualStr.compareToIgnoreCase(valueStr);
        return switch (operator) {
            case "=" -> cmp == 0;
            case "!=", "<>" -> cmp != 0;
            case ">" -> cmp > 0;
            case "<" -> cmp < 0;
            case ">=" -> cmp >= 0;
            case "<=" -> cmp <= 0;
            default -> false;
        };
    }

    private static Double asDouble(JsonNode node) {
        if (node.isNumber()) return node.asDouble();
        if (node.isString()) return tryParseDouble(node.asString());
        return null;
    }

    private static Double tryParseDouble(String s) {
        try { return Double.parseDouble(s.trim()); } catch (NumberFormatException e) { return null; }
    }

    // =====================================================================
    // GROUP BY + AGGREGATES
    // =====================================================================

    private record AggExpr(String function, boolean distinct, String argument, String displayKey) {}

    private static List<AggExpr> extractAggregates(String query) {
        List<AggExpr> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Matcher m = Pattern.compile("(?i)\\b(COUNT|SUM|AVG|MIN|MAX)\\s*\\(\\s*(DISTINCT\\s+)?([^)]*)\\)").matcher(query);
        while (m.find()) {
            String func = m.group(1).toUpperCase(Locale.ROOT);
            boolean distinct = m.group(2) != null;
            String arg = m.group(3).trim();
            String display = func + "(" + (distinct ? "DISTINCT " : "") + arg + ")";
            if (seen.add(display.toUpperCase(Locale.ROOT))) {
                result.add(new AggExpr(func, distinct, arg, display));
            }
        }
        if (result.isEmpty()) {
            // no explicit aggregate found but GROUP BY exists — fall back to COUNT(*) so groups are still visible
            result.add(new AggExpr("COUNT", false, "*", "COUNT(*)"));
        }
        return result;
    }

    private static List<ObjectNode> computeGroupedRows(List<ObjectNode> rows, List<String> groupCols, List<AggExpr> aggs) {
        LinkedHashMap<String, List<ObjectNode>> groups = new LinkedHashMap<>();
        LinkedHashMap<String, Map<String, JsonNode>> groupKeyValues = new LinkedHashMap<>();

        for (ObjectNode row : rows) {
            List<String> keyParts = new ArrayList<>();
            Map<String, JsonNode> keyValues = new LinkedHashMap<>();
            if (groupCols.isEmpty()) {
                keyParts.add("__all__");
            } else {
                for (String col : groupCols) {
                    JsonNode v = getColumnValue(row, col);
                    keyParts.add(v == null ? "NULL" : v.toString());
                    keyValues.put(col, v);
                }
            }
            String key = String.join("||", keyParts);
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(row);
            groupKeyValues.putIfAbsent(key, keyValues);
        }

        List<ObjectNode> result = new ArrayList<>();
        int rowKey = 1;
        for (Map.Entry<String, List<ObjectNode>> entry : groups.entrySet()) {
            List<ObjectNode> groupRows = entry.getValue();
            ObjectNode outRow = MAPPER.createObjectNode();
            for (Map.Entry<String, JsonNode> kv : groupKeyValues.get(entry.getKey()).entrySet()) {
                outRow.set(kv.getKey(), kv.getValue() == null ? MAPPER.nullNode() : kv.getValue());
            }
            for (AggExpr agg : aggs) {
                outRow.set(agg.displayKey(), computeAggregate(groupRows, agg));
            }
            outRow.put("_rowKey", rowKey++);
            result.add(outRow);
        }
        return result;
    }

    private static JsonNode computeAggregate(List<ObjectNode> groupRows, AggExpr agg) {
        if (agg.function().equals("COUNT")) {
            if (agg.argument().equals("*")) {
                return MAPPER.getNodeFactory().numberNode(groupRows.size());
            }
            Set<String> seen = new HashSet<>();
            int count = 0;
            for (ObjectNode row : groupRows) {
                JsonNode v = getColumnValue(row, agg.argument());
                if (v == null || v.isNull()) continue;
                if (agg.distinct()) {
                    if (seen.add(v.toString())) count++;
                } else {
                    count++;
                }
            }
            return MAPPER.getNodeFactory().numberNode(count);
        }

        List<Double> values = new ArrayList<>();
        Set<String> seenVals = new HashSet<>();
        for (ObjectNode row : groupRows) {
            JsonNode v = getColumnValue(row, agg.argument());
            Double d = v == null ? null : asDouble(v);
            if (d == null) continue;
            if (agg.distinct()) {
                if (seenVals.add(d.toString())) values.add(d);
            } else {
                values.add(d);
            }
        }
        if (values.isEmpty()) return MAPPER.nullNode();

        double result = switch (agg.function()) {
            case "SUM" -> values.stream().mapToDouble(Double::doubleValue).sum();
            case "AVG" -> values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
            case "MIN" -> Collections.min(values);
            case "MAX" -> Collections.max(values);
            default -> 0;
        };
        return MAPPER.getNodeFactory().numberNode(result);
    }

    // =====================================================================
    // ORDER BY / DISTINCT
    // =====================================================================

    private static List<ObjectNode> sortRows(List<ObjectNode> rows, String orderByText) {
        record SortKey(String column, boolean descending) {}
        List<SortKey> keys = new ArrayList<>();
        for (String part : orderByText.split(",")) {
            String trimmed = part.trim();
            boolean desc = Pattern.compile("(?i)\\bDESC\\b").matcher(trimmed).find();
            String col = trimmed.replaceAll("(?i)\\s+(ASC|DESC)\\s*$", "").trim();
            keys.add(new SortKey(stripTablePrefix(col), desc));
        }

        List<ObjectNode> sorted = new ArrayList<>(rows);
        sorted.sort((a, b) -> {
            for (SortKey key : keys) {
                JsonNode va = getColumnValue(a, key.column());
                JsonNode vb = getColumnValue(b, key.column());
                int cmp = compareNodes(va, vb);
                if (cmp != 0) return key.descending() ? -cmp : cmp;
            }
            return 0;
        });
        return sorted;
    }

    private static int compareNodes(JsonNode a, JsonNode b) {
        if (a == null || a.isNull()) return (b == null || b.isNull()) ? 0 : -1;
        if (b == null || b.isNull()) return 1;
        Double da = asDouble(a), db = asDouble(b);
        if (da != null && db != null) return Double.compare(da, db);
        String sa = a.isString() ? a.asString() : a.toString();
        String sb = b.isString() ? b.asString() : b.toString();
        return sa.compareToIgnoreCase(sb);
    }

    private static List<ObjectNode> distinctRows(List<ObjectNode> rows) {
        List<ObjectNode> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (ObjectNode row : rows) {
            ObjectNode withoutKey = row.deepCopy();
            withoutKey.remove("_rowKey");
            String signature = withoutKey.toString();
            if (seen.add(signature)) out.add(row);
        }
        return out;
    }
}