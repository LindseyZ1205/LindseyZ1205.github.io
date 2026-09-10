---
title: 'Why MySQL says "Unknown column" for an alias you just defined'
description: "You aliased a column in SELECT, used it in WHERE, and got ERROR 1054. ORDER BY accepts the same alias without complaint. Here's the one rule that explains both."
pubDatetime: 2026-09-12T14:00:00Z
tags:
  - sql
  - mysql
  - databases
draft: false
---

You wrote this, and it looked completely reasonable:

```sql
SELECT 10 - id AS new_id FROM teachers WHERE new_id > 5;
```

MySQL disagreed:

```
ERROR 1054 (42S22): Unknown column 'new_id' in 'where clause'
```

Unknown? You defined it one line above. And to make it worse, this works fine:

```sql
SELECT 10 - id AS new_id FROM teachers ORDER BY new_id;
```

Same alias. `WHERE` rejects it, `ORDER BY` accepts it. There's one rule behind
both, and once you have it you'll never guess at this again.

## The short answer

**SQL doesn't evaluate clauses in the order you write them.**

You write `SELECT`, `FROM`, `WHERE`, `ORDER BY`. The database evaluates:

```
FROM  →  WHERE  →  SELECT  →  ORDER BY
```

Aliases are created by `SELECT`, which runs **third**. `WHERE` runs **second**, so
when it executes, `new_id` genuinely does not exist yet. `ORDER BY` runs
**fourth**, by which point it does.

That's the whole explanation. The error message is accurate; it's the writing
order that's misleading.

## Why the order is what it is

It helps to stop seeing these as keywords in a sentence and start seeing them as
**stages in a pipeline, where each stage takes a table and returns a table.**

Take a concrete query:

```sql
SELECT id, first_name
FROM teachers
WHERE id > 1
ORDER BY first_name;
```

**`FROM teachers`** hands over the whole table. Say three rows, five columns.

**`WHERE id > 1`** checks each row and keeps the ones that pass. Three rows become
two. The column count doesn't change: still five.

**`SELECT id, first_name`** is where columns finally get picked. Five columns
become two. The row count doesn't change: still two. Computed expressions and
aliases are born right here.

**`ORDER BY first_name`** sorts the two-by-two result.

Read that back and the alias rule stops needing to be memorized. `SELECT` is the
stage that _invents_ `new_id`. Anything upstream of it is working with a table
that has no such column.

The same structure explains a second thing people find odd. This is legal:

```sql
SELECT first_name FROM teachers WHERE id > 1;
```

You filtered on `id` without selecting it. That's fine, because when `WHERE` ran,
the entire table was still in hand. **Rows are filtered before columns are
chosen.**

## What to do instead

You have two options, and neither is a workaround so much as a consequence.

**Repeat the expression.** Verbose, but it's what the pipeline requires:

```sql
SELECT 10 - id AS new_id FROM teachers WHERE 10 - id > 5;
```

**Wrap it in a subquery**, so the alias belongs to an inner query that has already
finished by the time the outer `WHERE` runs:

```sql
SELECT * FROM (
  SELECT 10 - id AS new_id FROM teachers
) AS t
WHERE t.new_id > 5;
```

The subquery version reads better when the expression is long or used more than
once. For a short expression, just repeat it.

## Two things that will confuse you next

**SQLite lets you do it.** If you learned SQL on SQLite (which is what a lot of
university courses use), aliases in `WHERE` work there. That's a SQLite-specific
extension, not standard SQL. MySQL and PostgreSQL both reject it. If you're
switching to MySQL and this suddenly broke, that's why.

**`HAVING` accepts aliases in MySQL.** Once `GROUP BY` enters the picture the full
order becomes:

```
FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY
```

Strictly, `HAVING` still runs before `SELECT`, but MySQL makes an allowance and
resolves aliases there anyway. PostgreSQL doesn't. Don't rely on it in code you
might port.

That same diagram answers the interview question you'll eventually get: _what's
the difference between `WHERE` and `HAVING`?_ It's a position on this line.
`WHERE` filters rows before grouping; `HAVING` filters groups after.

## Check it yourself

```sql
SELECT 10 - id AS new_id FROM teachers WHERE new_id > 5;   -- ERROR 1054
SELECT 10 - id AS new_id FROM teachers WHERE 10 - id > 5;  -- works
SELECT 10 - id AS new_id FROM teachers ORDER BY new_id;    -- works
```

Three lines, and the rule is yours.

The mental image I keep is an assembly line: `WHERE` stands upstream and can't see
what happens downstream. Every time SQL does something that seems arbitrary, my
first move now is to ask which stage I'm actually standing in.
