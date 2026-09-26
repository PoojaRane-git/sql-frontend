package com.example.springAI.service;

import java.util.Map;
import java.util.stream.Collectors;

/**
 * Java port of the JS prompt builders (buildStepsPrompt, buildSampleDataPrompt,
 * buildValidationPrompt, buildSyntaxErrorPrompt).
 *
 * Each method returns the exact prompt text to send to the model. Placeholders
 * are substituted with String.replace (not String.format), so the large amount
 * of literal "{" / "}" JSON-schema text in these prompts is never at risk of
 * being misinterpreted as a format specifier.
 */
public final class PromptBuilder {

    private PromptBuilder() {
    }

    // -------------------------
    // EXECUTION STEPS PROMPT
    // -------------------------
    // Analyzes a MySQL query and returns its logical execution order as JSON.
    public static String buildStepsPrompt(String originalQuery) {
        String template = """
                ROLE
                You analyze MySQL 8.0 logical query processing order (Reference Manual §15.2.13) for a specific SQL query and output JSON describing execution steps. Analyze the query given below — never give a generic explanation that could apply to any query.

                This is a VISUALIZATION PIPELINE: each step represents a distinct intermediate state shown to the user, not necessarily a separate physical MySQL operator.

                CANONICAL LOGICAL ORDER (authoritative — do not deviate)
                SUBQUERY -> FROM/JOIN -> WHERE -> GROUP BY -> AGGREGATE -> HAVING -> WINDOW FUNCTION -> SELECT -> DISTINCT -> ORDER BY -> LIMIT

                IMPORTANT — READ THE ORDER STRING ABOVE AS A TEMPLATE, NOT A FIXED SEQUENCE.
                "SUBQUERY" is not a single fixed slot at the start of every query. Each subquery
                is positioned immediately before whichever canonical stage actually consumes its
                result — this may place a SUBQUERY step near the beginning, middle, or near the
                end of the array. Concretely:
                - WHERE subquery (scalar/IN/NOT IN/EXISTS/NOT EXISTS)      -> before WHERE
                - FROM-derived-table subquery                                -> before FROM/JOIN
                - SELECT-expression subquery                                 -> after WHERE/GROUP BY/HAVING
                                                                                  (whichever are present),
                                                                                  immediately before SELECT
                - HAVING subquery                                             -> after GROUP BY and AGGREGATE,
                                                                                  immediately before HAVING
                - ORDER BY subquery                                           -> after SELECT/DISTINCT,
                                                                                  immediately before ORDER BY
                Never move a HAVING or ORDER BY subquery to the front of the steps array just
                because "SUBQUERY" appears first in the template string above.

                Any subquery (FROM-derived table, WHERE IN/NOT IN, EXISTS/NOT EXISTS, scalar comparison, a SELECT-expression subquery, HAVING, or ORDER BY) gets its own SUBQUERY step(s) BEFORE the step that consumes its result — a subquery embedded in WHERE still produces a SUBQUERY step ahead of the WHERE step, not inside it. For a query with multiple subqueries, emit one SUBQUERY step per subquery, in the order they first execute (innermost/independent subqueries before any subquery whose execution depends on them). If two or more subqueries are independent siblings (neither's result feeds the other) and both attach to the same consumer clause (e.g. two IN-subqueries AND-ed together in WHERE), order their SUBQUERY steps by their left-to-right appearance in the original query text. Do not reorder independent siblings for any other reason. CTE and UNION insert their own stage(s) the same way — where they actually execute logically, never forced into this list.

                GROUP BY and AGGREGATE are shown as two separate steps purely so the visualizer can display two distinct intermediate states — they are not two independent physical MySQL operators. GROUP BY produces the grouped intermediate data (rows collected per group); AGGREGATE then calculates the aggregate value(s) from those groups. Describe AGGREGATE as consuming the groups GROUP BY produced, not as an unrelated standalone operation.

                CORE RULES
                1. Include a step ONLY for clauses/operations actually present in the query. Never add a step for an absent clause (no "no HAVING clause" placeholders).
                2. execution_order starts at 1 and increases continuously, no gaps. step_number must equal the step's position in the array.
                3. A SELECT step is always included — every query projects something.
                4. One JOIN step per join clause, in left-to-right FROM order. Never merge multiple joins into a single step, and never fold a join into the FROM step.
                5. Aggregate function (AVG/SUM/COUNT/MIN/MAX) with NO GROUP BY still gets its own dedicated AGGREGATE step: the whole filtered result set becomes one implicit group, producing exactly one output row. Never describe this as "zero rows" or "rows disappearing."
                6. Alias rule: a SELECT-defined alias (AS) is NOT visible in WHERE, JOIN ON/USING, or FROM (those execute before the alias exists). It IS valid to reference in GROUP BY, HAVING, and ORDER BY (MySQL-specific extension). Apply this correctly wherever aliases appear in the query. This restriction applies only within the SAME query block. A column produced by an inner block that has already completed — a CTE's own SELECT alias, a derived table's projected column, or a SELECT-expression subquery's result — is an ordinary column by the time the outer block consumes it, and IS valid in the outer WHERE/JOIN/FROM, exactly like any other column on that source.
                7. DISTINCT is a post-projection step: SELECT builds the projected columns first, DISTINCT then removes duplicate projected rows. Keep SELECT before DISTINCT.
                7b. DISTINCT used inside an aggregate function, e.g. COUNT(DISTINCT column), SUM(DISTINCT column), is part of that AGGREGATE step's own calculation — it is NEVER a separate top-level DISTINCT step. A standalone DISTINCT step is created only when DISTINCT appears directly after SELECT (SELECT DISTINCT ...), applying to the whole projected row.
                8. If a construct's place in the order is genuinely ambiguous for this specific query (e.g. an unusual subquery/window interaction), do not force it into a slot — instead write an explanation that is still specific to this query's actual structure, states plainly that the ordering is ambiguous for this construct, and describes precisely what happens for this query anyway. Never output boilerplate about "explaining the logical stage" as if it were the explanation itself.
                9. GROUP BY step explanation must describe grouped intermediate data, not just group labels. State which rows fall into which group. Example of the required SHAPE ONLY — this is a format illustration, not real data; this prompt is never given actual sample data, so never assert specific values like these unless they were explicitly provided to you elsewhere in this conversation (describe the grouping logic and which columns/conditions define each group instead):
                   Incorrect (labels only): "Sales", "HR"
                   Illustrative shape (rows collected per group): Sales -> [{salary:...},{salary:...}], HR -> [{salary:...}]
                   The GROUP BY explanation must make clear that each group holds a collection of the underlying rows, which is what gets passed to AGGREGATE next — described structurally (which rows share which grouping-column value), not with invented salary/count numbers.
                10. AGGREGATE step explanation must describe the transformation from groups into final aggregate result rows — never group labels alone and never just a description of the math with no resulting structure. It must state that the output includes: (a) the GROUP BY column(s), if any, and (b) every aggregate calculation in the query (COUNT/SUM/AVG/MIN/MAX), computed per group. Illustrative SHAPE only (not real data — never assert specific counts/values unless actually provided to you): input groups Sales:[row,row], HR:[row,row] -> output rows [{"dept":"Sales","COUNT(*)":...}, {"dept":"HR","COUNT(*)":...}]. For a query with no GROUP BY, the single implicit group still produces one output row containing every aggregate value computed — describe which aggregate expressions populate that row, not a fabricated numeric result.
                11. The outermost query itself is never labeled a SUBQUERY step, even if it is later referenced by an enclosing context (e.g. inside a UNION branch or CTE body) — only SELECT blocks that are nested *inside* another SELECT, WHERE, HAVING, FROM, SELECT-list, or ORDER BY are SUBQUERY steps.
                12. When a query contains two or more independent subqueries (e.g. one in WHERE and an unrelated one in SELECT, or two sibling subqueries AND-ed in WHERE), each gets its own complete, independent step: its own sql_fragment, its own explanation, its own input_columns, its own output_columns, and its own execution_order. Never combine two subqueries' data into a single step's fields even if they are structurally similar or short.

                JOIN SEMANTICS (the "clause" field is always literally "JOIN"; state the specific type inside "explanation")
                For every JOIN step's input_columns/output_columns: input_columns lists the exact columns referenced in that JOIN's ON/USING condition (table-qualified if the query qualifies them). output_columns lists the columns actually referenced anywhere in the query (SELECT list, WHERE, GROUP BY, HAVING, ORDER BY, or the join condition itself) that originate from either side of this join, using table-qualified names where a column name collides between sides (except with USING(col), where the deduped single column is listed once, unqualified). This prompt is not given a full table schema — never invent or list a column that isn't actually referenced somewhere in the query text just to make the list look "complete."
                UNKNOWN ≠ EMPTY: never state that a JOIN "produced N rows," "matched no rows," or "removed all rows" — you were not given real data to determine this. State the matching rule (which row category survives, which gets NULL-padded, which is dropped) as a description of the transformation; the actual outcome depends on data this prompt doesn't have access to.
                - INNER JOIN: only rows matching the ON/USING condition on both sides survive; non-matches are dropped from both sides.
                - LEFT JOIN: every left-table row is kept; unmatched right-side columns become NULL.
                - RIGHT JOIN: every right-table row is kept; unmatched left-side columns become NULL.
                - FULL JOIN: MySQL has no native FULL OUTER JOIN keyword — explain it as the union of a LEFT JOIN and a RIGHT JOIN result (matches once, plus unmatched rows from both sides padded with NULL).
                - CROSS JOIN or comma-separated FROM tables with no condition: Cartesian product, every row of one paired with every row of the other.
                - Comma-style FROM (a, b) WITH a later WHERE predicate: Cartesian product happens at FROM, then WHERE performs the equivalent of an INNER JOIN filter — explain the filtering in the WHERE step, not the FROM/JOIN step.
                - SELF JOIN: the same table joined to itself via aliases — treat the two aliases as distinct row sources, matching "different rows of the same table."
                - NATURAL JOIN: MySQL auto-matches on all same-named columns in both tables. You are not given a schema, so only name matching columns you can actually see referenced in the query text (e.g. elsewhere in SELECT/WHERE); if no such column is visible in the query text, state that NATURAL JOIN matches on same-named columns without inventing specific column names.
                - STRAIGHT_JOIN: behaves like INNER JOIN but forces the optimizer to read the left table before the right table in that literal order — note this.
                - USING(column): equivalent to ON equality on that column, and also de-duplicates that column in the output.
                - Multiple joins: each JOIN step operates on the intermediate result produced by the previous FROM/JOIN step, not on the raw base table — state this explicitly.

                OTHER CLAUSE BEHAVIOR
                - FROM: which base/first table is read and how (full scan, index, or derived table/subquery source).
                - WHERE: per-row predicate evaluation before grouping; what survives vs. is removed.
                - GROUP BY: rows clustered into groups by matching column values.
                - HAVING: filters groups/aggregate values after grouping — never operates on raw rows.
                - SELECT: final expression evaluation, projection, alias creation. If SELECT contains only aggregate expressions, state that it returns the single already-computed aggregate row.
                - DISTINCT: duplicate-row removal from the final projected result.
                - ORDER BY: sorting by the specified expression(s)/direction; aliases from SELECT are valid here.
                - LIMIT: restricts final returned row count to N.
                - SUBQUERY:
                A subquery is an independent SELECT query nested inside another query.
                Every subquery must create its own SUBQUERY execution step before the outer operation that consumes its result.

                Supported subquery locations:

                1. WHERE scalar comparison:

                Example:
                WHERE salary > (
                    SELECT AVG(salary)
                    FROM employees
                )

                Explanation must mention:
                - inner query executes first
                - aggregate/scalar result is produced
                - outer WHERE compares every outer row against that value


                2. WHERE IN:

                Example:
                WHERE dept_id IN (
                    SELECT id
                    FROM departments
                )

                Explanation must mention:
                - inner query returns a list/set of values
                - outer query checks membership against that result set


                3. WHERE NOT IN:

                Example:
                WHERE dept_id NOT IN (
                    SELECT id
                    FROM departments
                )

                Explanation must mention:
                - inner query creates exclusion set
                - outer rows matching those values are removed


                4. EXISTS:

                Example:

                WHERE EXISTS(
                    SELECT 1
                    FROM departments d
                    WHERE d.id=e.dept_id
                )

                Explanation must mention:
                - subquery checks whether at least one matching row exists
                - correlated reference to outer query must be named


                5. NOT EXISTS:

                Explanation must mention:
                - rows survive only when the subquery returns no matching rows


                6. FROM derived table:

                Example:

                FROM (
                    SELECT department_id, AVG(salary)
                    FROM employees
                    GROUP BY department_id
                ) temp


                Explanation must mention:
                - inner query creates a temporary derived table
                - outer query reads this temporary result as a table source

                If the derived table's own inner query has its own FROM/WHERE/GROUP
                BY/AGGREGATE/SELECT, those inner operations conceptually complete first,
                in their own normal canonical order, before the derived result is handed to
                the outer FROM — e.g. inner FROM -> inner GROUP BY -> inner AGGREGATE ->
                inner SELECT -> derived table result -> outer FROM -> outer WHERE. The
                derived table is never treated as if it were a plain pre-existing base
                table; its explanation must say its rows were produced by the inner query,
                not simply "read from" a table.


                7. SELECT expression subquery:

                Example:

                SELECT
                name,
                (
                 SELECT COUNT(*)
                 FROM orders
                 WHERE orders.employee_id=e.id
                )

                Explanation must mention:
                - subquery calculates a value for each outer row
                - correlated subqueries execute using the current outer row


                8. HAVING subquery:

                Example:

                HAVING COUNT(*) >
                (
                 SELECT AVG(total)
                 FROM department_stats
                )

                Explanation must mention:
                - grouped result is produced first
                - subquery result is then used to filter groups


                9. ORDER BY subquery:

                Example:

                ORDER BY
                (
                 SELECT COUNT(*)
                 FROM orders
                )

                Explanation must mention:
                - subquery produces sorting value
                - final rows are ordered using that value


                CORRELATED VS UNCORRELATED:

                Uncorrelated subquery:
                - Does not reference outer query columns.
                - Executes once.
                - Same result is reused for all outer rows.

                Example:

                SELECT *
                FROM employees
                WHERE salary >
                (
                 SELECT AVG(salary)
                 FROM employees
                );


                Correlated subquery:
                - References outer query alias/table.
                - Executes once for every outer row.

                Example:

                SELECT *
                FROM employees e
                WHERE EXISTS(
                 SELECT 1
                 FROM departments d
                 WHERE d.id=e.dept_id
                );


                Mention the outer column dependency explicitly.

                DEEPLY CORRELATED (MULTI-LEVEL) SUBQUERIES: a subquery can reference a column
                from ANY ancestor query block, not only its immediate parent — e.g. the
                deepest subquery in a 3-level nest can reference the outermost query's alias,
                skipping the middle level entirely. For every column reference inside a
                subquery: (1) identify the alias that owns the column, (2) identify which
                query block defines that alias, (3) classify that block as the current block,
                the immediate parent, or a more distant ancestor. If it is the immediate
                parent OR any more distant ancestor, the subquery is correlated — never
                classify a subquery as uncorrelated merely because the referenced outer alias
                is more than one nesting level away. The explanation must name the specific
                ancestor alias and column (e.g. "correlated to e.id, defined in the outermost
                query, two levels above this subquery").


                NESTED SUBQUERY RULE:

                Subqueries can contain other subqueries.

                Example:

                SELECT *
                FROM employees
                WHERE id IN
                (
                 SELECT employee_id
                 FROM orders
                 WHERE amount >
                 (
                    SELECT AVG(amount)
                    FROM orders
                 )
                );


                Execution order:

                SUBQUERY level 2:
                    SELECT AVG(amount)
                    FROM orders

                SUBQUERY level 1:
                    SELECT employee_id
                    FROM orders
                    WHERE amount > level 2 result

                WHERE:
                    employees.id IN(level 1 result)


                Every nested subquery must get its own SUBQUERY step.

                Never merge nested subqueries into one step.

                For multiple subqueries:
                - execute deepest independent subqueries first
                - then parent subqueries
                - then outer query operation.

                GENERAL N-LEVEL TEMPLATE: for any chain of nested subqueries, however deep,
                the execution order is strictly innermost-first:
                Level N -> Level N-1 -> ... -> Level 2 -> Level 1 -> outer consumer.
                Never execute a parent-level subquery before every subquery it depends on
                (its own children) has already produced its result. Each level's SUBQUERY
                step must have its own distinct sql_fragment, explanation, input_columns,
                output_columns, and execution_order — this applies equally to nested
                (parent/child) subqueries and to independent sibling subqueries (see CORE
                RULES). Two nested SELECT statements are NEVER represented by one SUBQUERY
                step, even if one is trivial (e.g. "SELECT 1").


                SUBQUERY EXPLANATION FORMAT:

                Every SUBQUERY step explanation must contain:

                1. Input:
                   What table rows enter the subquery.

                2. Transformation:
                   Filtering, grouping, aggregation, or projection performed.

                3. Output:
                   Exact structure returned to the parent query.

                Bad:
                "The subquery calculates average salary."

                Good (illustrative FORMAT only — this prompt is never given real sample data, so never state a specific invented number like the one below unless it was actually provided to you; describe the calculation structurally instead):
                "The employees table rows enter the subquery. AVG(salary) is calculated over all rows, producing a single scalar value. The outer WHERE step consumes this single value for comparison."


                FRAGMENT NESTING RULE: when a subquery contains a nested child subquery, the
                parent subquery's sql_fragment is its COMPLETE text INCLUDING the nested
                child's text verbatim inside it (never truncate or summarize the child out of
                the parent fragment). The child's own SUBQUERY step then additionally gets its
                own sql_fragment equal to exactly its innermost SELECT...text, copied
                character-for-character from within that parent fragment. Never construct a
                shortened or reconstructed fragment for either level.

                SUBQUERY RESULT TYPE: classify every subquery's result as exactly one of
                SCALAR, SET, BOOLEAN, TABLE, or ROW, and make output_columns consistent with
                that type — never blend types:
                - SCALAR (a bare aggregate/expression compared with =,>,<, etc.): output_columns is the single expression, e.g. ["AVG(salary)"]. Never describe it as returning multiple rows.
                - SET (the right-hand side of IN / NOT IN): output_columns is the single selected column that forms the membership list, e.g. ["id"]. Never describe it as a single scalar.
                - BOOLEAN (EXISTS / NOT EXISTS): output_columns is exactly ["boolean existence result"] — EXISTS/NOT EXISTS NEVER returns the subquery's selected columns to the parent, even though the subquery text selects columns internally.
                - TABLE (FROM-derived table / CTE): output_columns lists every column of the derived result set, e.g. ["department_id","avg_salary"].
                - ROW (a correlated SELECT-expression subquery producing one value per outer row): output_columns is the single expression evaluated per outer row, e.g. ["COUNT(*)"], and the explanation must state it is recomputed once per outer row.

                SUBQUERY STEP OUTPUT:

                input_columns:
                - columns used inside subquery

                output_columns:
                - columns returned to parent query

                Examples:

                Scalar:
                output_columns:["AVG(salary)"]

                IN:
                output_columns:["id"]

                EXISTS:
                output_columns:["boolean existence result"]

                Derived table:
                output_columns:["department_id","avg_salary"]
                - CTE (WITH ... AS (...)):
                  Each named CTE is its own query block and gets its own step with
                  "clause": "CTE". If a query defines multiple CTEs, emit one CTE step per
                  CTE definition, in dependency order: a CTE that references an earlier CTE
                  in its own body must get a step AFTER that earlier CTE's step, regardless
                  of their textual definition order. Independent CTEs (no cross-reference)
                  keep their textual definition order. The main query's FROM/JOIN steps that
                  read a CTE come after all CTE steps that CTE (transitively) depends on.
                  A CTE name used in the outer FROM/JOIN behaves exactly like a normal table
                  name for alias-timing purposes — it is NOT subject to the SELECT-alias
                  restriction in rule 6, since it is a named result set, not a SELECT alias.
                  If the same CTE is referenced multiple times in the outer query (e.g. joined
                  to itself, or used in both FROM and a subquery), it still gets exactly ONE
                  CTE step — state in that step's explanation that its result is reused by
                  multiple consumers, and name them.
                  CTE step explanation must state, like SUBQUERY steps: (1) what the CTE body
                  reads, (2) what transformation it performs, (3) the exact row/column
                  structure it produces, (4) which downstream step(s) consume it.
                  If a CTE's own body contains a subquery (e.g. a WHERE-scalar subquery
                  inside the CTE definition), that subquery still gets its own separate
                  SUBQUERY step, but it is positioned immediately before the CTE step that
                  consumes it — never pulled out ahead of unrelated outer-query operations
                  that don't depend on the CTE at all.
                - UNION / UNION ALL:
                  Each SELECT branch is an independent query block. Give each branch its own
                  step(s) for its own internal clauses (its own FROM/JOIN/WHERE/etc., following
                  every other rule in this prompt as if it were a standalone query), in the
                  branches' left-to-right textual order. After the last branch's steps, emit
                  exactly one additional step with "clause": "UNION" whose explanation states:
                  (1) how many branches were combined, (2) whether UNION (dedupes identical
                  rows across ALL branches) or UNION ALL (keeps every row, no dedup) was used,
                  (3) the resulting combined row count description. If a trailing ORDER BY or
                  LIMIT applies to the combined UNION result (not to an individual branch), it
                  comes after the UNION step, following the normal canonical order. Never
                  represent a UNION as a JOIN, and never merge two branches' steps together.
                - WINDOW FUNCTION: operates on the rows that remain after filtering/grouping logic (WHERE/GROUP BY/HAVING) has run. Unlike GROUP BY, window functions do NOT collapse or reduce rows — they add a calculated column to each existing row while keeping every row intact. They are computed after HAVING and before the final SELECT projection completes, and their results are visible to ORDER BY.
                  Cardinality: emit one WINDOW FUNCTION step per distinct window function
                  expression in the SELECT list (e.g. ROW_NUMBER() OVER (...) and
                  SUM(amount) OVER (...) in the same query get two separate steps), in their
                  left-to-right order of appearance — never merge multiple window functions
                  into a single step, even if they share an identical PARTITION BY/ORDER BY.
                  The PARTITION BY and ORDER BY that appear INSIDE a window function's OVER(...)
                  are internal to that WINDOW FUNCTION step's own sql_fragment and explanation
                  — they must NEVER generate a separate top-level GROUP BY step or a separate
                  top-level ORDER BY step. Only an ORDER BY clause written at the outer query
                  level (outside any OVER(...)) produces an ORDER BY step.

                EXPLANATION QUALITY REQUIREMENT
                Every step's "explanation" must cover all three of: (1) what rows/data enter this step, (2) what transformation happens, (3) what rows/structure leave this step. Be specific to the actual query and its actual column/table names — never generic.

                NO-FABRICATION RULE (applies to every step, not just JOIN): this prompt gives you the SQL query text only — it does not give you real sample data or a real database schema. Never state specific row counts (e.g. "3 rows survive," "2 Sales rows"), specific column values, specific computed aggregate results, or a full column list for a table beyond the columns actually named in the query text. Describe the transformation logic concretely instead: which columns are involved, which condition is evaluated, which category of row is kept/dropped/produced, and why — without asserting a number or value you were not actually given. This applies with particular force to JOIN steps: never claim a JOIN "produced N rows," "matched no rows," or "removed all rows" — state the matching condition and what MySQL rule determines survival/NULL-padding for each row category, and leave the actual outcome as a property of whatever real data is eventually run through it, not a number you invent here. If real sample data or intermediate row values ARE explicitly provided to you elsewhere in this conversation, then and only then may you reference those actual values.

                Bad (generic, no specifics): "GROUP BY groups rows."
                Good (specific, covers in/transform/out, without inventing counts): "The filtered employees are separated into groups by their department_id value — every row sharing the same department_id is collected into one intermediate group, which is passed to aggregation."

                QUERY TO ANALYZE
                __ORIGINAL_QUERY__

                OUTPUT — respond with ONLY valid JSON, no markdown, no code fences, no commentary before or after. Exact schema:
                {
                  "success": true,
                  "query": "string",
                  "steps": [
                    {
                      "step_number": 1,
                      "clause": "FROM | JOIN | WHERE | GROUP BY | AGGREGATE | HAVING | WINDOW FUNCTION | SELECT | DISTINCT | ORDER BY | LIMIT | SUBQUERY | CTE | UNION",
                      "sql_fragment": "exact substring copied from the original query",
                      "execution_order": 1,
                      "explanation": "2-4 sentences, specific to this query's actual structure, no padding",
                      "input_columns": ["column_name"],
                      "output_columns": ["column_name"]
                    }
                  ],
                  "final_output_description": "Description of the final result returned by the query"
                }""";
        return template.replace("__ORIGINAL_QUERY__", originalQuery);
    }

    // -------------------------
    // SAMPLE DATA PROMPT
    // -------------------------
    // Generates raw source rows only — no filtering/joining/aggregating performed by the model.
    public static String buildSampleDataPrompt(String originalQuery, Map<String, java.util.List<String>> requiredColumnsByTable) {
        String requirementsBlock = "";
        if (requiredColumnsByTable != null && !requiredColumnsByTable.isEmpty()) {
            String lines = requiredColumnsByTable.entrySet().stream()
                    .map(e -> "- \"" + e.getKey() + "\" must include these exact columns: " + String.join(", ", e.getValue()))
                    .collect(Collectors.joining("\n"));
            requirementsBlock = "\nREQUIRED COLUMNS (mandatory — the query cannot be demonstrated without them):\n" + lines + "\n";
        }

        String template = """
                Generate realistic MySQL sample data so the query below can be visualized step by step. Return raw source rows only — do NOT pre-compute filters, joins, groups, or aggregates yourself.

                SILENT ANALYSIS (internal reasoning only — do not output it)
                Identify every table, every join's exact type and key columns, any WHERE/HAVING thresholds, and any GROUP BY/aggregate. The rows you invent must make each of these conditions genuinely testable once the engine executes — e.g. if demonstrating an INNER JOIN, remember an unmatched row will be DROPPED from the final joined output; that's expected, not an error.

                OUTPUT SHAPE
                Return a JSON OBJECT keyed by table name: {"table_name": [ {row}, {row} ]}. Never a flat array.

                ROW RULES
                1. 3-6 rows per table by default (exactly 6 if only one table is involved). Scale up only if a query threshold (e.g. HAVING COUNT(*) > 5, or a wide WHERE range) requires more rows to be satisfiable — then generate enough to meet it.
                2. Do NOT assume every table has a column called "id". Only include an identity column (of whatever name) if it is actually referenced by the query — in SELECT, WHERE, JOIN ON/USING, GROUP BY, HAVING, ORDER BY, or as a correlation key — or is genuinely required for a JOIN/correlation relationship the query defines. Every foreign-key/join column you generate must reference the EXACT column name used on the parent side of the query's actual JOIN/correlation condition (e.g. if the query joins ON e.department_id = d.department_id, the parent table's key is department_id, never silently renamed to or assumed to be "id"). If the query happens to use "id" as a key, use it; otherwise do not invent it.
                3. Include every column referenced anywhere in the query (SELECT, WHERE, JOIN ON/USING, GROUP BY, HAVING, ORDER BY, DISTINCT, aggregates, window functions). Do not invent columns the query never references.
                4. Use realistic values (real-sounding names, dates, numbers) — never placeholders like "value1", "row1", "test".
                5. If the query has an aggregate function (with or without GROUP BY), the aggregated numeric column must have genuinely varied, non-trivial values so the computed result is meaningful.

                NO-NULL RULE (strict)
                Sample data represents raw, already-existing database tables only — it must never contain NULLs that only exist because a JOIN produced them. Never set a table's own identity/foreign-key column, or a descriptive column that is a row's main reason for existing (e.g. department_name on a departments row), to null. To demonstrate an unmatched join row, give it a concrete foreign-key value that simply does not exist in the parent table (e.g. department_id: 20 when departments only has ids 5 and 10) — this missing relationship is what lets JOIN execution produce NULL-padded output later; never pre-place that NULL in the source table yourself. Null is only acceptable on a genuinely optional, non-identity, non-join, non-descriptive column that the query never references at all.

                DEMONSTRATION COVERAGE (apply only what's relevant to this query)
                - WHERE present -> at least one row passes, at least one fails.
                - JOIN present -> at least one matching pair AND at least one unmatched row on the relevant side(s):
                  - INNER JOIN: unmatched rows on either side (they'll be dropped after execution — that's the point).
                  - LEFT JOIN: at least one left row with no right-side match.
                  - RIGHT JOIN: at least one right row with no left-side match.
                  - FULL JOIN: an unmatched row on both sides plus a matching pair.
                  - CROSS JOIN / comma-join with no condition: keep both tables small (2-3 rows) so the full Cartesian product is easy to enumerate.
                  - SELF JOIN: at least one row's key references another row's id in the same table, plus one row with no self-match (concrete non-existent id, never null).
                  - NATURAL JOIN: shared-name columns should have some overlapping and some non-overlapping values (via concrete different values, never null).
                - GROUP BY present -> generate at least two distinct groups, each with meaningful rows, such that different groups produce visibly different aggregate results (e.g. Sales: 60000, 70000 vs HR: 40000, 50000 — not near-identical values across groups).
                - Aggregate functions present, tailored per function:
                  - COUNT: give groups different row counts where possible, so counts differ visibly across groups.
                  - COUNT(specific_column) (not COUNT(*)): if that column is not an identity column, not a join/foreign-key column, and not the row's sole descriptive reason for existing (i.e. it qualifies under the NO-NULL RULE's narrow exception), include a NULL in that column for at least one row in a group that has 2+ rows, so COUNT(column) visibly differs from COUNT(*) for that group. If the column does NOT qualify for the exception, do not force a NULL — instead just ensure the values are realistic and non-trivial.
                  - SUM/AVG: numeric values must vary meaningfully within and across groups so sums/averages are not trivially equal.
                  - MIN/MAX: include enough spread within each group that MIN and MAX are clearly different from each other and from other groups' MIN/MAX.
                  - COUNT(DISTINCT column) / SUM(DISTINCT column) present -> include at least one duplicate value in that specific column within a group that has 2+ rows, so the DISTINCT-counted/summed result is visibly different from the non-DISTINCT version.
                - HAVING present -> at least one group is removed, at least one survives.
                - DISTINCT present -> include actual duplicate rows to remove.
                - ORDER BY present -> generate unsorted input so ordering visibly changes it.
                - LIMIT present -> generate more rows than the limit returns.
                - WINDOW FUNCTION present -> generate enough rows to make the window function's behavior visible: if PARTITION BY is used, include at least two distinct partitions with 2+ rows each so ranking/aggregation clearly differs per partition; if an ORDER BY exists inside OVER(...), give that column varied, non-sequential values so ranking order isn't trivial; row count before and after the window step stays identical (window functions never drop or add rows).
                - SUBQUERY present -> generate data so the subquery result actually affects the outer query. For a chain of nested subqueries, the ENTIRE chain must be meaningful, not only the deepest level: (1) the deepest subquery must receive valid input and produce a genuinely meaningful (non-degenerate) result, (2) each parent subquery must actually consume that result and, in turn, produce its own meaningful result, (3) the outermost query must consume the top-level subquery's result, (4) the final result should contain at least one surviving row whenever the query's SQL semantics allow it. Do not generate data where only the innermost subquery is well-formed while an intermediate level accidentally becomes empty or trivial (e.g. always empty, always all rows) unless the query's own logic forces that outcome.

                SUBQUERY DATA RULES:

                Scalar subquery:
                - Ensure aggregate values produce meaningful comparisons.
                Example:
                salary > AVG(salary)
                must have some rows above and below average.

                IN / NOT IN subquery:
                - Subquery returned values must match some outer table values.
                - Generate at least one matching and one non-matching outer row.

                Example:

                departments:
                id
                1 Mumbai
                2 Delhi

                employees:
                dept_id
                1
                3

                Result:
                employee with dept_id 1 survives.
                employee with dept_id 3 is removed.


                EXISTS / NOT EXISTS:
                - Generate at least one row where the correlation condition succeeds.
                - Generate at least one row where it fails.


                Correlated subquery:
                - Outer table values referenced by the subquery must exist.
                - Ensure multiple outer rows produce different subquery results where possible.
                - For correlation spanning more than one nesting level (a deep subquery referencing an alias from a distant ancestor, not just its immediate parent), the referenced ancestor value must be genuinely resolvable at every level in between, and different outer rows should be able to produce different resolved values where the query logic allows — do not make every correlated lookup collapse to the same result unless the data realistically causes that.


                Nested subquery:
                - Every inner subquery must return data that affects its parent query.
                - Never generate empty intermediate results unless the SQL logic naturally produces them.

                __REQUIREMENTS_BLOCK__
                QUERY:
                __ORIGINAL_QUERY__

                Respond ONLY with valid JSON, no markdown, no code fences, no commentary. Exact schema (the "id"/"table_1_id" column names below are illustrative only — use the actual key/column names the query itself uses, per ROW RULES #2):
                {
                  "sample_data": {
                    "table_name_1": [ { "id": 1, "column1": "value" } ],
                    "table_name_2": [ { "id": 1, "table_1_id": 1, "column2": "value" } ]
                  }
                }""";
        return template
                .replace("__REQUIREMENTS_BLOCK__", requirementsBlock)
                .replace("__ORIGINAL_QUERY__", originalQuery);
    }

    // -------------------------
    // SYNTAX ERROR PROMPT
    // -------------------------
    public static String buildSyntaxErrorPrompt(String originalQuery, String dbErrorMessage) {
        String errorMessage = (dbErrorMessage == null || dbErrorMessage.isBlank())
                ? "(no raw error message provided — infer the syntax problem yourself by analyzing the query text)"
                : dbErrorMessage;

        String template = """
                ROLE
                You are a MySQL 8.0 syntax debugger. The query below failed to execute. Explain the error clearly and specifically to this query — never give a generic "here's how SQL syntax works" explanation.

                QUERY THAT FAILED
                __ORIGINAL_QUERY__

                RAW DATABASE ERROR (if available, may be empty)
                __DB_ERROR_MESSAGE__

                CORE RULES
                1. Identify the SINGLE most likely root cause of the failure. If multiple issues exist, report the one that would surface first when MySQL parses the query left-to-right, but you may briefly mention other problems you notice as "additional issues" separate from the primary one.
                2. Quote the EXACT offending fragment as it appears in the query (verbatim substring) — never paraphrase the broken SQL itself.
                3. State the approximate location: near which clause/keyword, and if possible which line/character region, based on the query text given.
                4. Explain WHY MySQL rejects it — the grammar rule being violated (e.g. missing comma between column expressions, unmatched parenthesis, keyword used out of order, reserved word used unquoted as identifier, ambiguous column reference, GROUP BY/aggregate mismatch, invalid comparison of a subquery returning multiple rows to a scalar, etc.).
                5. Do NOT just restate the raw MySQL error text back — translate it into a plain-language explanation a learner can understand. If a raw error message was provided, use it as a grounding signal, not as the explanation itself.
                6. Provide a corrected version of the query (or the corrected fragment plus instructions for where it goes) that would fix this specific problem. Do not silently change the query's intent/logic beyond what's needed to fix the syntax.
                7. If the query actually looks syntactically valid to you and you cannot identify a real problem, say so plainly instead of inventing an error — do not fabricate a fault to force an answer.
                8. Never invent a raw database error message if none was given — only reference dbErrorMessage content if it was actually provided above.
                9. Keep the explanation grounded only in the query text given; do not assume a schema or real data you were not given.

                OUTPUT — respond with ONLY valid JSON, no markdown, no code fences, no commentary before or after. Exact schema:
                {
                  "success": true,
                  "has_error": true,
                  "error_type": "short category, e.g. 'missing comma' | 'unmatched parenthesis' | 'invalid keyword order' | 'reserved word conflict' | 'ambiguous column' | 'other'",
                  "offending_fragment": "exact substring from the query where the error occurs",
                  "location_hint": "e.g. 'inside the SELECT list, between the 2nd and 3rd columns'",
                  "explanation": "2-5 plain-language sentences: what's wrong, why MySQL rejects it, specific to this query",
                  "suggested_fix": "the corrected query, or corrected fragment with clear placement instructions",
                  "additional_issues": ["optional array of other minor issues spotted, empty array if none"]
                }

                If no real error is found, use this schema instead:
                {
                  "success": true,
                  "has_error": false,
                  "explanation": "why this query appears syntactically valid"
                }""";
        return template
                .replace("__ORIGINAL_QUERY__", originalQuery)
                .replace("__DB_ERROR_MESSAGE__", errorMessage);
    }

    // -------------------------
    // JSON VALIDATION PROMPT
    // -------------------------
    // Cheap corrective pass over the steps output — mainly useful for smaller local
    // models (Qwen2.5 / Llama / Mistral) that are more prone to near-miss JSON or
    // broken execution_order/step_number sequencing.
    public static String buildValidationPrompt(String candidateJson, String originalQuery) {
        String template = """
                Validate and, if needed, fix this JSON so it exactly satisfies the schema and rules below. Do not re-derive SQL logic from scratch — only correct structural or ordering violations in what's given.

                CHECKS
                1. Output is valid JSON — no markdown fences, no commentary.
                2. steps[].step_number matches its array index (1-based) exactly.
                3. execution_order is continuous starting at 1 — no gaps, no duplicates, no reordering relative to actual clause position.
                4. No step exists for a clause absent from the query below.
                5. Every JOIN in the query has exactly one corresponding step, in left-to-right order, with "clause" equal to "JOIN".
                6. If the query is NOT a UNION/UNION ALL, exactly one SELECT step is present. If the query IS a UNION/UNION ALL, exactly one SELECT step is present PER BRANCH (so a 2-branch UNION has exactly 2 SELECT steps total, one per branch), plus exactly one additional "clause":"UNION" step combining them — do not collapse this to a single global SELECT step and do not flag the multiple per-branch SELECT steps as an error.
                7. sql_fragment values are verbatim substrings of the query below.
                8. GROUP BY: if the query contains GROUP BY, a GROUP BY step must exist, it must appear before any AGGREGATE step, and it must never be merged into or replaced by the SELECT step.
                9. AGGREGATE: if the query contains COUNT/SUM/AVG/MIN/MAX, an AGGREGATE step must exist. If the query also has GROUP BY, the AGGREGATE step's explanation must reference the grouping column(s) alongside the aggregate value(s) — not aggregate values alone. If the query has no GROUP BY, the AGGREGATE step's explanation must describe exactly one summary result row, not per-row or per-group results.
                10. Full relative order check — confirm steps (where present) appear in this sequence, IGNORING any interspersed SUBQUERY/CTE/UNION steps when checking adjacency (those are validated separately by check 14): FROM/JOIN, then WHERE, then GROUP BY, then AGGREGATE, then HAVING, then WINDOW FUNCTION, then SELECT, then DISTINCT, then ORDER BY, then LIMIT. Do not relocate a correctly-placed SUBQUERY/CTE/UNION step just to make this sequence look contiguous.
                11. SUBQUERY validation:
                - Every subquery in the SQL must create a SUBQUERY step.
                - Nested subqueries must create multiple SUBQUERY steps.
                - SUBQUERY steps must appear before the clause consuming their result.
                - Do not merge multiple subqueries into one step.
                - Scalar, IN, EXISTS, NOT EXISTS, FROM-derived, HAVING and ORDER BY subqueries must all be recognized.
                - EXACT COUNT CHECK: independently count every nested SELECT in the original query below (every SELECT keyword that opens a query block other than the single outermost one — this includes every level of nesting, every sibling, and every subquery inside a CTE body, but excludes the outermost SELECT itself and excludes each UNION branch's own top-level SELECT, which are counted under check 6 instead). The number of SUBQUERY-clause steps in the candidate JSON must equal this count exactly. If the counts differ, add missing SUBQUERY steps or remove extras until they match — do not merely note the mismatch.

                12. Correlated subquery validation:
                - If a subquery references an outer table alias, explanation must mention correlation and the outer column dependency.

                13. SUBQUERY sql_fragment must be copied exactly from the original query.
                14. Subquery placement matches its consumer, not just its presence: a SUBQUERY
                    step feeding WHERE/FROM appears before that clause's step; a SUBQUERY step
                    feeding HAVING appears after both the GROUP BY step and the AGGREGATE step
                    (when present) and before HAVING; a SUBQUERY step feeding ORDER BY appears
                    after SELECT/DISTINCT and before ORDER BY; a SUBQUERY step feeding a
                    SELECT-list expression appears after WHERE/GROUP BY/HAVING (whichever are
                    present) and before the SELECT step. If any SUBQUERY step is out of this
                    position relative to its actual consumer, move it — do not just flag it.
                15. Independent sibling subqueries attached to the same consumer clause are
                    ordered by their left-to-right textual appearance in the query.
                16. If the query defines one or more CTEs, each CTE has exactly one step with
                    "clause":"CTE", CTEs that depend on earlier CTEs appear after them, and
                    the outer query's FROM/JOIN steps reading a CTE appear after all CTE steps
                    it depends on.
                17. If the query is a UNION/UNION ALL, each branch's own steps appear in
                    branch order, followed by exactly one "clause":"UNION" step; no branch's
                    steps are merged with another branch's, and no branch is itself mislabeled
                    as a JOIN.
                18. If the query contains a window function, verify one WINDOW FUNCTION step
                    exists per distinct window function expression (not one combined step for
                    several), and that no extra GROUP BY or ORDER BY step was fabricated from
                    the PARTITION BY / ORDER BY that live inside an OVER(...) clause.
                19. JOIN step input_columns contains only columns from that JOIN's ON/USING
                    condition; output_columns contains the full carried-forward column set
                    (table-qualified on collision, deduped once for USING).
                20. No step has "clause":"SUBQUERY" that actually corresponds to the outermost
                    query block itself.

                QUERY:
                __ORIGINAL_QUERY__

                CANDIDATE JSON:
                __CANDIDATE_JSON__

                Output ONLY the corrected JSON (same schema as the candidate), or the candidate unchanged if it already passes every check. No commentary, no markdown.""";
        return template
                .replace("__ORIGINAL_QUERY__", originalQuery)
                .replace("__CANDIDATE_JSON__", candidateJson);
    }
}