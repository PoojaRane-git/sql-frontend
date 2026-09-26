import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import CytoscapeComponent from "react-cytoscapejs";
import api from "../services/api";

import {
    ArrowLeft,
    Database,
    Filter,
    GitBranch,
    Hash,
    List,
    Maximize2,
    RotateCcw,
    Table2,
    Target,
    Workflow,
    Link2,
    Check,
} from "lucide-react";

/* =========================================================
   BASIC HELPERS
========================================================= */

const normalizeOperation = (operation = "") => {
    const value = String(operation).trim().toUpperCase();

    if (value.includes("OPTIONAL MATCH")) return "OPTIONAL MATCH";
    if (value === "MATCH" || value.includes("MATCH")) return "MATCH";
    if (value.includes("JOIN")) return "JOIN";
    if (value.includes("WHERE")) return "WHERE";
    if (value.includes("WITH")) return "WITH";
    if (value.includes("GROUP")) return "GROUP BY";

    if (
        ["COUNT", "SUM", "AVG", "MIN", "MAX", "COLLECT", "AGGREG"].some((k) =>
            value.includes(k)
        )
    ) {
        return "AGGREGATE";
    }

    if (value.includes("HAVING")) return "HAVING";
    if (value.includes("RETURN")) return "RETURN";
    if (value.includes("ORDER")) return "ORDER BY";
    if (value.includes("SKIP")) return "SKIP";
    if (value.includes("LIMIT")) return "LIMIT";
    if (value.includes("UNION")) return "UNION";

    return value || "STEP";
};

const getOperationIcon = (operation) => {
    switch (normalizeOperation(operation)) {
        case "MATCH":
        case "OPTIONAL MATCH":
            return GitBranch;

        case "JOIN":
            return Link2;

        case "WHERE":
        case "HAVING":
            return Filter;

        case "GROUP BY":
        case "AGGREGATE":
            return Hash;

        case "RETURN":
        case "WITH":
            return List;

        case "ORDER BY":
            return Workflow;

        case "LIMIT":
        case "SKIP":
            return Target;

        default:
            return Database;
    }
};

const getOperationStyle = (operation, selected) => {
    const op = normalizeOperation(operation);

    if (selected) {
        return "border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-200";
    }

    switch (op) {
        case "MATCH":
        case "OPTIONAL MATCH":
            return "border-violet-200 bg-white";

        case "JOIN":
            return "border-cyan-200 bg-white";

        case "WHERE":
            return "border-amber-200 bg-white";

        case "GROUP BY":
        case "AGGREGATE":
            return "border-emerald-200 bg-white";

        case "HAVING":
            return "border-orange-200 bg-white";

        case "RETURN":
            return "border-sky-200 bg-white";

        case "ORDER BY":
            return "border-indigo-200 bg-white";

        case "LIMIT":
        case "SKIP":
            return "border-rose-200 bg-white";

        default:
            return "border-slate-200 bg-white";
    }
};

/* =========================================================
   HIGHLIGHT HELPERS
   ONLY NEW FUNCTIONALITY
========================================================= */

const escapeHtml = (value = "") =>
    String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

const getCypherHighlightFragment = (step, query) => {
    if (!step || !query) return "";

    const operation = normalizeOperation(step.operation);

    switch (operation) {
        case "MATCH":
        case "OPTIONAL MATCH":
            return (
                query.match(
                    /\b(?:OPTIONAL\s+)?MATCH\s+[\s\S]*?(?=\bWHERE\b|\bWITH\b|\bRETURN\b|\bORDER\s+BY\b|\bSKIP\b|\bLIMIT\b|$)/i
                )?.[0] || ""
            );

        case "JOIN":
            return (
                step.cypher?.trim() ||
                query.match(
                    /\([^)]+\)\s*-\s*\[[^\]]*\]\s*->\s*\([^)]+\)/i
                )?.[0] ||
                ""
            );

        case "WHERE":
            return (
                query.match(
                    /\bWHERE\s+[\s\S]*?(?=\bWITH\b|\bRETURN\b|\bORDER\s+BY\b|\bSKIP\b|\bLIMIT\b|$)/i
                )?.[0] || ""
            );

        case "WITH":
            return (
                query.match(
                    /\bWITH\s+[\s\S]*?(?=\bWHERE\b|\bRETURN\b|\bORDER\s+BY\b|\bSKIP\b|\bLIMIT\b|$)/i
                )?.[0] || ""
            );

        case "RETURN":
            return (
                query.match(
                    /\bRETURN\s+[\s\S]*?(?=\bORDER\s+BY\b|\bSKIP\b|\bLIMIT\b|$)/i
                )?.[0] || ""
            );

        case "ORDER BY":
            return (
                query.match(
                    /\bORDER\s+BY\s+[\s\S]*?(?=\bSKIP\b|\bLIMIT\b|$)/i
                )?.[0] || ""
            );

        case "SKIP":
            return query.match(/\bSKIP\s+\d+/i)?.[0] || "";

        case "LIMIT":
            return query.match(/\bLIMIT\s+\d+/i)?.[0] || "";

        default:
            return step.cypher?.trim() || "";
    }
};

const getSqlHighlightFragment = (step, sql) => {
    if (!step || !sql) return "";

    const operation = normalizeOperation(step.operation);

    switch (operation) {
        case "MATCH":
            return (
                sql.match(
                    /\bFROM\b[\s\S]*?(?=\bWHERE\b|\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i
                )?.[0] || ""
            );

        case "JOIN":
            return (
                step.sql?.trim() &&
                    step.sql.trim().toUpperCase() !== "N/A"
                    ? step.sql.trim()
                    : sql.match(
                        /\bJOIN\b[\s\S]*?(?=\bJOIN\b|\bWHERE\b|\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i
                    )?.[0] || ""
            );

        case "WHERE":
            return (
                sql.match(
                    /\bWHERE\b[\s\S]*?(?=\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i
                )?.[0] || ""
            );

        case "GROUP BY":
            return (
                sql.match(
                    /\bGROUP\s+BY\b[\s\S]*?(?=\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i
                )?.[0] || ""
            );

        case "HAVING":
            return (
                sql.match(
                    /\bHAVING\b[\s\S]*?(?=\bORDER\s+BY\b|\bLIMIT\b|$)/i
                )?.[0] || ""
            );

        case "RETURN":
            return (
                sql.match(/\bSELECT\b[\s\S]*?(?=\bFROM\b|$)/i)?.[0] || ""
            );

        case "ORDER BY":
            return (
                sql.match(
                    /\bORDER\s+BY\b[\s\S]*?(?=\bLIMIT\b|$)/i
                )?.[0] || ""
            );

        case "SKIP":
            return sql.match(/\b(?:OFFSET|SKIP)\s+\d+/i)?.[0] || "";

        case "LIMIT":
            return sql.match(/\bLIMIT\s+\d+/i)?.[0] || "";

        default:
            return step.sql?.trim() || "";
    }
};

const highlightText = (fullText, fragment) => {
    if (!fullText) return "";

    if (!fragment) {
        return escapeHtml(fullText);
    }

    const startIndex = fullText
        .toLowerCase()
        .indexOf(fragment.toLowerCase());

    if (startIndex === -1) {
        return escapeHtml(fullText);
    }

    const endIndex = startIndex + fragment.length;

    return (
        escapeHtml(fullText.slice(0, startIndex)) +
        `<mark class="neo4j-code-highlight">${escapeHtml(
            fullText.slice(startIndex, endIndex)
        )}</mark>` +
        escapeHtml(fullText.slice(endIndex))
    );
};

/* =========================================================
   CYPHER GRAPH EXTRACTION
========================================================= */

const extractGraphFromCypher = (cypher = "") => {
    const nodes = [];
    const edges = [];
    const nodeMap = new Map();

    const nodeRegex =
        /\(\s*([A-Za-z_][A-Za-z0-9_]*)?\s*(?::\s*([A-Za-z_][A-Za-z0-9_]*))?[^)]*\)/g;

    let match;

    while ((match = nodeRegex.exec(cypher)) !== null) {
        const variable = match[1] || `node${nodes.length + 1}`;
        const label = match[2] || variable;

        if (!nodeMap.has(variable)) {
            nodeMap.set(variable, { variable, label });

            nodes.push({
                data: {
                    id: variable,
                    label,
                    variable,
                },
            });
        }
    }

    const relRegex =
        /\(\s*([A-Za-z_][A-Za-z0-9_]*)[^)]*\)\s*(<?-+)\s*\[\s*(?::\s*([A-Za-z_][A-Za-z0-9_]*))?[^\]]*\]\s*(->|-|<-)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)[^)]*\)/g;

    let edgeIndex = 0;

    while ((match = relRegex.exec(cypher)) !== null) {
        const source = match[1];
        const relationship = match[3] || "RELATES_TO";
        const direction = match[4];
        const target = match[5];

        if (!nodeMap.has(source) || !nodeMap.has(target)) continue;

        let finalSource = source;
        let finalTarget = target;

        if (direction === "<-") {
            finalSource = target;
            finalTarget = source;
        }

        edges.push({
            data: {
                id: `edge-${edgeIndex++}`,
                source: finalSource,
                target: finalTarget,
                label: relationship,
                relationship,
            },
        });
    }

    return { nodes, edges };
};

/* =========================================================
   SAMPLE DATA
========================================================= */

const normalizeSampleData = (sampleData) => {
    if (!sampleData) return {};

    if (typeof sampleData === "object") {
        return sampleData.tables || sampleData;
    }

    if (typeof sampleData === "string") {
        let value = sampleData;

        for (let i = 0; i < 2 && typeof value === "string"; i++) {
            try {
                value = JSON.parse(value);
            } catch {
                break;
            }
        }

        if (!value || typeof value !== "object") return {};

        return value.tables || value;
    }

    return {};
};

/* =========================================================
   VALUE HELPERS
========================================================= */

const normalizeKey = (value = "") =>
    String(value)
        .trim()
        .replace(/[`"'[\]]/g, "")
        .toLowerCase();

const cleanIdentifier = (value = "") =>
    String(value)
        .trim()
        .replace(/[`"'[\]]/g, "")
        .replace(/;$/, "");

const toNumberIfPossible = (value) => {
    if (typeof value === "number") return value;

    if (
        typeof value === "string" &&
        value.trim() !== "" &&
        /^-?\d+(\.\d+)?$/.test(value.trim())
    ) {
        return Number(value);
    }

    return value;
};

const valuesEqual = (a, b) => {
    const na = toNumberIfPossible(a);
    const nb = toNumberIfPossible(b);

    if (typeof na === "number" && typeof nb === "number") {
        return na === nb;
    }

    return normalizeKey(na) === normalizeKey(nb);
};

const compareValues = (a, b) => {
    const na = toNumberIfPossible(a);
    const nb = toNumberIfPossible(b);

    if (typeof na === "number" && typeof nb === "number") {
        return na - nb;
    }

    return String(na ?? "").localeCompare(String(nb ?? ""));
};

/* =========================================================
   ROW / SCHEMA HELPERS
========================================================= */

const getRowValue = (row, expression) => {
    if (!row) return undefined;

    const clean = cleanIdentifier(expression);

    if (Object.prototype.hasOwnProperty.call(row, clean)) {
        return row[clean];
    }

    const wanted = normalizeKey(clean);

    const qualifiedKey = Object.keys(row).find(
        (key) => normalizeKey(key) === wanted
    );

    if (qualifiedKey) return row[qualifiedKey];

    if (!clean.includes(".")) {
        const bare = clean.split(".").pop();

        if (Object.prototype.hasOwnProperty.call(row, bare)) {
            return row[bare];
        }
    }

    const suffixKey = Object.keys(row).find(
        (key) =>
            normalizeKey(key).endsWith(`.${wanted}`) ||
            normalizeKey(key).endsWith(`_${wanted}`)
    );

    return suffixKey ? row[suffixKey] : undefined;
};

const getTableRows = (tables, tableName) => {
    if (!tables) return [];

    const wanted = normalizeKey(tableName);

    const key = Object.keys(tables).find(
        (name) => normalizeKey(name) === wanted
    );

    if (!key) return [];

    return Array.isArray(tables[key]) ? tables[key] : [];
};

const qualifyRow = (row, table, alias) => {
    const result = {
        __table: table,
        __alias: alias || table,
    };

    Object.entries(row || {}).forEach(([column, value]) => {
        result[column] = value;
        result[`${alias || table}.${column}`] = value;
        result[`${table}.${column}`] = value;
    });

    return result;
};

/* =========================================================
   SQL TABLE / JOIN PARSER
========================================================= */

const extractSqlTables = (sql = "") => {
    const tables = [];

    const regex =
        /\b(?:FROM|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|LEFT\s+OUTER\s+JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?/gi;

    let match;

    while ((match = regex.exec(sql)) !== null) {
        const table = cleanIdentifier(match[1]);
        const alias = cleanIdentifier(match[2] || "");

        if (
            [
                "WHERE",
                "JOIN",
                "ON",
                "GROUP",
                "ORDER",
                "LIMIT",
                "HAVING",
                "LEFT",
                "RIGHT",
                "INNER",
                "OUTER",
            ].includes(alias.toUpperCase())
        ) {
            continue;
        }

        if (
            !tables.some(
                (item) => normalizeKey(item.table) === normalizeKey(table)
            )
        ) {
            tables.push({ table, alias });
        }
    }

    return tables;
};

const extractSqlJoins = (sql = "") => {
    const joins = [];

    const regex =
        /\b(?:JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|LEFT\s+OUTER\s+JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?\s+ON\s+([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*([A-Za-z_][A-Za-z0-9_.]*)/gi;

    let match;

    while ((match = regex.exec(sql)) !== null) {
        joins.push({
            table: match[1],
            alias: match[2] || match[1],
            left: match[3],
            right: match[4],
        });
    }

    return joins;
};

const createBaseRows = (tables, sql) => {
    const sqlTables = extractSqlTables(sql);

    if (sqlTables.length === 0) return [];

    const first = sqlTables[0];

    let result = getTableRows(tables, first.table).map((row) =>
        qualifyRow(row, first.table, first.alias)
    );

    const joins = extractSqlJoins(sql);

    for (const join of joins) {
        const joinRows = getTableRows(tables, join.table);

        if (joinRows.length === 0) continue;

        const joined = [];

        for (const currentRow of result) {
            for (const rawJoinRow of joinRows) {
                const qualifiedJoin = qualifyRow(
                    rawJoinRow,
                    join.table,
                    join.alias
                );

                const leftValue = getRowValue(currentRow, join.left);
                const rightValue = getRowValue(qualifiedJoin, join.right);

                const reverseLeft = getRowValue(currentRow, join.right);
                const reverseRight = getRowValue(
                    qualifiedJoin,
                    join.left
                );

                if (
                    valuesEqual(leftValue, rightValue) ||
                    valuesEqual(reverseLeft, reverseRight)
                ) {
                    joined.push({
                        ...currentRow,
                        ...qualifiedJoin,
                    });
                }
            }
        }

        result = joined;
    }

    return result;
};

/* =========================================================
   CYPHER VARIABLE MAP
========================================================= */

const extractCypherVariableMap = (query = "") => {
    const map = {};

    const regex =
        /\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/g;

    let match;

    while ((match = regex.exec(query)) !== null) {
        map[match[1]] = match[2];
    }

    return map;
};

/* =========================================================
   WHERE / HAVING EVALUATION
========================================================= */

const resolveExpressionValue = (row, expression) => {
    const clean = expression.trim();

    const quoted = clean.match(/^(['"])(.*?)\1$/);

    if (quoted) return quoted[2];

    if (/^-?\d+(\.\d+)?$/.test(clean)) {
        return Number(clean);
    }

    if (/^(TRUE|FALSE)$/i.test(clean)) {
        return clean.toUpperCase() === "TRUE";
    }

    return getRowValue(row, clean);
};

const evaluateCondition = (row, condition) => {
    if (!condition) return true;

    let expression = condition
        .replace(/\s+/g, " ")
        .trim()
        .replace(/;$/, "");

    expression = expression.replace(/^\((.*)\)$/, "$1").trim();

    const andParts = expression.split(/\s+AND\s+/i);

    if (andParts.length > 1) {
        return andParts.every((part) => evaluateCondition(row, part));
    }

    const orParts = expression.split(/\s+OR\s+/i);

    if (orParts.length > 1) {
        return orParts.some((part) => evaluateCondition(row, part));
    }

    const isNullMatch = expression.match(
        /^(.+?)\s+IS\s+(NOT\s+)?NULL$/i
    );

    if (isNullMatch) {
        const value = resolveExpressionValue(row, isNullMatch[1]);

        return isNullMatch[2]
            ? value !== null && value !== undefined
            : value === null || value === undefined;
    }

    const inMatch = expression.match(
        /^(.+?)\s+(NOT\s+)?IN\s*\((.*?)\)$/i
    );

    if (inMatch) {
        const left = resolveExpressionValue(row, inMatch[1]);

        const values = inMatch[3]
            .split(",")
            .map((value) => resolveExpressionValue(row, value));

        const found = values.some((value) =>
            valuesEqual(left, value)
        );

        return inMatch[2] ? !found : found;
    }

    const likeMatch = expression.match(
        /^(.+?)\s+(NOT\s+)?LIKE\s+(['"])(.*?)\3$/i
    );

    if (likeMatch) {
        const value = String(
            resolveExpressionValue(row, likeMatch[1]) ?? ""
        );

        const pattern = likeMatch[4]
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/%/g, ".*")
            .replace(/_/g, ".");

        const found = new RegExp(`^${pattern}$`, "i").test(value);

        return likeMatch[2] ? !found : found;
    }

    const comparison = expression.match(
        /^(.+?)\s*(>=|<=|<>|!=|=|>|<)\s*(.+)$/
    );

    if (!comparison) return true;

    const left = resolveExpressionValue(row, comparison[1]);
    const operator = comparison[2];
    const right = resolveExpressionValue(row, comparison[3]);

    switch (operator) {
        case "=":
            return valuesEqual(left, right);

        case "!=":
        case "<>":
            return !valuesEqual(left, right);

        case ">":
            return compareValues(left, right) > 0;

        case "<":
            return compareValues(left, right) < 0;

        case ">=":
            return compareValues(left, right) >= 0;

        case "<=":
            return compareValues(left, right) <= 0;

        default:
            return true;
    }
};

/* =========================================================
   CLAUSE EXTRACTION
========================================================= */

const extractClause = (query = "", regex) => {
    const match = query.match(regex);
    return match ? match[1].trim() : "";
};

const getWhereClause = (query) =>
    extractClause(
        query,
        /WHERE\s+([\s\S]*?)(?=\bWITH\b|\bRETURN\b|\bORDER\s+BY\b|\bSKIP\b|\bLIMIT\b|$)/i
    );

const getReturnClause = (query) =>
    extractClause(
        query,
        /RETURN\s+([\s\S]*?)(?=\bORDER\s+BY\b|\bSKIP\b|\bLIMIT\b|$)/i
    );

const getOrderClause = (query) =>
    extractClause(
        query,
        /ORDER\s+BY\s+([\s\S]*?)(?=\bSKIP\b|\bLIMIT\b|$)/i
    );

const getLimitValue = (query) => {
    const m = query.match(/\bLIMIT\s+(\d+)/i);
    return m ? Number(m[1]) : null;
};

const getSkipValue = (query) => {
    const m = query.match(/\bSKIP\s+(\d+)/i);
    return m ? Number(m[1]) : 0;
};

const getGroupByFromSql = (sql = "") => {
    const m = sql.match(
        /\bGROUP\s+BY\s+([\s\S]*?)(?=\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i
    );

    return m ? m[1].trim() : "";
};

const getHavingFromSql = (sql = "") => {
    const m = sql.match(
        /\bHAVING\s+([\s\S]*?)(?=\bORDER\s+BY\b|\bLIMIT\b|$)/i
    );

    return m ? m[1].trim() : "";
};

/* =========================================================
   PROJECTION / AGGREGATION
========================================================= */

const splitCommaExpressions = (text = "") => {
    const result = [];

    let current = "";
    let depth = 0;

    for (const char of text) {
        if (char === "(") depth++;
        if (char === ")") depth--;

        if (char === "," && depth === 0) {
            result.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }

    if (current.trim()) {
        result.push(current.trim());
    }

    return result;
};

const parseProjectionExpression = (expression) => {
    const aggregateMatch = expression.match(
        /^\s*(COUNT|SUM|AVG|MIN|MAX|COLLECT)\s*\((.*?)\)\s*(?:AS\s+([A-Za-z_][A-Za-z0-9_]*))?/i
    );

    if (aggregateMatch) {
        return {
            type: "aggregate",
            function: aggregateMatch[1].toUpperCase(),
            expression: aggregateMatch[2].trim(),
            alias: aggregateMatch[3] || null,
        };
    }

    const aliasMatch = expression.match(
        /^(.+?)\s+AS\s+([A-Za-z_][A-Za-z0-9_]*)$/i
    );

    if (aliasMatch) {
        return {
            type: "column",
            expression: aliasMatch[1].trim(),
            alias: aliasMatch[2],
        };
    }

    return {
        type: "column",
        expression: expression.trim(),
        alias: null,
    };
};

const calculateAggregate = (
    rows,
    functionName,
    expression
) => {
    if (functionName === "COUNT") {
        if (expression === "*" || expression === "") {
            return rows.length;
        }

        return rows.filter(
            (row) => getRowValue(row, expression) !== undefined
        ).length;
    }

    const values = rows
        .map((row) => getRowValue(row, expression))
        .filter((v) => v !== undefined && v !== null)
        .map(Number)
        .filter(Number.isFinite);

    switch (functionName) {
        case "SUM":
            return values.reduce((sum, v) => sum + v, 0);

        case "AVG":
            return values.length
                ? values.reduce((sum, v) => sum + v, 0) /
                values.length
                : 0;

        case "MIN":
            return values.length ? Math.min(...values) : null;

        case "MAX":
            return values.length ? Math.max(...values) : null;

        case "COLLECT":
            return rows
                .map((row) => getRowValue(row, expression))
                .filter((v) => v !== undefined);

        default:
            return null;
    }
};

const groupRows = (rows, groupExpression) => {
    if (!groupExpression) {
        return [{ __groupRows: rows }];
    }

    const expressions = splitCommaExpressions(groupExpression);
    const groups = new Map();

    rows.forEach((row) => {
        const keyValues = expressions.map((expression) =>
            getRowValue(row, expression)
        );

        const key = JSON.stringify(keyValues);

        if (!groups.has(key)) {
            groups.set(key, { __groupRows: [] });
        }

        groups.get(key).__groupRows.push(row);
    });

    return Array.from(groups.values());
};

const materializeGroups = (
    groupedRows,
    groupExpression,
    projectionExpressions
) => {
    return groupedRows.map((group) => {
        const sourceRows = group.__groupRows || [];

        const output = {
            __groupRows: sourceRows,
        };

        const expressions = [
            ...splitCommaExpressions(groupExpression || ""),
            ...projectionExpressions,
        ];

        expressions.forEach((expression) => {
            const parsed = parseProjectionExpression(expression);

            if (parsed.type === "aggregate") {
                const value = calculateAggregate(
                    sourceRows,
                    parsed.function,
                    parsed.expression
                );

                const key =
                    parsed.alias ||
                    `${parsed.function.toLowerCase()}(${parsed.expression})`;

                output[key] = value;

                output[
                    `aggregate.${parsed.function.toLowerCase()}`
                ] = value;
            } else {
                const value = getRowValue(
                    sourceRows[0],
                    parsed.expression
                );

                const key = parsed.alias || parsed.expression;

                output[key] = value;

                if (parsed.expression.includes(".")) {
                    output[parsed.expression] = value;
                }
            }
        });

        return output;
    });
};

const evaluateHaving = (row, condition) => {
    if (!condition) return true;

    let expression = condition;

    const aggregateMatch = expression.match(
        /\b(COUNT|SUM|AVG|MIN|MAX)\s*\((.*?)\)/i
    );

    if (aggregateMatch) {
        const functionName = aggregateMatch[1].toUpperCase();
        const aggregateExpression = aggregateMatch[2];

        const aggregateValue =
            row[`aggregate.${functionName.toLowerCase()}`];

        if (aggregateValue !== undefined) {
            expression = expression.replace(
                aggregateMatch[0],
                String(aggregateValue)
            );
        } else {
            const calculated = calculateAggregate(
                row.__groupRows || [],
                functionName,
                aggregateExpression
            );

            expression = expression.replace(
                aggregateMatch[0],
                String(calculated)
            );
        }
    }

    return evaluateCondition(row, expression);
};

const sortRows = (rows, orderExpression) => {
    if (!orderExpression) return rows;

    const expressions = splitCommaExpressions(orderExpression);

    const sorted = [...rows];

    sorted.sort((a, b) => {
        for (const expression of expressions) {
            const match = expression.match(
                /^(.+?)\s+(ASC|DESC)$/i
            );

            const field = match
                ? match[1].trim()
                : expression.trim();

            const direction = match
                ? match[2].toUpperCase()
                : "ASC";

            const comparison = compareValues(
                getRowValue(a, field),
                getRowValue(b, field)
            );

            if (comparison !== 0) {
                return direction === "DESC"
                    ? -comparison
                    : comparison;
            }
        }

        return 0;
    });

    return sorted;
};

const projectRows = (rows, returnClause) => {
    if (!returnClause) return rows;

    const expressions = splitCommaExpressions(returnClause);

    if (
        expressions.length === 1 &&
        expressions[0] === "*"
    ) {
        return rows;
    }

    return rows.map((row) => {
        const projected = {
            __originalRow: row,
        };

        expressions.forEach((expression) => {
            const parsed = parseProjectionExpression(expression);

            if (parsed.type === "aggregate") {
                const value =
                    row[parsed.alias] ??
                    row[
                    `${parsed.function.toLowerCase()}(${parsed.expression})`
                    ] ??
                    calculateAggregate(
                        row.__groupRows || [row],
                        parsed.function,
                        parsed.expression
                    );

                projected[
                    parsed.alias ||
                    `${parsed.function.toLowerCase()}(${parsed.expression})`
                ] = value;

                return;
            }

            const value = getRowValue(
                row,
                parsed.expression
            );

            projected[parsed.alias || parsed.expression] = value;
        });

        return projected;
    });
};

/* =========================================================
   PROGRESSIVE RESULT
========================================================= */

const buildProgressiveResult = ({
    selectedIndex,
    steps,
    query,
    sql,
    sampleTables,
}) => {
    let currentRows = createBaseRows(
        sampleTables,
        sql
    );

    let mode = "rows";
    let label = "Matched relational rows";

    const applicableSteps = steps.slice(
        0,
        selectedIndex + 1
    );

    for (const step of applicableSteps) {
        const operation = normalizeOperation(
            step.operation
        );

        if (
            operation === "MATCH" ||
            operation === "OPTIONAL MATCH" ||
            operation === "JOIN"
        ) {
            label =
                operation === "JOIN"
                    ? "Rows after JOIN"
                    : "Rows matched from graph";

            mode = "rows";
            continue;
        }

        if (operation === "WHERE") {
            currentRows = currentRows.filter((row) =>
                evaluateCondition(
                    row,
                    getWhereClause(query)
                )
            );

            label = "Rows after WHERE";
            mode = "rows";
            continue;
        }

        if (operation === "WITH") {
            const withClause = extractClause(
                query,
                /WITH\s+([\s\S]*?)(?=\bWHERE\b|\bRETURN\b|\bORDER\s+BY\b|\bSKIP\b|\bLIMIT\b|$)/i
            );

            if (withClause) {
                currentRows = projectRows(
                    currentRows,
                    withClause
                );
            }

            label = "Rows after WITH";
            mode = "rows";
            continue;
        }

        if (operation === "GROUP BY") {
            const groupExpression =
                getGroupByFromSql(sql);

            const grouped = groupRows(
                currentRows,
                groupExpression
            );

            const returnClause =
                getReturnClause(query);

            currentRows = materializeGroups(
                grouped,
                groupExpression,
                returnClause
                    ? splitCommaExpressions(returnClause)
                    : []
            );

            label = "Grouped rows";
            mode = "grouped";
            continue;
        }

        if (operation === "AGGREGATE") {
            const groupExpression =
                getGroupByFromSql(sql);

            const grouped = groupRows(
                currentRows,
                groupExpression
            );

            const returnClause =
                getReturnClause(query);

            currentRows = materializeGroups(
                grouped,
                groupExpression,
                returnClause
                    ? splitCommaExpressions(returnClause)
                    : []
            );

            label = "Aggregate result";
            mode = "aggregate";
            continue;
        }

        if (operation === "HAVING") {
            currentRows = currentRows.filter((row) =>
                evaluateHaving(
                    row,
                    getHavingFromSql(sql)
                )
            );

            label = "Groups after HAVING";
            mode = "grouped";
            continue;
        }

        if (operation === "RETURN") {
            const returnClause =
                getReturnClause(query);

            if (returnClause) {
                currentRows = projectRows(
                    currentRows,
                    returnClause
                );
            }

            label = "Returned columns";
            mode = "projection";
            continue;
        }

        if (operation === "ORDER BY") {
            const orderExpression =
                getOrderClause(query) ||
                extractClause(
                    sql,
                    /ORDER\s+BY\s+([\s\S]*?)(?=\bLIMIT\b|$)/i
                );

            currentRows = sortRows(
                currentRows,
                orderExpression
            );

            label = "Rows after ORDER BY";
            mode = "rows";
            continue;
        }

        if (operation === "SKIP") {
            const skip = getSkipValue(query);

            currentRows = currentRows.slice(skip);

            label = `Rows after SKIP ${skip}`;
            mode = "rows";
            continue;
        }

        if (operation === "LIMIT") {
            const limit = getLimitValue(query);

            if (limit !== null) {
                currentRows = currentRows.slice(
                    0,
                    limit
                );
            }

            label =
                limit === null
                    ? "Rows after LIMIT"
                    : `Rows after LIMIT ${limit}`;

            mode = "rows";
        }
    }

    return {
        rows: currentRows,
        mode,
        label,
    };
};

/* =========================================================
   TABLE DISPLAY
========================================================= */

const removeInternalKeys = (row) =>
    Object.fromEntries(
        Object.entries(row || {}).filter(
            ([key]) =>
                !key.startsWith("__") &&
                !key.startsWith("aggregate.")
        )
    );

const DataTable = ({ rows = [], title }) => {
    if (!Array.isArray(rows) || rows.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">
                No rows in this step.
            </div>
        );
    }

    const visibleRows = rows.map(removeInternalKeys);

    const columnSet = new Set();

    visibleRows.forEach((row) =>
        Object.keys(row).forEach((column) =>
            columnSet.add(column)
        )
    );

    const columns = Array.from(columnSet);

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {title && (
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <Table2
                            size={15}
                            className="text-slate-500"
                        />

                        <span className="text-sm font-semibold text-slate-700">
                            {title}
                        </span>
                    </div>

                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {visibleRows.length} rows
                    </span>
                </div>
            )}

            <div className="max-h-[260px] overflow-auto">
                <table className="min-w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-100">
                        <tr>
                            {columns.map((column) => (
                                <th
                                    key={column}
                                    className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold text-slate-600"
                                >
                                    {column}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {visibleRows.map((row, index) => (
                            <tr
                                key={index}
                                className="border-t border-slate-100 bg-white hover:bg-slate-50"
                            >
                                {columns.map((column) => (
                                    <td
                                        key={column}
                                        className="whitespace-nowrap px-4 py-3 font-mono text-slate-700"
                                    >
                                        {Array.isArray(row[column])
                                            ? row[column].join(", ")
                                            : String(row[column] ?? "")}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

/* =========================================================
   FALLBACK STEPS
========================================================= */

const buildFallbackSteps = (
    query = "",
    sql = ""
) => {
    const steps = [];

    const matchMatch = query.match(
        /MATCH\s+([\s\S]*?)(?=\bWHERE\b|\bWITH\b|\bRETURN\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i
    );

    if (matchMatch) {
        steps.push({
            operation: "MATCH",
            cypher: `MATCH ${matchMatch[1].trim()}`,
            sql:
                sql.match(
                    /\bFROM\b[\s\S]*?(?=\bWHERE\b|\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i
                )?.[0] || "",
            description:
                "Matches the graph pattern and creates the initial relational rows.",
        });
    }

    if (extractSqlJoins(sql).length > 0) {
        steps.push({
            operation: "JOIN",
            cypher:
                query.match(
                    /\([^)]+\)\s*-\s*\[[^\]]+\]\s*->\s*\([^)]+\)/i
                )?.[0] || "Relationship mapping",
            sql:
                sql.match(
                    /\bJOIN\b[\s\S]*?(?=\bWHERE\b|\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i
                )?.[0] || "",
            description:
                "Combines relational tables using the graph relationship mapping.",
        });
    }

    const where = getWhereClause(query);

    if (where) {
        steps.push({
            operation: "WHERE",
            cypher: `WHERE ${where}`,
            sql:
                sql.match(
                    /\bWHERE\b[\s\S]*?(?=\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i
                )?.[0] || `WHERE ${where}`,
            description:
                "Filters rows according to the Cypher WHERE condition.",
        });
    }

    const sqlGroupBy =
        getGroupByFromSql(sql);

    if (sqlGroupBy) {
        steps.push({
            operation: "GROUP BY",
            cypher:
                query.match(
                    /\bRETURN\s+([\s\S]*?)$/i
                )?.[0] || "",
            sql: `GROUP BY ${sqlGroupBy}`,
            description:
                "Groups rows having the same grouping values.",
        });
    }

    if (
        /\b(COUNT|SUM|AVG|MIN|MAX|COLLECT)\s*\(/i.test(
            query
        ) ||
        /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(
            sql
        )
    ) {
        steps.push({
            operation: "AGGREGATE",
            cypher:
                query
                    .match(
                        /\b(COUNT|SUM|AVG|MIN|MAX|COLLECT)\s*\([^)]*\)/gi
                    )
                    ?.join(", ") || "",
            sql:
                sql
                    .match(
                        /\b(COUNT|SUM|AVG|MIN|MAX)\s*\([^)]*\)/gi
                    )
                    ?.join(", ") || "",
            description:
                "Calculates aggregate values for the current rows or groups.",
        });
    }

    const having = getHavingFromSql(sql);

    if (having) {
        steps.push({
            operation: "HAVING",
            cypher: `HAVING ${having}`,
            sql: `HAVING ${having}`,
            description:
                "Filters groups after aggregation.",
        });
    }

    const returnClause =
        getReturnClause(query);

    if (returnClause) {
        steps.push({
            operation: "RETURN",
            cypher: `RETURN ${returnClause}`,
            sql:
                sql.match(
                    /\bSELECT\b[\s\S]*?(?=\bFROM\b)/i
                )?.[0] ||
                `SELECT ${returnClause}`,
            description:
                "Chooses the columns and expressions displayed in the result.",
        });
    }

    const order = getOrderClause(query);

    if (order) {
        steps.push({
            operation: "ORDER BY",
            cypher: `ORDER BY ${order}`,
            sql:
                sql.match(
                    /\bORDER\s+BY\b[\s\S]*?(?=\bLIMIT\b|$)/i
                )?.[0] ||
                `ORDER BY ${order}`,
            description:
                "Sorts the result rows according to the requested ordering.",
        });
    }

    const skip = getSkipValue(query);

    if (skip > 0) {
        steps.push({
            operation: "SKIP",
            cypher: `SKIP ${skip}`,
            sql: `OFFSET ${skip}`,
            description:
                "Skips rows before producing the final result.",
        });
    }

    const limit = getLimitValue(query);

    if (limit !== null) {
        steps.push({
            operation: "LIMIT",
            cypher: `LIMIT ${limit}`,
            sql: `LIMIT ${limit}`,
            description:
                "Restricts the number of rows in the final result.",
        });
    }

    return steps;
};

/* =========================================================
   GRAPH VARIABLE MATCHING
========================================================= */

const getVariablesFromText = (text = "") => {
    const variables = [];

    const regex =
        /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:\.|:)/g;

    let match;

    while ((match = regex.exec(text)) !== null) {
        if (!variables.includes(match[1])) {
            variables.push(match[1]);
        }
    }

    return variables;
};

const getVisibleGraphVariables = (
    rows,
    query
) => {
    const variableMap =
        extractCypherVariableMap(query);

    const visible = new Set();

    rows.forEach((row) => {
        Object.entries(variableMap).forEach(
            ([variable, label]) => {
                const idValue =
                    row[`${variable}.id`] ??
                    row.id ??
                    row[`${label}.id`];

                if (
                    idValue !== undefined &&
                    idValue !== null
                ) {
                    visible.add(variable);
                }
            }
        );
    });

    return visible;
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

function Neo4jVisualizer() {
    const location = useLocation();
    const navigate = useNavigate();

    const response = location.state?.response;

    const originalQuery =
        location.state?.query ||
        response?.inputQuery ||
        "";

    const [selectedStepIndex, setSelectedStepIndex] =
        useState(0);

    const [selectedGraphElement, setSelectedGraphElement] =
        useState(null);

    const [cyInstance, setCyInstance] =
        useState(null);

    const steps = useMemo(() => {
        if (
            Array.isArray(response?.steps) &&
            response.steps.length > 0
        ) {
            return response.steps.map((step) => ({
                ...step,
                operation: normalizeOperation(
                    step.operation
                ),
            }));
        }

        return buildFallbackSteps(
            originalQuery,
            response?.sqlQuery || ""
        );
    }, [response, originalQuery]);

    const selectedStep =
        steps[selectedStepIndex] ||
        steps[0] ||
        null;

    /* =========================================================
       NEW: HIGHLIGHTED CYPHER + SQL
    ========================================================= */

    const highlightedCypher = useMemo(() => {
        const fragment =
            getCypherHighlightFragment(
                selectedStep,
                originalQuery
            );

        return highlightText(
            originalQuery,
            fragment
        );
    }, [selectedStep, originalQuery]);

    const highlightedSql = useMemo(() => {
        const sql =
            response?.sqlQuery || "";

        const fragment =
            getSqlHighlightFragment(
                selectedStep,
                sql
            );

        return highlightText(
            sql,
            fragment
        );
    }, [selectedStep, response?.sqlQuery]);

    const graph = useMemo(
        () =>
            extractGraphFromCypher(
                originalQuery
            ),
        [originalQuery]
    );

    const graphElements = useMemo(
        () => [...graph.nodes, ...graph.edges],
        [graph]
    );

    const sampleTables = useMemo(
        () =>
            normalizeSampleData(
                response?.sampleData
            ),
        [response?.sampleData]
    );

    const liveResult = useMemo(() => {
        if (!selectedStep) {
            return {
                rows: [],
                mode: "rows",
                label: "No selected step",
            };
        }

        return buildProgressiveResult({
            selectedIndex: selectedStepIndex,
            steps,
            query: originalQuery,
            sql: response?.sqlQuery || "",
            sampleTables,
        });
    }, [
        selectedStep,
        selectedStepIndex,
        steps,
        originalQuery,
        response?.sqlQuery,
        sampleTables,
    ]);

    const highlightGraph = (
        step,
        result
    ) => {
        if (!cyInstance || !step) return;

        cyInstance.elements().removeClass(
            "highlighted"
        );

        cyInstance.elements().removeClass(
            "dimmed"
        );

        const operation =
            normalizeOperation(step.operation);

        const text = `${step.cypher || ""} ${step.sql || ""
            } ${step.description || ""}`;

        const variables =
            getVariablesFromText(text);

        const allNodeIds =
            cyInstance.nodes().map((node) =>
                node.id()
            );

        const visibleVariables =
            getVisibleGraphVariables(
                result.rows,
                originalQuery
            );

        if (
            operation === "MATCH" ||
            operation === "OPTIONAL MATCH" ||
            operation === "JOIN"
        ) {
            cyInstance.nodes().forEach(
                (node) => {
                    if (
                        variables.includes(node.id()) ||
                        variables.length === 0
                    ) {
                        node.addClass("highlighted");
                    } else {
                        node.addClass("dimmed");
                    }
                }
            );

            cyInstance.edges().forEach(
                (edge) => {
                    const source =
                        edge.source().id();

                    const target =
                        edge.target().id();

                    if (
                        (variables.includes(source) &&
                            variables.includes(target)) ||
                        variables.length === 0
                    ) {
                        edge.addClass("highlighted");
                    } else {
                        edge.addClass("dimmed");
                    }
                }
            );

            return;
        }

        if (
            operation === "WHERE" ||
            operation === "HAVING"
        ) {
            if (visibleVariables.size > 0) {
                cyInstance.nodes().forEach(
                    (node) =>
                        node.addClass(
                            visibleVariables.has(
                                node.id()
                            )
                                ? "highlighted"
                                : "dimmed"
                        )
                );
            } else {
                const matchedVariables =
                    variables.filter((v) =>
                        allNodeIds.includes(v)
                    );

                cyInstance.nodes().forEach(
                    (node) =>
                        node.addClass(
                            matchedVariables.includes(
                                node.id()
                            )
                                ? "highlighted"
                                : "dimmed"
                        )
                );
            }

            return;
        }

        if (
            operation === "GROUP BY" ||
            operation === "AGGREGATE"
        ) {
            if (visibleVariables.size > 0) {
                cyInstance.nodes().forEach(
                    (node) =>
                        node.addClass(
                            visibleVariables.has(
                                node.id()
                            )
                                ? "highlighted"
                                : "dimmed"
                        )
                );
            } else {
                cyInstance.elements().addClass(
                    "highlighted"
                );
            }

            return;
        }

        if (
            operation === "RETURN" ||
            operation === "WITH" ||
            operation === "ORDER BY"
        ) {
            if (visibleVariables.size > 0) {
                cyInstance.nodes().forEach(
                    (node) =>
                        node.addClass(
                            visibleVariables.has(
                                node.id()
                            )
                                ? "highlighted"
                                : "dimmed"
                        )
                );
            } else {
                cyInstance.elements().addClass(
                    "highlighted"
                );
            }

            return;
        }

        if (
            operation === "LIMIT" ||
            operation === "SKIP"
        ) {
            cyInstance.elements().addClass(
                "highlighted"
            );

            return;
        }

        cyInstance.elements().addClass(
            "highlighted"
        );
    };

    useEffect(() => {
        if (
            selectedStep &&
            cyInstance
        ) {
            highlightGraph(
                selectedStep,
                liveResult
            );
        }
    }, [
        selectedStep,
        selectedStepIndex,
        cyInstance,
        liveResult,
    ]);

    /* =========================================================
       GRAPH STYLE
    ========================================================= */

    const stylesheet = [
        {
            selector: "node",
            style: {
                label: "data(label)",
                "text-valign": "center",
                "text-halign": "center",
                "background-color": "#ffffff",
                "border-width": 2,
                "border-color": "#64748b",
                color: "#334155",
                width: 42,
                height: 42,
                "font-size": 9,
                "font-weight": 600,
                "text-wrap": "wrap",
                "text-max-width": 40,
            },
        },

        {
            selector: "edge",
            style: {
                label: "data(label)",
                width: 1.5,
                "line-color": "#94a3b8",
                "target-arrow-color": "#94a3b8",
                "target-arrow-shape": "triangle",
                "curve-style": "bezier",
                "font-size": 8,
                color: "#475569",
                "text-background-color": "#ffffff",
                "text-background-opacity": 1,
                "text-background-padding": 2,
            },
        },

        {
            selector: ".highlighted",
            style: {
                "background-color": "#dbeafe",
                "border-color": "#2563eb",
                "line-color": "#2563eb",
                "target-arrow-color": "#2563eb",
                "border-width": 3,
                width: 48,
                height: 48,
                color: "#1e3a8a",
                opacity: 1,
            },
        },

        {
            selector: ".dimmed",
            style: {
                opacity: 0.25,
            },
        },
    ];

    const selectStep = (index) => {
        setSelectedStepIndex(index);
        setSelectedGraphElement(null);
    };

    const resetGraph = () => {
        if (!cyInstance) return;

        cyInstance.elements().removeClass(
            "highlighted"
        );

        cyInstance.elements().removeClass(
            "dimmed"
        );

        cyInstance.fit(undefined, 45);

        if (selectedStep) {
            setTimeout(
                () =>
                    highlightGraph(
                        selectedStep,
                        liveResult
                    ),
                50
            );
        }
    };

    if (!response) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-white px-6">
                <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
                    <Database
                        size={38}
                        className="mx-auto mb-4 text-slate-400"
                    />

                    <h1 className="text-xl font-bold text-slate-800">
                        No query available
                    </h1>

                    <p className="mt-2 text-sm text-slate-500">
                        Convert a Cypher query first, then open the visualizer.
                    </p>

                    <button
                        type="button"
                        onClick={() =>
                            navigate("/neo4j")
                        }
                        className="mt-6 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        Back to Neo4j Converter
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800">
            {/* =====================================================
          HIGHLIGHT ANIMATION
      ===================================================== */}

            <style>{`
        .neo4j-code-highlight {
          display: inline;
          position: relative;
          border-radius: 5px;
          padding: 2px 5px;
          margin: 0 1px;
          background: linear-gradient(
            90deg,
            #fef08a,
            #fde68a,
            #fef08a
          );
          color: #0f172a;
          font-weight: 700;
          box-shadow:
            0 0 0 1px rgba(234, 179, 8, 0.35),
            0 0 12px rgba(250, 204, 21, 0.45);
          animation: neo4jHighlightPulse 1.6s ease-in-out infinite;
        }

        @keyframes neo4jHighlightPulse {
          0% {
            box-shadow:
              0 0 0 1px rgba(234, 179, 8, 0.25),
              0 0 5px rgba(250, 204, 21, 0.25);
          }

          50% {
            box-shadow:
              0 0 0 2px rgba(234, 179, 8, 0.45),
              0 0 18px rgba(250, 204, 21, 0.65);
          }

          100% {
            box-shadow:
              0 0 0 1px rgba(234, 179, 8, 0.25),
              0 0 5px rgba(250, 204, 21, 0.25);
          }
        }
      `}</style>

            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
                    <div>
                        <button
                            type="button"
                            onClick={() =>
                                navigate("/neo4j")
                            }
                            className="mb-2 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
                        >
                            <ArrowLeft size={16} />
                            Back to Converter
                        </button>

                        <div className="flex items-center gap-3">
                            <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                                <Workflow size={20} />
                            </div>

                            <div>
                                <h1 className="text-xl font-bold text-slate-800">
                                    Neo4j → SQL Visualizer
                                </h1>

                                <p className="mt-1 text-xs text-slate-500">
                                    Click a step to update the graph and table together.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-[1600px] px-6 py-5">

                {/* =====================================================
            CYPHER + SQL
        ===================================================== */}

                <section className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">

                    {/* CYPHER */}

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 px-5 py-4">
                            <h2 className="text-sm font-semibold text-slate-800">
                                Neo4j / Cypher Query
                            </h2>

                            <p className="text-[11px] text-slate-500">
                                Original query
                            </p>
                        </div>

                        <pre
                            className="max-h-[190px] min-h-[140px] overflow-auto bg-slate-50 px-6 py-5 font-mono text-xs leading-6 text-blue-700"
                            dangerouslySetInnerHTML={{
                                __html:
                                    highlightedCypher ||
                                    escapeHtml(
                                        "No Cypher query."
                                    ),
                            }}
                        />
                    </div>

                    {/* SQL */}

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 px-5 py-4">
                            <h2 className="text-sm font-semibold text-slate-800">
                                Generated SQL
                            </h2>

                            <p className="text-[11px] text-slate-500">
                                SQL generated from the Cypher query
                            </p>
                        </div>

                        <pre
                            className="min-h-[140px] whitespace-pre-wrap break-words bg-slate-50 px-6 py-5 font-mono text-xs leading-6 text-emerald-700 transition-all duration-300"
                            dangerouslySetInnerHTML={{
                                __html:
                                    highlightedSql ||
                                    escapeHtml("No SQL generated."),
                            }}
                        />
                    </div>
                </section>

                {/* =====================================================
            THREE-PANEL PLAYGROUND
        ===================================================== */}

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_1fr_1fr]">

                    {/* =================================================
              STEP LIST
          ================================================= */}

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 px-4 py-4">
                            <h2 className="text-sm font-semibold text-slate-800">
                                Steps
                            </h2>

                            <p className="mt-1 text-[11px] text-slate-500">
                                Click a step to update the graph and table.
                            </p>
                        </div>

                        <div className="max-h-[600px] overflow-y-auto p-3">
                            {steps.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                                    No steps returned.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {steps.map((step, index) => {
                                        const operation =
                                            normalizeOperation(
                                                step.operation
                                            );

                                        const Icon =
                                            getOperationIcon(
                                                operation
                                            );

                                        const isSelected =
                                            index ===
                                            selectedStepIndex;

                                        return (
                                            <button
                                                key={`${operation}-${index}`}
                                                type="button"
                                                onClick={() =>
                                                    selectStep(index)
                                                }
                                                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition ${getOperationStyle(
                                                    operation,
                                                    isSelected
                                                )}`}
                                            >
                                                <div
                                                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${isSelected
                                                            ? "bg-blue-600 text-white"
                                                            : "bg-slate-100 text-slate-500"
                                                        }`}
                                                >
                                                    <Icon size={13} />
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[9px] font-bold text-slate-400">
                                                            {String(
                                                                index + 1
                                                            ).padStart(
                                                                2,
                                                                "0"
                                                            )}
                                                        </span>

                                                        <span
                                                            className={`truncate text-xs font-semibold ${isSelected
                                                                    ? "text-blue-700"
                                                                    : "text-slate-800"
                                                                }`}
                                                        >
                                                            {operation}
                                                        </span>
                                                    </div>
                                                </div>

                                                {isSelected && (
                                                    <Check
                                                        size={13}
                                                        className="shrink-0 text-blue-600"
                                                    />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* =================================================
              GRAPH
          ================================================= */}

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                            <div>
                                <h2 className="text-sm font-semibold text-slate-800">
                                    Neo4j Graph
                                </h2>

                                <p className="mt-1 text-[11px] text-slate-500">
                                    Graph pattern from the Cypher query.
                                </p>
                            </div>

                            <div className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] text-slate-600">
                                {graph.nodes.length} nodes ·{" "}
                                {graph.edges.length} relationships
                            </div>
                        </div>

                        <div className="relative h-[420px] bg-white">
                            {graph.nodes.length > 0 ? (
                                <CytoscapeComponent
                                    elements={graphElements}
                                    stylesheet={stylesheet}
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                    }}
                                    cy={(cy) => {
                                        setCyInstance(cy);

                                        cy.layout({
                                            name: "breadthfirst",
                                            directed: true,
                                            padding: 45,
                                            spacingFactor: 1.35,
                                        }).run();

                                        cy.removeAllListeners(
                                            "tap"
                                        );

                                        cy.on(
                                            "tap",
                                            "node",
                                            (event) => {
                                                const node =
                                                    event.target;

                                                setSelectedGraphElement({
                                                    type: "node",
                                                    label:
                                                        node.data(
                                                            "label"
                                                        ),
                                                    variable:
                                                        node.data(
                                                            "variable"
                                                        ),
                                                });
                                            }
                                        );

                                        cy.on(
                                            "tap",
                                            "edge",
                                            (event) => {
                                                const edge =
                                                    event.target;

                                                setSelectedGraphElement({
                                                    type: "edge",
                                                    label:
                                                        edge.data(
                                                            "label"
                                                        ),
                                                });
                                            }
                                        );
                                    }}
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center">
                                    <div className="text-center">
                                        <GitBranch
                                            size={38}
                                            className="mx-auto mb-3 text-slate-300"
                                        />

                                        <p className="font-medium text-slate-500">
                                            No graph pattern detected
                                        </p>

                                        <p className="mt-1 max-w-sm text-xs text-slate-400">
                                            This query may contain clauses that do not explicitly define a node relationship.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {selectedGraphElement && (
                                <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                            Selected
                                        </span>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSelectedGraphElement(
                                                    null
                                                )
                                            }
                                            className="text-xs text-slate-400 hover:text-slate-700"
                                        >
                                            Clear
                                        </button>
                                    </div>

                                    <div className="mt-1 font-semibold text-slate-800">
                                        {
                                            selectedGraphElement.label
                                        }
                                    </div>

                                    {selectedGraphElement.variable && (
                                        <div className="mt-1 font-mono text-[11px] text-slate-500">
                                            Variable:{" "}
                                            {
                                                selectedGraphElement.variable
                                            }
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-5 py-3">
                            <button
                                type="button"
                                onClick={resetGraph}
                                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                            >
                                <RotateCcw size={13} />
                                Reset
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    cyInstance?.fit(
                                        undefined,
                                        45
                                    )
                                }
                                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                            >
                                <Maximize2 size={13} />
                                Fit
                            </button>
                        </div>
                    </div>

                    {/* =================================================
              RESULT
          ================================================= */}

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 px-5 py-4">
                            <div className="flex items-center gap-2">
                                <Workflow
                                    size={16}
                                    className="text-blue-600"
                                />

                                <div>
                                    <h2 className="text-sm font-semibold text-slate-800">
                                        {selectedStep
                                            ? normalizeOperation(
                                                selectedStep.operation
                                            )
                                            : "Result"}
                                    </h2>

                                    <p className="mt-1 text-[11px] text-slate-500">
                                        {selectedStep?.description ||
                                            "Select a step to see its result."}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="max-h-[700px] overflow-y-auto p-4">
                            {selectedStep && (
                                <>
                                    <div className="grid gap-3">

                                        {/* CYPHER FRAGMENT */}

                                        <div>
                                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                                Cypher
                                            </div>

                                            <pre className="max-h-[100px] overflow-auto rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 font-mono text-[11px] leading-5 text-blue-700">
                                                {selectedStep.cypher ||
                                                    "No Cypher fragment provided."}
                                            </pre>
                                        </div>

                                        {/* SQL FRAGMENT */}

                                        <div>
                                            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                                SQL
                                            </div>

                                            <pre className="max-h-[100px] overflow-auto rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-3 font-mono text-[11px] leading-5 text-emerald-700">
                                                {selectedStep.sql ||
                                                    "No SQL fragment provided."}
                                            </pre>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex items-center justify-between">
                                        <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-[11px] font-medium text-blue-700">
                                            {liveResult.label}
                                        </span>

                                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                                            {liveResult.rows.length} row
                                            {liveResult.rows.length ===
                                                1
                                                ? ""
                                                : "s"}
                                        </span>
                                    </div>

                                    <div className="mt-3">
                                        <DataTable
                                            rows={
                                                liveResult.rows
                                            }
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default Neo4jVisualizer;