package com.example.springAI.service;

import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.select.*;
import net.sf.jsqlparser.schema.Table;
import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.expression.*;
import net.sf.jsqlparser.expression.operators.conditional.AndExpression;
import net.sf.jsqlparser.expression.operators.conditional.OrExpression;
import net.sf.jsqlparser.expression.operators.relational.*;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class QueryExtractor {

    private int idCounter = 0;

    public Map<String, Object> extract(String rawQuery) {
        idCounter = 0;
        Map<String, Object> result = new LinkedHashMap<>();

        try {
            Statement statement = CCJSqlParserUtil.parse(rawQuery);
            result.put("hasError", false);
            result.put("statementType", statement.getClass().getSimpleName());

            if (statement instanceof PlainSelect plainSelect) {
                result.put("details", parsePlainSelect(plainSelect));
            } else if (statement instanceof ParenthesedSelect parenthesedSelect) {
                result.put("details", parseParenthesedSelect(parenthesedSelect));
            } else if (statement instanceof SetOperationList setOp) {
                result.put("details", parseSetOperationList(setOp));
            } else {
                result.put("details", Map.of("rawStatement", statement.toString()));
            }

        } catch (Exception ex) {
            result.put("hasError", true);
            result.put("errorType", "ParsingException");
            result.put("errorMessage", ex.getMessage());
        }

        return result;
    }

    private Map<String, Object> parseParenthesedSelect(ParenthesedSelect parenthesedSelect) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("structure", "PARENTHESED_SELECT");
        if (parenthesedSelect.getPlainSelect() != null) {
            map.putAll(parsePlainSelect(parenthesedSelect.getPlainSelect()));
        } else if (parenthesedSelect.getSetOperationList() != null) {
            map.putAll(parseSetOperationList(parenthesedSelect.getSetOperationList()));
        }
        return map;
    }

    private Map<String, Object> parseSetOperationList(SetOperationList setOp) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("structure", "SET_OPERATION");
        List<Map<String, Object>> selects = new ArrayList<>();

        for (Object obj : setOp.getSelects()) {
            if (obj instanceof PlainSelect plainSelect) {
                selects.add(parsePlainSelect(plainSelect));
            } else if (obj instanceof ParenthesedSelect parenthesedSelect) {
                selects.add(parseParenthesedSelect(parenthesedSelect));
            }
        }
        map.put("selectBlocks", selects);
        return map;
    }

    private Map<String, Object> parsePlainSelect(PlainSelect plainSelect) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("structure", "PLAIN_SELECT");

        // DISTINCT check
        map.put("isDistinct", plainSelect.getDistinct() != null);

        // Select Items / Aggregates / Scalar Subqueries in SELECT
        List<Map<String, Object>> selectItems = new ArrayList<>();
        if (plainSelect.getSelectItems() != null) {
            for (SelectItem item : plainSelect.getSelectItems()) {
                Map<String, Object> itemMap = new LinkedHashMap<>();
                itemMap.put("expression", item.toString());

                Expression expr = item.getExpression();
                if (expr != null) {
                    if (expr instanceof ParenthesedSelect sub) {
                        idCounter++;
                        itemMap.put("type", "SCALAR_SUBQUERY");
                        itemMap.put("subqueryId", "subquery_" + idCounter);
                        itemMap.put("queryDetails", parseParenthesedSelect(sub));
                    } else if (expr instanceof Function func) {
                        itemMap.put("type", "AGGREGATE_FUNCTION");
                        itemMap.put("functionName", func.getName());
                    } else {
                        itemMap.put("type", "COLUMN_OR_EXPRESSION");
                    }
                }
                if (item.getAlias() != null) {
                    itemMap.put("alias", item.getAlias().getName());
                }
                selectItems.add(itemMap);
            }
        }
        map.put("selectItems", selectItems);

        // FROM clause (Supports Derived Table Subqueries)
        if (plainSelect.getFromItem() != null) {
            map.put("from", parseFromItem(plainSelect.getFromItem()));
        }

        // JOINs (INNER, LEFT, RIGHT)
        if (plainSelect.getJoins() != null) {
            List<Map<String, Object>> joins = new ArrayList<>();
            for (Join join : plainSelect.getJoins()) {
                Map<String, Object> jMap = new LinkedHashMap<>();
                String joinType = "INNER";
                if (join.isLeft()) joinType = "LEFT";
                else if (join.isRight()) joinType = "RIGHT";

                jMap.put("type", joinType);
                if (join.getRightItem() != null) {
                    jMap.put("table", join.getRightItem().toString());
                }
                if (join.getOnExpressions() != null && !join.getOnExpressions().isEmpty()) {
                    jMap.put("on", parseExpression(join.getOnExpressions().iterator().next()));
                }
                joins.add(jMap);
            }
            map.put("joins", joins);
        }

        // WHERE clause
        if (plainSelect.getWhere() != null) {
            map.put("where", parseExpression(plainSelect.getWhere()));
        }

        // ORDER BY clause
        if (plainSelect.getOrderByElements() != null) {
            List<Map<String, String>> orderByList = new ArrayList<>();
            for (OrderByElement orderBy : plainSelect.getOrderByElements()) {
                Map<String, String> obMap = new LinkedHashMap<>();
                obMap.put("expression", orderBy.getExpression().toString());
                obMap.put("direction", orderBy.isAsc() ? "ASC" : "DESC");
                orderByList.add(obMap);
            }
            map.put("orderBy", orderByList);
        }

        return map;
    }

    private Map<String, Object> parseFromItem(FromItem fromItem) {
        Map<String, Object> map = new LinkedHashMap<>();
        if (fromItem instanceof Table t) {
            map.put("type", "TABLE");
            map.put("name", t.getName());
            map.put("alias", t.getAlias() != null ? t.getAlias().getName() : null);
        } else if (fromItem instanceof ParenthesedSelect sub) {
            idCounter++;
            map.put("type", "SUBQUERY");
            map.put("subqueryId", "subquery_" + idCounter);
            map.put("alias", sub.getAlias() != null ? sub.getAlias().getName() : null);
            map.put("queryDetails", parseParenthesedSelect(sub));
        }
        return map;
    }

    private Object parseExpression(Expression expr) {
        if (expr instanceof AndExpression || expr instanceof OrExpression) {
            BinaryExpression bin = (BinaryExpression) expr;
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("operator", expr instanceof AndExpression ? "AND" : "OR");
            map.put("left", parseExpression(bin.getLeftExpression()));
            map.put("right", parseExpression(bin.getRightExpression()));
            return map;
        }

        if (expr instanceof ComparisonOperator comp) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("operator", comp.getStringExpression());
            map.put("left", parseExpression(comp.getLeftExpression()));
            map.put("right", parseExpression(comp.getRightExpression()));
            return map;
        }

        if (expr instanceof LikeExpression like) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("operator", like.isNot() ? "NOT LIKE" : "LIKE");
            map.put("left", parseExpression(like.getLeftExpression()));
            map.put("right", parseExpression(like.getRightExpression()));
            return map;
        }

        if (expr instanceof InExpression inExpr) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("operator", inExpr.isNot() ? "NOT IN" : "IN");
            map.put("left", parseExpression(inExpr.getLeftExpression()));

            if (inExpr.getRightExpression() instanceof ParenthesedSelect sub) {
                idCounter++;
                map.put("type", "SUBQUERY_EXPR");
                map.put("subqueryId", "subquery_" + idCounter);
                map.put("queryDetails", parseParenthesedSelect(sub));
            } else {
                map.put("right", inExpr.getRightExpression() != null ? inExpr.getRightExpression().toString() : "list_values");
            }
            return map;
        }

        if (expr instanceof ExistsExpression exists) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("operator", exists.isNot() ? "NOT EXISTS" : "EXISTS");
            if (exists.getRightExpression() instanceof ParenthesedSelect sub) {
                idCounter++;
                map.put("subqueryId", "subquery_" + idCounter);
                map.put("queryDetails", parseParenthesedSelect(sub));
            } else {
                map.put("expression", exists.getRightExpression().toString());
            }
            return map;
        }

        if (expr instanceof Between between) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("operator", between.isNot() ? "NOT BETWEEN" : "BETWEEN");
            map.put("expression", parseExpression(between.getLeftExpression()));
            map.put("start", parseExpression(between.getBetweenExpressionStart()));
            map.put("end", parseExpression(between.getBetweenExpressionEnd()));
            return map;
        }

        if (expr instanceof IsNullExpression isNull) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("operator", isNull.isNot() ? "IS NOT NULL" : "IS NULL");
            map.put("column", parseExpression(isNull.getLeftExpression()));
            return map;
        }

        if (expr instanceof ParenthesedSelect sub) {
            idCounter++;
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("type", "SUBQUERY_EXPR");
            map.put("subqueryId", "subquery_" + idCounter);
            map.put("queryDetails", parseParenthesedSelect(sub));
            return map;
        }

        if (expr instanceof Column col) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("type", "COLUMN");
            map.put("name", col.getColumnName());
            map.put("table", col.getTable() != null ? col.getTable().getName() : null);
            return map;
        }

        return expr.toString();
    }
}