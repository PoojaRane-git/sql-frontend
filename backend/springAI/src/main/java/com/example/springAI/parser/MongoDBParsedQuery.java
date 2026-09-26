package com.example.springAI.parser;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MongoDBParsedQuery {

    private final String originalQuery;
    private final String collection;
    private final String operation;
    private final List<String> stages;

    private final Map<String, String> filters;
    private final Map<String, String> projections;
    private final Map<String, Integer> sort;
    private final Integer limit;
    private final Integer skip;

    private final String groupField;
    private final String groupAccumulator;
    private final String groupValueField;

    private final String lookupFrom;
    private final String lookupLocalField;
    private final String lookupForeignField;
    private final String lookupAs;

    private final String unwindField;

    private final List<String> aggregateStages;

    public MongoDBParsedQuery(
            String originalQuery,
            String collection,
            String operation,
            List<String> stages,
            Map<String, String> filters,
            Map<String, String> projections,
            Map<String, Integer> sort,
            Integer limit,
            Integer skip,
            String groupField,
            String groupAccumulator,
            String groupValueField,
            String lookupFrom,
            String lookupLocalField,
            String lookupForeignField,
            String lookupAs,
            String unwindField,
            List<String> aggregateStages
    ) {
        this.originalQuery = originalQuery;
        this.collection = collection;
        this.operation = operation;
        this.stages = stages;
        this.filters = filters;
        this.projections = projections;
        this.sort = sort;
        this.limit = limit;
        this.skip = skip;
        this.groupField = groupField;
        this.groupAccumulator = groupAccumulator;
        this.groupValueField = groupValueField;
        this.lookupFrom = lookupFrom;
        this.lookupLocalField = lookupLocalField;
        this.lookupForeignField = lookupForeignField;
        this.lookupAs = lookupAs;
        this.unwindField = unwindField;
        this.aggregateStages = aggregateStages;
    }

    // =====================================================
    // MAIN PARSER
    // =====================================================

    public static MongoDBParsedQuery parse(String query) {

        if (query == null || query.trim().isEmpty()) {
            throw new IllegalArgumentException(
                    "MongoDB query cannot be empty."
            );
        }

        String cleaned = query.trim();

        String collection =
                extractCollection(cleaned);

        String operation =
                detectOperation(cleaned);

        List<String> stages =
                detectStages(cleaned);

        Map<String, String> filters =
                new LinkedHashMap<>();

        Map<String, String> projections =
                new LinkedHashMap<>();

        Map<String, Integer> sort =
                new LinkedHashMap<>();

        Integer limit = null;
        Integer skip = null;

        String groupField = null;
        String groupAccumulator = null;
        String groupValueField = null;

        String lookupFrom = null;
        String lookupLocalField = null;
        String lookupForeignField = null;
        String lookupAs = null;

        String unwindField = null;

        List<String> aggregateStages =
                new ArrayList<>();

        // =================================================
        // FIND
        // =================================================

        if ("FIND".equals(operation)) {

            String findBody =
                    extractMethodBody(
                            cleaned,
                            ".find("
                    );

            List<String> arguments =
                    splitTopLevelArguments(
                            findBody
                    );

            if (!arguments.isEmpty()) {

                String filter =
                        arguments.get(0).trim();

                if (!filter.equals("{}")
                        && !filter.isEmpty()) {

                    filters.putAll(
                            parseConditions(filter)
                    );
                }
            }

            if (arguments.size() >= 2) {

                String projection =
                        arguments.get(1).trim();

                projections.putAll(
                        parseProjection(
                                projection
                        )
                );
            }

            sort =
                    parseSort(
                            cleaned
                    );

            limit =
                    parseIntegerMethod(
                            cleaned,
                            ".limit("
                    );

            skip =
                    parseIntegerMethod(
                            cleaned,
                            ".skip("
                    );
        }

        // =================================================
        // FIND ONE
        // =================================================

        if ("FIND_ONE".equals(operation)) {

            String findBody =
                    extractMethodBody(
                            cleaned,
                            ".findOne("
                    );

            if (!findBody.trim().isEmpty()
                    && !findBody.trim().equals("{}")) {

                filters.putAll(
                        parseConditions(
                                findBody
                        )
                );
            }
        }

        // =================================================
        // COUNT DOCUMENTS
        // =================================================

        if ("COUNT_DOCUMENTS".equals(operation)) {

            String countBody =
                    extractMethodBody(
                            cleaned,
                            ".countDocuments("
                    );

            if (!countBody.trim().isEmpty()
                    && !countBody.trim().equals("{}")) {

                filters.putAll(
                        parseConditions(
                                countBody
                        )
                );
            }
        }

        // =================================================
        // AGGREGATE
        // =================================================

        if ("AGGREGATE".equals(operation)) {

            String aggregateBody =
                    extractMethodBody(
                            cleaned,
                            ".aggregate("
                    );

            aggregateStages =
                    extractAggregateStages(
                            aggregateBody
                    );

            for (String stage : aggregateStages) {

                String lower =
                        stage.toLowerCase();

                // -----------------------------------------
                // $match
                // -----------------------------------------

                if (lower.contains("$match")) {

                    String matchBody =
                            extractObjectAfter(
                                    stage,
                                    "$match"
                            );

                    if (matchBody != null) {

                        filters.putAll(
                                parseConditions(
                                        matchBody
                                )
                        );
                    }
                }

                // -----------------------------------------
                // $group
                // -----------------------------------------

                if (lower.contains("$group")) {

                    String groupBody =
                            extractObjectAfter(
                                    stage,
                                    "$group"
                            );

                    if (groupBody != null) {

                        groupField =
                                extractGroupId(
                                        groupBody
                                );

                        GroupAccumulatorResult result =
                                extractGroupAccumulator(
                                        groupBody
                                );

                        if (result != null) {

                            groupAccumulator =
                                    result.accumulator;

                            groupValueField =
                                    result.field;
                        }
                    }
                }

                // -----------------------------------------
                // $sort
                // -----------------------------------------

                if (lower.contains("$sort")) {

                    String sortBody =
                            extractObjectAfter(
                                    stage,
                                    "$sort"
                            );

                    if (sortBody != null) {

                        sort =
                                parseSortObject(
                                        sortBody
                                );
                    }
                }

                // -----------------------------------------
                // $lookup
                // -----------------------------------------

                if (lower.contains("$lookup")) {

                    String lookupBody =
                            extractObjectAfter(
                                    stage,
                                    "$lookup"
                            );

                    if (lookupBody != null) {

                        lookupFrom =
                                extractStringProperty(
                                        lookupBody,
                                        "from"
                                );

                        lookupLocalField =
                                extractStringProperty(
                                        lookupBody,
                                        "localField"
                                );

                        lookupForeignField =
                                extractStringProperty(
                                        lookupBody,
                                        "foreignField"
                                );

                        lookupAs =
                                extractStringProperty(
                                        lookupBody,
                                        "as"
                                );
                    }
                }

                // -----------------------------------------
                // $unwind
                // -----------------------------------------

                if (lower.contains("$unwind")) {

                    String extracted =
                            extractUnwindField(stage);

                    if (extracted != null) {
                        unwindField = extracted;
                    }
                }

                // -----------------------------------------
                // $skip / $limit inside aggregate pipeline
                // -----------------------------------------

                if (lower.contains("$skip")) {

                    Integer extractedSkip =
                            extractIntAfter(stage, "$skip");

                    if (extractedSkip != null) {
                        skip = extractedSkip;
                    }
                }

                if (lower.contains("$limit")) {

                    Integer extractedLimit =
                            extractIntAfter(stage, "$limit");

                    if (extractedLimit != null) {
                        limit = extractedLimit;
                    }
                }
            }
        }

        return new MongoDBParsedQuery(
                cleaned,
                collection,
                operation,
                stages,
                filters,
                projections,
                sort,
                limit,
                skip,
                groupField,
                groupAccumulator,
                groupValueField,
                lookupFrom,
                lookupLocalField,
                lookupForeignField,
                lookupAs,
                unwindField,
                aggregateStages
        );
    }

    // =====================================================
    // COLLECTION
    // =====================================================

    private static String extractCollection(
            String query
    ) {

        Pattern pattern =
                Pattern.compile(
                        "db\\.([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\.",
                        Pattern.CASE_INSENSITIVE
                );

        Matcher matcher =
                pattern.matcher(query);

        if (!matcher.find()) {

            throw new IllegalArgumentException(
                    "Could not determine MongoDB collection."
            );
        }

        return matcher.group(1);
    }

    // =====================================================
    // OPERATION
    // =====================================================

    private static String detectOperation(
            String query
    ) {

        String lower =
                query.toLowerCase();

        if (lower.contains(
                ".countdocuments("
        )) {
            return "COUNT_DOCUMENTS";
        }

        if (lower.contains(
                ".aggregate("
        )) {
            return "AGGREGATE";
        }

        if (lower.contains(
                ".findone("
        )) {
            return "FIND_ONE";
        }

        if (lower.contains(
                ".find("
        )) {
            return "FIND";
        }

        throw new IllegalArgumentException(
                "Supported MongoDB operations are find(), findOne(), countDocuments() and aggregate()."
        );
    }

    // =====================================================
    // STAGES
    // =====================================================

    private static List<String> detectStages(
            String query
    ) {

        List<String> stages =
                new ArrayList<>();

        String lower =
                query.toLowerCase();

        if (lower.contains(".find(")) {
            stages.add("FIND");
        }

        if (lower.contains(".findone(")) {
            stages.add("FIND_ONE");
        }

        if (lower.contains(".countdocuments(")) {
            stages.add("COUNT_DOCUMENTS");
        }

        if (lower.contains("$match")) {
            stages.add("$MATCH");
        }

        if (lower.contains("$project")) {
            stages.add("$PROJECT");
        }

        if (lower.contains("$group")) {
            stages.add("$GROUP");
        }

        if (lower.contains("$sort")
                || lower.contains(".sort(")) {
            stages.add("$SORT");
        }

        if (lower.contains("$lookup")) {
            stages.add("$LOOKUP");
        }

        if (lower.contains("$unwind")) {
            stages.add("$UNWIND");
        }

        if (lower.contains(".skip(")
                || lower.contains("$skip")) {
            stages.add("SKIP");
        }

        if (lower.contains(".limit(")
                || lower.contains("$limit")) {
            stages.add("LIMIT");
        }

        return stages;
    }

    // =====================================================
    // CONDITIONS
    // =====================================================

    private static Map<String, String> parseConditions(
            String object
    ) {

        Map<String, String> result =
                new LinkedHashMap<>();

        String cleaned =
                object.trim();

        if (cleaned.startsWith("{")
                && cleaned.endsWith("}")) {

            cleaned =
                    cleaned.substring(
                            1,
                            cleaned.length() - 1
                    );
        }

        List<String> fields =
                splitTopLevel(
                        cleaned,
                        ','
                );

        for (String field : fields) {

            String[] pair =
                    splitKeyValue(
                            field
                    );

            if (pair == null) {
                continue;
            }

            String rawKey =
                    cleanKey(pair[0]);

            // ---------------------------------------------
            // $or / $and (logical grouping)
            // ---------------------------------------------

            if (rawKey.equals("$or")
                    || rawKey.equals("$and")) {

                String logicalOp =
                        rawKey.equals("$or")
                                ? "OR"
                                : "AND";

                String arrayBody =
                        pair[1].trim();

                if (arrayBody.startsWith("[")
                        && arrayBody.endsWith("]")) {

                    arrayBody =
                            arrayBody.substring(
                                    1,
                                    arrayBody.length() - 1
                            );
                }

                List<String> subExpressions =
                        new ArrayList<>();

                for (String subCondition :
                        splitTopLevel(arrayBody, ',')) {

                    Map<String, String> subFilters =
                            parseConditions(
                                    subCondition.trim()
                            );

                    List<String> parts =
                            new ArrayList<>();

                    for (Map.Entry<String, String> e :
                            subFilters.entrySet()) {

                        String v = e.getValue();
                        String opPart;
                        String valPart;

                        if (v.startsWith("= ")) {
                            opPart = "=";
                            valPart = v.substring(2);
                        } else {
                            String[] split =
                                    v.split(" ", 2);
                            opPart = split[0];
                            valPart =
                                    split.length > 1
                                            ? split[1]
                                            : "";
                        }

                        parts.add(
                                e.getKey()
                                        + " "
                                        + opPart
                                        + " "
                                        + valPart
                        );
                    }

                    subExpressions.add(
                            "("
                                    + String.join(" AND ", parts)
                                    + ")"
                    );
                }

                result.put(
                        "__logical_" + result.size(),
                        "("
                                + String.join(
                                " " + logicalOp + " ",
                                subExpressions
                        )
                                + ")"
                );

                continue;
            }

            String key = rawKey;

            String value =
                    pair[1].trim();

            if (value.startsWith("{")
                    && value.endsWith("}")) {

                String inner =
                        value.substring(
                                1,
                                value.length() - 1
                        );

                List<String> operators =
                        splitTopLevel(
                                inner,
                                ','
                        );

                for (String operator :
                        operators) {

                    String[] opPair =
                            splitKeyValue(
                                    operator
                            );

                    if (opPair == null) {
                        continue;
                    }

                    String op =
                            cleanKey(
                                    opPair[0]
                            );

                    String opValue =
                            opPair[1].trim();

                    result.put(
                            key,
                            convertOperator(
                                    op,
                                    opValue
                            )
                    );
                }

            } else {

                result.put(
                        key,
                        "= "
                                + formatSqlValue(
                                value
                        )
                );
            }
        }

        return result;
    }

    private static String convertOperator(
            String operator,
            String value
    ) {

        String sqlValue =
                formatSqlValue(
                        value
                );

        return switch (operator) {

            case "$gt" ->
                    "> " + sqlValue;

            case "$gte" ->
                    ">= " + sqlValue;

            case "$lt" ->
                    "< " + sqlValue;

            case "$lte" ->
                    "<= " + sqlValue;

            case "$ne" ->
                    "<> " + sqlValue;

            case "$eq" ->
                    "= " + sqlValue;

            case "$in" ->
                    "IN (" + formatInList(value) + ")";

            case "$nin" ->
                    "NOT IN (" + formatInList(value) + ")";

            case "$exists" ->
                    value.trim().equalsIgnoreCase("true")
                            ? "IS NOT NULL"
                            : "IS NULL";

            case "$regex" ->
                    "LIKE " + convertRegexToLike(value);

            default ->
                    throw new IllegalArgumentException(
                            "Unsupported MongoDB operator: "
                                    + operator
                    );
        };
    }

    private static String formatInList(
            String arrayValue
    ) {

        String cleaned =
                arrayValue.trim();

        if (cleaned.startsWith("[")
                && cleaned.endsWith("]")) {

            cleaned =
                    cleaned.substring(
                            1,
                            cleaned.length() - 1
                    );
        }

        List<String> formatted =
                new ArrayList<>();

        for (String item : splitTopLevel(cleaned, ',')) {

            formatted.add(
                    formatSqlValue(item.trim())
            );
        }

        return String.join(", ", formatted);
    }

    private static String convertRegexToLike(
            String regexValue
    ) {

        String cleaned =
                regexValue.trim();

        if ((cleaned.startsWith("\"") && cleaned.endsWith("\""))
                || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {

            cleaned =
                    cleaned.substring(
                            1,
                            cleaned.length() - 1
                    );
        }

        boolean anchoredStart =
                cleaned.startsWith("^");

        boolean anchoredEnd =
                cleaned.endsWith("$");

        String core =
                cleaned.replaceAll("^\\^|\\$$", "");

        String pattern =
                (anchoredStart ? "" : "%")
                        + core
                        + (anchoredEnd ? "" : "%");

        return "'"
                + pattern.replace("'", "''")
                + "'";
    }

    // =====================================================
    // PROJECTION
    // =====================================================

    private static Map<String, String> parseProjection(
            String object
    ) {

        Map<String, String> result =
                new LinkedHashMap<>();

        String cleaned =
                object.trim();

        if (cleaned.startsWith("{")
                && cleaned.endsWith("}")) {

            cleaned =
                    cleaned.substring(
                            1,
                            cleaned.length() - 1
                    );
        }

        for (String item :
                splitTopLevel(cleaned, ',')) {

            String[] pair =
                    splitKeyValue(
                            item
                    );

            if (pair == null) {
                continue;
            }

            String field =
                    cleanKey(pair[0]);

            String value =
                    pair[1].trim();

            result.put(
                    field,
                    value
            );
        }

        return result;
    }

    // =====================================================
    // SORT
    // =====================================================

    private static Map<String, Integer> parseSort(
            String query
    ) {

        String body =
                extractMethodBody(
                        query,
                        ".sort("
                );

        if (body == null
                || body.trim().isEmpty()) {

            return new LinkedHashMap<>();
        }

        return parseSortObject(
                body
        );
    }

    private static Map<String, Integer> parseSortObject(
            String object
    ) {

        Map<String, Integer> result =
                new LinkedHashMap<>();

        String cleaned =
                object.trim();

        if (cleaned.startsWith("{")
                && cleaned.endsWith("}")) {

            cleaned =
                    cleaned.substring(
                            1,
                            cleaned.length() - 1
                    );
        }

        for (String item :
                splitTopLevel(cleaned, ',')) {

            String[] pair =
                    splitKeyValue(
                            item
                    );

            if (pair == null) {
                continue;
            }

            String field =
                    cleanKey(pair[0]);

            int direction =
                    Integer.parseInt(
                            pair[1].trim()
                    );

            result.put(
                    field,
                    direction
            );
        }

        return result;
    }

    // =====================================================
    // INTEGER METHOD (top-level .skip()/.limit())
    // =====================================================

    private static Integer parseIntegerMethod(
            String query,
            String method
    ) {

        String body =
                extractMethodBody(
                        query,
                        method
                );

        if (body == null
                || body.trim().isEmpty()) {

            return null;
        }

        return Integer.parseInt(
                body.trim()
        );
    }

    // =====================================================
    // INTEGER AFTER (aggregate $skip / $limit stages)
    // =====================================================

    private static Integer extractIntAfter(
            String stage,
            String key
    ) {

        Pattern pattern =
                Pattern.compile(
                        Pattern.quote(key)
                                + "\\s*:\\s*(-?\\d+)"
                );

        Matcher matcher =
                pattern.matcher(stage);

        if (matcher.find()) {

            return Integer.parseInt(
                    matcher.group(1)
            );
        }

        return null;
    }

    // =====================================================
    // AGGREGATION STAGES
    // =====================================================

    private static List<String> extractAggregateStages(
            String aggregateBody
    ) {

        List<String> stages =
                new ArrayList<>();

        if (aggregateBody == null) {
            return stages;
        }

        String body =
                aggregateBody.trim();

        if (body.startsWith("[")
                && body.endsWith("]")) {

            body =
                    body.substring(
                            1,
                            body.length() - 1
                    );
        }

        List<String> objects =
                splitTopLevel(
                        body,
                        ','
                );

        StringBuilder current =
                new StringBuilder();

        int depth = 0;

        for (String piece : objects) {

            current.append(
                    piece
            );

            depth +=
                    countChar(piece, '{')
                            - countChar(piece, '}');

            if (depth == 0) {

                stages.add(
                        current.toString().trim()
                );

                current.setLength(0);

            } else {

                current.append(",");
            }
        }

        if (!current.isEmpty()) {

            stages.add(
                    current.toString().trim()
            );
        }

        return stages;
    }

    // =====================================================
    // GROUP
    // =====================================================

    private static String extractGroupId(
            String groupBody
    ) {

        Pattern pattern =
                Pattern.compile(
                        "(?:['\"]?)_id(?:['\"]?)\\s*:\\s*['\"]?\\$?([a-zA-Z_][a-zA-Z0-9_]*)['\"]?"
                );

        Matcher matcher =
                pattern.matcher(
                        groupBody
                );

        if (matcher.find()) {

            return matcher.group(1);
        }

        return null;
    }

    private static GroupAccumulatorResult
    extractGroupAccumulator(
            String groupBody
    ) {

        Pattern pattern =
                Pattern.compile(
                        "(?:['\"]?)(\\$sum|\\$avg|\\$min|\\$max)(?:['\"]?)\\s*:\\s*['\"]?\\$?([a-zA-Z_][a-zA-Z0-9_]*)['\"]?"
                );

        Matcher matcher =
                pattern.matcher(
                        groupBody
                );

        if (!matcher.find()) {
            return null;
        }

        return new GroupAccumulatorResult(
                matcher.group(1),
                matcher.group(2)
        );
    }

    // =====================================================
    // LOOKUP
    // =====================================================

    private static String extractObjectAfter(
            String text,
            String key
    ) {

        int index =
                text.toLowerCase()
                        .indexOf(
                                key.toLowerCase()
                        );

        if (index < 0) {
            return null;
        }

        int start =
                text.indexOf(
                        '{',
                        index
                );

        if (start < 0) {
            return null;
        }

        return extractBalanced(
                text,
                start,
                '{',
                '}'
        );
    }

    private static String extractStringProperty(
            String object,
            String property
    ) {

        Pattern pattern =
                Pattern.compile(
                        "(?:['\"]?)"
                                + Pattern.quote(property)
                                + "(?:['\"]?)\\s*:\\s*['\"]([^'\"]+)['\"]"
                );

        Matcher matcher =
                pattern.matcher(
                        object
                );

        if (matcher.find()) {

            return matcher.group(1);
        }

        return null;
    }

    // =====================================================
    // UNWIND
    // =====================================================

    private static String extractUnwindField(
            String stage
    ) {

        Pattern simple =
                Pattern.compile(
                        "\\$unwind\\s*:\\s*['\"]\\$([a-zA-Z_][a-zA-Z0-9_]*)['\"]"
                );

        Matcher m = simple.matcher(stage);

        if (m.find()) {
            return m.group(1);
        }

        Pattern pathForm =
                Pattern.compile(
                        "\\$unwind\\s*:\\s*\\{[^}]*?path\\s*:\\s*['\"]\\$([a-zA-Z_][a-zA-Z0-9_]*)['\"]"
                );

        Matcher pm = pathForm.matcher(stage);

        if (pm.find()) {
            return pm.group(1);
        }

        return null;
    }

    // =====================================================
    // METHOD BODY
    // =====================================================

    private static String extractMethodBody(
            String query,
            String method
    ) {

        int methodIndex =
                query.toLowerCase()
                        .indexOf(
                                method.toLowerCase()
                        );

        if (methodIndex < 0) {
            return null;
        }

        int open =
                query.indexOf(
                        '(',
                        methodIndex
                                + method.length()
                                - 1
                );

        if (open < 0) {
            return null;
        }

        String body =
                extractBalanced(
                        query,
                        open,
                        '(',
                        ')'
                );

        if (body == null
                || body.length() < 2) {

            return body;
        }

        return body.substring(
                1,
                body.length() - 1
        );
    }

    // =====================================================
    // BALANCED EXTRACTION
    // =====================================================

    private static String extractBalanced(
            String text,
            int start,
            char openChar,
            char closeChar
    ) {

        int depth = 0;

        boolean inString = false;
        char stringChar = 0;

        for (int i = start;
             i < text.length();
             i++) {

            char c =
                    text.charAt(i);

            if ((c == '\'' || c == '"')
                    && (i == 0
                    || text.charAt(i - 1) != '\\')) {

                if (!inString) {

                    inString = true;
                    stringChar = c;

                } else if (stringChar == c) {

                    inString = false;
                }
            }

            if (inString) {
                continue;
            }

            if (c == openChar) {
                depth++;
            }

            if (c == closeChar) {

                depth--;

                if (depth == 0) {

                    return text.substring(
                            start,
                            i + 1
                    );
                }
            }
        }

        return null;
    }

    // =====================================================
    // TOP LEVEL SPLIT
    // =====================================================

    private static List<String> splitTopLevel(
            String text,
            char separator
    ) {

        List<String> result =
                new ArrayList<>();

        StringBuilder current =
                new StringBuilder();

        int parentheses = 0;
        int braces = 0;
        int brackets = 0;

        boolean inString = false;
        char stringChar = 0;

        for (int i = 0;
             i < text.length();
             i++) {

            char c =
                    text.charAt(i);

            if ((c == '\'' || c == '"')
                    && (i == 0
                    || text.charAt(i - 1) != '\\')) {

                if (!inString) {

                    inString = true;
                    stringChar = c;

                } else if (stringChar == c) {

                    inString = false;
                }
            }

            if (!inString) {

                if (c == '(') parentheses++;
                if (c == ')') parentheses--;

                if (c == '{') braces++;
                if (c == '}') braces--;

                if (c == '[') brackets++;
                if (c == ']') brackets--;

                if (c == separator
                        && parentheses == 0
                        && braces == 0
                        && brackets == 0) {

                    result.add(
                            current.toString()
                    );

                    current.setLength(0);

                    continue;
                }
            }

            current.append(c);
        }

        if (!current.isEmpty()) {

            result.add(
                    current.toString()
            );
        }

        return result;
    }

    private static List<String> splitTopLevelArguments(
            String text
    ) {

        return splitTopLevel(
                text,
                ','
        );
    }

    // =====================================================
    // KEY VALUE
    // =====================================================

    private static String[] splitKeyValue(
            String text
    ) {

        int depth = 0;

        boolean inString = false;
        char stringChar = 0;

        for (int i = 0;
             i < text.length();
             i++) {

            char c =
                    text.charAt(i);

            if ((c == '\'' || c == '"')
                    && (i == 0
                    || text.charAt(i - 1) != '\\')) {

                if (!inString) {

                    inString = true;
                    stringChar = c;

                } else if (stringChar == c) {

                    inString = false;
                }
            }

            if (inString) {
                continue;
            }

            if (c == '{'
                    || c == '['
                    || c == '(') {

                depth++;
            }

            if (c == '}'
                    || c == ']'
                    || c == ')') {

                depth--;
            }

            if (c == ':'
                    && depth == 0) {

                return new String[]{
                        text.substring(
                                0,
                                i
                        ),
                        text.substring(
                                i + 1
                        )
                };
            }
        }

        return null;
    }

    // =====================================================
    // VALUE HELPERS
    // =====================================================

    private static String cleanKey(
            String key
    ) {

        return key.trim()
                .replace(
                        "'",
                        ""
                )
                .replace(
                        "\"",
                        ""
                );
    }

    private static String formatSqlValue(
            String value
    ) {

        String cleaned =
                value.trim();

        if (cleaned.startsWith("\"")
                && cleaned.endsWith("\"")) {

            return "'"
                    + cleaned.substring(
                            1,
                            cleaned.length() - 1
                    )
                    .replace(
                            "'",
                            "''"
                    )
                    + "'";
        }

        if (cleaned.startsWith("'")
                && cleaned.endsWith("'")) {

            return "'"
                    + cleaned.substring(
                            1,
                            cleaned.length() - 1
                    )
                    .replace(
                            "'",
                            "''"
                    )
                    + "'";
        }

        if (cleaned.matches(
                "-?\\d+(\\.\\d+)?"
        )) {

            return cleaned;
        }

        if (cleaned.equalsIgnoreCase("true")
                || cleaned.equalsIgnoreCase("false")) {

            return cleaned.toUpperCase();
        }

        if (cleaned.equalsIgnoreCase("null")) {

            return "NULL";
        }

        if (cleaned.startsWith("$")) {

            return cleaned.substring(1);
        }

        return "'"
                + cleaned.replace(
                "'",
                "''"
        )
                + "'";
    }

    private static int countChar(
            String text,
            char target
    ) {

        int count = 0;

        for (char c : text.toCharArray()) {

            if (c == target) {
                count++;
            }
        }

        return count;
    }

    // =====================================================
    // GETTERS
    // =====================================================

    public String getOriginalQuery() {
        return originalQuery;
    }

    public String getCollection() {
        return collection;
    }

    public String getOperation() {
        return operation;
    }

    public List<String> getStages() {
        return stages;
    }

    public Map<String, String> getFilters() {
        return filters;
    }

    public Map<String, String> getProjections() {
        return projections;
    }

    public Map<String, Integer> getSort() {
        return sort;
    }

    public Integer getLimit() {
        return limit;
    }

    public Integer getSkip() {
        return skip;
    }

    public String getGroupField() {
        return groupField;
    }

    public String getGroupAccumulator() {
        return groupAccumulator;
    }

    public String getGroupValueField() {
        return groupValueField;
    }

    public String getLookupFrom() {
        return lookupFrom;
    }

    public String getLookupLocalField() {
        return lookupLocalField;
    }

    public String getLookupForeignField() {
        return lookupForeignField;
    }

    public String getLookupAs() {
        return lookupAs;
    }

    public String getUnwindField() {
        return unwindField;
    }

    public List<String> getAggregateStages() {
        return aggregateStages;
    }

    // =====================================================
    // INTERNAL RESULT
    // =====================================================

    private static class GroupAccumulatorResult {

        private final String accumulator;
        private final String field;

        private GroupAccumulatorResult(
                String accumulator,
                String field
        ) {
            this.accumulator = accumulator;
            this.field = field;
        }
    }
}