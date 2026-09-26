package com.example.springAI.converter;

import com.example.springAI.parser.MongoDBParsedQuery;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class MongoDBToSqlConverter {

    // =====================================================
    // MAIN CONVERSION
    // =====================================================

    public ConversionResult convert(
            MongoDBParsedQuery parsed
    ) {

        if (parsed == null) {

            throw new IllegalArgumentException(
                    "Parsed MongoDB query cannot be null."
            );
        }

        String operation =
                parsed.getOperation();

        return switch (operation) {

            case "FIND" ->
                    convertFind(parsed);

            case "FIND_ONE" ->
                    convertFindOne(parsed);

            case "COUNT_DOCUMENTS" ->
                    convertCount(parsed);

            case "AGGREGATE" ->
                    convertAggregate(parsed);

            default ->
                    throw new IllegalArgumentException(
                            "Unsupported MongoDB operation: "
                                    + operation
                    );
        };
    }

    // =====================================================
    // FIND
    // =====================================================

    private ConversionResult convertFind(
            MongoDBParsedQuery parsed
    ) {

        StringBuilder sql =
                new StringBuilder();

        List<String> steps =
                new ArrayList<>();

        String select =
                buildSelect(
                        parsed.getProjections()
                );

        sql.append(select)
                .append("\nFROM ")
                .append(parsed.getCollection());

        steps.add(
                "FIND → SELECT / FROM"
        );

        if (!parsed.getFilters().isEmpty()) {

            sql.append("\nWHERE ")
                    .append(
                            buildWhere(
                                    parsed.getFilters()
                            )
                    );

            steps.add(
                    "FILTER → WHERE"
            );
        }

        if (!parsed.getSort().isEmpty()) {

            sql.append("\nORDER BY ")
                    .append(
                            buildSort(
                                    parsed.getSort()
                            )
                    );

            steps.add(
                    "SORT → ORDER BY"
            );
        }

        if (parsed.getSkip() != null) {

            sql.append("\nOFFSET ")
                    .append(
                            parsed.getSkip()
                    );

            steps.add(
                    "SKIP → OFFSET"
            );
        }

        if (parsed.getLimit() != null) {

            sql.append("\nLIMIT ")
                    .append(
                            parsed.getLimit()
                    );

            steps.add(
                    "LIMIT → LIMIT"
            );
        }

        sql.append(";");

        String concept =
                determineFindConcept(
                        parsed
                );

        return new ConversionResult(
                sql.toString(),
                concept,
                steps,
                buildVisualization(
                        parsed
                ),
                buildRequiredColumns(
                        parsed
                )
        );
    }

    // =====================================================
    // FIND ONE
    // =====================================================

    private ConversionResult convertFindOne(
            MongoDBParsedQuery parsed
    ) {

        StringBuilder sql =
                new StringBuilder();

        sql.append(
                buildSelect(
                        parsed.getProjections()
                )
        );

        sql.append("\nFROM ")
                .append(
                        parsed.getCollection()
                );

        List<String> steps =
                new ArrayList<>();

        steps.add(
                "FIND_ONE → SELECT / FROM"
        );

        if (!parsed.getFilters().isEmpty()) {

            sql.append("\nWHERE ")
                    .append(
                            buildWhere(
                                    parsed.getFilters()
                            )
                    );

            steps.add(
                    "FILTER → WHERE"
            );
        }

        sql.append("\nLIMIT 1;");

        steps.add(
                "FIND_ONE → LIMIT 1"
        );

        return new ConversionResult(
                sql.toString(),
                "FIND_ONE",
                steps,
                buildVisualization(
                        parsed
                ),
                buildRequiredColumns(
                        parsed
                )
        );
    }

    // =====================================================
    // COUNT DOCUMENTS
    // =====================================================

    private ConversionResult convertCount(
            MongoDBParsedQuery parsed
    ) {

        StringBuilder sql =
                new StringBuilder();

        sql.append(
                "SELECT COUNT(*) AS count\n"
        );

        sql.append(
                "FROM "
        );

        sql.append(
                parsed.getCollection()
        );

        List<String> steps =
                new ArrayList<>();

        steps.add(
                "COUNT_DOCUMENTS → COUNT(*)"
        );

        if (!parsed.getFilters().isEmpty()) {

            sql.append("\nWHERE ")
                    .append(
                            buildWhere(
                                    parsed.getFilters()
                            )
                    );

            steps.add(
                    "FILTER → WHERE"
            );
        }

        sql.append(";");

        return new ConversionResult(
                sql.toString(),
                "COUNT_DOCUMENTS",
                steps,
                buildVisualization(
                        parsed
                ),
                buildRequiredColumns(
                        parsed
                )
        );
    }

    // =====================================================
    // AGGREGATE (rewritten: sequential stage building,
    // supports $lookup + $group together, $unwind, and
    // $sort/$skip/$limit inside the pipeline)
    // =====================================================

    private ConversionResult convertAggregate(
            MongoDBParsedQuery parsed
    ) {

        boolean hasLookup =
                parsed.getLookupFrom() != null;

        boolean hasGroup =
                parsed.getGroupField() != null;

        boolean hasMatch =
                !parsed.getFilters().isEmpty();

        boolean hasUnwind =
                parsed.getUnwindField() != null;

        StringBuilder sql =
                new StringBuilder();

        List<String> steps =
                new ArrayList<>();

        if (hasGroup) {

            String function =
                    mapAccumulator(
                            parsed.getGroupAccumulator()
                    );

            sql.append("SELECT ")
                    .append(parsed.getGroupField())
                    .append(", ")
                    .append(function)
                    .append("(")
                    .append(parsed.getGroupValueField())
                    .append(") AS total");

        } else {

            sql.append("SELECT *");
        }

        sql.append("\nFROM ")
                .append(parsed.getCollection());

        steps.add("AGGREGATE → FROM");

        // -------------------------------------------------
        // UNWIND (best-effort join against an assumed
        // related table — verify against real schema)
        // -------------------------------------------------

        if (hasUnwind) {

            String childTable =
                    parsed.getCollection()
                            + "_"
                            + parsed.getUnwindField();

            sql.append("\n-- NOTE: $unwind on '")
                    .append(parsed.getUnwindField())
                    .append("' assumed as a related table '")
                    .append(childTable)
                    .append("'; verify this mapping against your actual schema.");

            sql.append("\nJOIN ")
                    .append(childTable)
                    .append("\n    ON ")
                    .append(parsed.getCollection())
                    .append(".id = ")
                    .append(childTable)
                    .append(".")
                    .append(parsed.getCollection())
                    .append("Id");

            steps.add(
                    "$UNWIND → JOIN (assumed child table, verify schema)"
            );
        }

        // -------------------------------------------------
        // LOOKUP
        // -------------------------------------------------

        if (hasLookup) {

            sql.append("\nJOIN ")
                    .append(parsed.getLookupFrom())
                    .append("\n    ON ")
                    .append(parsed.getCollection())
                    .append(".")
                    .append(parsed.getLookupLocalField())
                    .append(" = ")
                    .append(parsed.getLookupFrom())
                    .append(".")
                    .append(parsed.getLookupForeignField());

            steps.add("$LOOKUP → JOIN");
        }

        // -------------------------------------------------
        // MATCH
        // -------------------------------------------------

        if (hasMatch) {

            sql.append("\nWHERE ")
                    .append(
                            buildWhere(
                                    parsed.getFilters()
                            )
                    );

            steps.add("$MATCH → WHERE");
        }

        // -------------------------------------------------
        // GROUP
        // -------------------------------------------------

        if (hasGroup) {

            sql.append("\nGROUP BY ")
                    .append(parsed.getGroupField());

            steps.add(
                    "$GROUP → GROUP BY → "
                            + mapAccumulator(
                            parsed.getGroupAccumulator()
                    )
            );
        }

        // -------------------------------------------------
        // SORT
        // -------------------------------------------------

        if (!parsed.getSort().isEmpty()) {

            sql.append("\nORDER BY ")
                    .append(
                            buildSort(
                                    parsed.getSort()
                            )
                    );

            steps.add("$SORT → ORDER BY");
        }

        // -------------------------------------------------
        // SKIP
        // -------------------------------------------------

        if (parsed.getSkip() != null) {

            sql.append("\nOFFSET ")
                    .append(parsed.getSkip());

            steps.add("$SKIP → OFFSET");
        }

        // -------------------------------------------------
        // LIMIT
        // -------------------------------------------------

        if (parsed.getLimit() != null) {

            sql.append("\nLIMIT ")
                    .append(parsed.getLimit());

            steps.add("$LIMIT → LIMIT");
        }

        sql.append(";");

        String concept =
                hasUnwind
                        ? "UNWIND_JOIN"
                        : hasLookup && hasGroup
                          ? "LOOKUP_GROUP"
                          : hasLookup
                            ? "LOOKUP_JOIN"
                            : hasGroup
                              ? (hasMatch ? "MATCH_GROUP" : "GROUP")
                              : "AGGREGATE";

        return new ConversionResult(
                sql.toString(),
                concept,
                steps,
                buildVisualization(
                        parsed
                ),
                buildRequiredColumns(
                        parsed
                )
        );
    }

    private String mapAccumulator(
            String accumulator
    ) {

        return switch (accumulator.toLowerCase()) {

            case "$sum" -> "SUM";
            case "$avg" -> "AVG";
            case "$min" -> "MIN";
            case "$max" -> "MAX";

            default ->
                    throw new IllegalArgumentException(
                            "Unsupported group accumulator: "
                                    + accumulator
                    );
        };
    }

    // =====================================================
    // SELECT
    // =====================================================

    private String buildSelect(
            Map<String, String> projection
    ) {

        if (projection == null
                || projection.isEmpty()) {

            return "SELECT *";
        }

        List<String> fields =
                new ArrayList<>();

        for (Map.Entry<String, String> entry :
                projection.entrySet()) {

            String field =
                    entry.getKey();

            String value =
                    entry.getValue();

            if ("1".equals(value)) {

                fields.add(
                        field
                );
            }
        }

        if (fields.isEmpty()) {

            return "SELECT *";
        }

        return "SELECT "
                + String.join(
                ", ",
                fields
        );
    }

    // =====================================================
    // WHERE (now handles __logical_* pre-formed
    // OR/AND expressions from $or/$and)
    // =====================================================

    private String buildWhere(
            Map<String, String> filters
    ) {

        List<String> conditions =
                new ArrayList<>();

        for (Map.Entry<String, String> entry :
                filters.entrySet()) {

            String field =
                    entry.getKey();

            String condition =
                    entry.getValue();

            if (field.startsWith("__logical_")) {

                conditions.add(
                        condition
                );

            } else if (condition.startsWith("= ")) {

                conditions.add(
                        field
                                + " = "
                                + condition.substring(2)
                );

            } else {

                conditions.add(
                        field
                                + " "
                                + condition
                );
            }
        }

        return String.join(
                "\n  AND ",
                conditions
        );
    }

    // =====================================================
    // SORT
    // =====================================================

    private String buildSort(
            Map<String, Integer> sort
    ) {

        List<String> parts =
                new ArrayList<>();

        for (Map.Entry<String, Integer> entry :
                sort.entrySet()) {

            parts.add(
                    entry.getKey()
                            + " "
                            + (
                            entry.getValue() < 0
                                    ? "DESC"
                                    : "ASC"
                    )
            );
        }

        return String.join(
                ", ",
                parts
        );
    }

    // =====================================================
    // CONCEPT
    // =====================================================

    private String determineFindConcept(
            MongoDBParsedQuery parsed
    ) {

        if (!parsed.getFilters().isEmpty()
                && !parsed.getSort().isEmpty()
                && parsed.getLimit() != null) {

            return "FILTER_SORT_LIMIT";
        }

        if (!parsed.getFilters().isEmpty()
                && !parsed.getSort().isEmpty()) {

            return "FILTER_SORT";
        }

        if (!parsed.getFilters().isEmpty()
                && parsed.getLimit() != null) {

            return "FILTER_LIMIT";
        }

        if (!parsed.getFilters().isEmpty()) {

            return "FIND_FILTER";
        }

        if (!parsed.getProjections().isEmpty()) {

            return "PROJECTION";
        }

        if (!parsed.getSort().isEmpty()) {

            return "SORT";
        }

        if (parsed.getLimit() != null) {

            return "LIMIT";
        }

        return "FIND";
    }

    // =====================================================
    // VISUALIZATION
    // =====================================================

    private Map<String, Object> buildVisualization(
            MongoDBParsedQuery parsed
    ) {

        Map<String, Object> visualization =
                new LinkedHashMap<>();

        visualization.put(
                "collection",
                parsed.getCollection()
        );

        visualization.put(
                "operation",
                parsed.getOperation()
        );

        visualization.put(
                "filters",
                parsed.getFilters()
        );

        visualization.put(
                "projection",
                parsed.getProjections()
        );

        visualization.put(
                "sort",
                parsed.getSort()
        );

        visualization.put(
                "limit",
                parsed.getLimit()
        );

        visualization.put(
                "skip",
                parsed.getSkip()
        );

        visualization.put(
                "groupField",
                parsed.getGroupField()
        );

        visualization.put(
                "groupAccumulator",
                parsed.getGroupAccumulator()
        );

        visualization.put(
                "groupValueField",
                parsed.getGroupValueField()
        );

        visualization.put(
                "lookupFrom",
                parsed.getLookupFrom()
        );

        visualization.put(
                "lookupLocalField",
                parsed.getLookupLocalField()
        );

        visualization.put(
                "lookupForeignField",
                parsed.getLookupForeignField()
        );

        visualization.put(
                "lookupAs",
                parsed.getLookupAs()
        );

        visualization.put(
                "unwindField",
                parsed.getUnwindField()
        );

        return visualization;
    }

    // =====================================================
    // REQUIRED COLUMNS
    // =====================================================

    private Map<String, List<String>>
    buildRequiredColumns(
            MongoDBParsedQuery parsed
    ) {

        Map<String, List<String>> result =
                new LinkedHashMap<>();

        List<String> columns =
                new ArrayList<>();

        columns.add("id");

        for (String key : parsed.getFilters().keySet()) {

            if (!key.startsWith("__logical_")) {
                columns.add(key);
            }
        }

        columns.addAll(
                parsed.getProjections()
                        .keySet()
        );

        columns.addAll(
                parsed.getSort()
                        .keySet()
        );

        if (parsed.getGroupField() != null) {

            columns.add(
                    parsed.getGroupField()
            );
        }

        if (parsed.getGroupValueField() != null) {

            columns.add(
                    parsed.getGroupValueField()
            );
        }

        if (parsed.getLookupLocalField() != null) {

            columns.add(
                    parsed.getLookupLocalField()
            );
        }

        result.put(
                parsed.getCollection(),
                unique(columns)
        );

        if (parsed.getLookupFrom() != null) {

            List<String> lookupColumns =
                    new ArrayList<>();

            lookupColumns.add("id");

            if (parsed.getLookupForeignField() != null) {

                lookupColumns.add(
                        parsed.getLookupForeignField()
                );
            }

            result.put(
                    parsed.getLookupFrom(),
                    unique(lookupColumns)
            );
        }

        if (parsed.getUnwindField() != null) {

            String childTable =
                    parsed.getCollection()
                            + "_"
                            + parsed.getUnwindField();

            List<String> unwindColumns =
                    new ArrayList<>();

            unwindColumns.add("id");
            unwindColumns.add(
                    parsed.getCollection() + "Id"
            );

            result.put(
                    childTable,
                    unique(unwindColumns)
            );
        }

        return result;
    }

    private List<String> unique(
            List<String> values
    ) {

        return new ArrayList<>(
                new java.util.LinkedHashSet<>(
                        values
                )
        );
    }

    // =====================================================
    // RESULT
    // =====================================================

    public static class ConversionResult {

        private final String sql;
        private final String concept;
        private final List<String> steps;
        private final Map<String, Object> visualization;

        private final Map<String, List<String>>
                requiredColumnsByTable;

        public ConversionResult(
                String sql,
                String concept,
                List<String> steps,
                Map<String, Object> visualization,
                Map<String, List<String>>
                        requiredColumnsByTable
        ) {

            this.sql = sql;
            this.concept = concept;
            this.steps = steps;
            this.visualization =
                    visualization;
            this.requiredColumnsByTable =
                    requiredColumnsByTable;
        }

        public String getSql() {
            return sql;
        }

        public String getConcept() {
            return concept;
        }

        public List<String> getSteps() {
            return steps;
        }

        public Map<String, Object>
        getVisualization() {

            return visualization;
        }

        public Map<String, List<String>>
        getRequiredColumnsByTable() {

            return requiredColumnsByTable;
        }
    }
}