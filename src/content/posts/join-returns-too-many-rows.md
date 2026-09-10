---
title: "Why your JOIN returns more rows than either table"
description: "A JOIN that returns 40,000 rows from two tables of 200 usually means one thing. Underneath, every JOIN is a Cartesian product with a filter on top."
pubDatetime: 2026-09-09T11:00:00Z
tags:
  - sql
  - mysql
  - joins
draft: false
---

Two tables. One has 200 rows, the other has 200 rows. Your `JOIN` returns 40,000.

Or the subtler version: you joined orders to customers, expected 1,000 rows back,
got 3,400, and now every aggregate on top of it is wrong.

Both come from the same place, and it isn't a bug in `JOIN`. It's what `JOIN`
has been doing the entire time.

## Every JOIN starts as a Cartesian product

Put two tables after `FROM` and you get the **Cartesian product**: every row
paired with every row of the other table.

Two rules, and they're worth committing to memory:

- **Rows multiply.**
- **Columns add.**

Table `A`, two rows and three columns:

| a   | b   | c   |
| --- | --- | --- |
| 1   | 2   | 3   |
| 2   | 8   | 10  |

Table `B`, two rows and two columns:

| d   | e   |
| --- | --- |
| 10  | 20  |
| 15  | 25  |

`SELECT * FROM A, B` gives 2 × 2 = 4 rows and 3 + 2 = 5 columns:

| a   | b   | c   | d   | e   |
| --- | --- | --- | --- | --- |
| 1   | 2   | 3   | 10  | 20  |
| 1   | 2   | 3   | 15  | 25  |
| 2   | 8   | 10  | 10  | 20  |
| 2   | 8   | 10  | 15  | 25  |

Most of those rows are meaningless. The product doesn't know anything about your
data; it just enumerates every possible pairing. What makes it useful is the
filter that comes next:

```sql
SELECT * FROM A, B WHERE A.c = B.d;
```

`FROM` builds the four-row table, then `WHERE` walks it and keeps the one row
where `c = d`. That condition has a name: a **join condition**.

And this:

```sql
SELECT * FROM A JOIN B ON A.c = B.d;
```

is the same operation with better spelling. `JOIN ... ON` is not a separate
mechanism. **It's a Cartesian product with the filter moved into its own clause.**

So 200 × 200 = 40,000 is not a malfunction. It's what you get when the filter is
missing or isn't filtering.

## Cause one: no join condition at all

The most direct version. You forgot the `ON`:

```sql
SELECT * FROM a_tbl JOIN b_tbl;
```

This is **legal SQL**. MySQL and PostgreSQL both accept it and treat it as a
`CROSS JOIN`. No warning, no error. Two tables of 10,000 rows produce 100 million,
the query appears to hang, and the syntax is perfectly valid.

The comma form has exactly the same failure, and it's harder to spot:

```sql
SELECT * FROM a_tbl, b_tbl WHERE a_tbl.status = 'active';
```

There is a `WHERE` here, so nothing looks obviously missing. But it filters rows,
it doesn't pair them. You still get the full product, just a smaller one.

**This is the practical argument for `JOIN ... ON` over the comma form.** Not
elegance. The word `JOIN` is a standing reminder that an `ON` belongs next to it,
and its absence is visible in review. A missing predicate inside a long `WHERE`
list is nearly invisible.

If you genuinely want the product, say so:

```sql
SELECT * FROM a_tbl CROSS JOIN b_tbl;
```

Now the next reader knows it wasn't a slip.

## Cause two: the join key isn't unique

This is the one that produces 3,400 instead of 1,000, and it's much easier to
miss because the query looks correct.

If one row in `A` matches three rows in `B`, that row becomes **three rows** in
the result. The output row count is determined by the matching relationship, not
by the size of either table.

```sql
SELECT o.id, o.total, c.name
FROM orders o
JOIN customers c ON o.customer_id = c.id;
```

If `customers.id` is a primary key, every order matches exactly one customer and
you get one row per order. But if `customers` somehow holds duplicates, or you
joined on `email` instead of `id`, or you're joining through a table that has one
row per address rather than per customer, each order fans out.

The reason totals go wrong is that the fan-out happens _before_ aggregation. Every
duplicated row's `total` gets counted again.

Diagnosing it takes one query. Check whether your join key is actually unique on
the side you assume it is:

```sql
SELECT customer_id, COUNT(*)
FROM customers
GROUP BY customer_id
HAVING COUNT(*) > 1;
```

Any rows returned, and you've found your multiplier.

## Cause three: aliases in a self-join

When you join a table to itself, aliases stop being optional:

```sql
SELECT emp.name AS employee, mgr.name AS manager
FROM employees AS emp
JOIN employees AS mgr ON emp.manager_id = mgr.id;
```

Without them, MySQL refuses outright:

```
ERROR 1066 (42000): Not unique table/alias: 'employees'
```

And once a table is aliased, **the alias replaces the original name.** This is an
error, not a fallback:

```sql
SELECT employees.name FROM employees AS emp;   -- ERROR 1054: Unknown column
```

If two joined tables share a column name and you reference it unqualified, you get:

```
ERROR 1052 (23000): Column 'id' in field list is ambiguous
```

Which is a good error. The bad case is when the ambiguity is in your `ON` clause
and it resolves to something you didn't intend, and the row count quietly changes.

## Reproduce it in a minute

```sql
CREATE TABLE a_tbl (a INT, b INT, c INT);
CREATE TABLE b_tbl (d INT, e INT);

INSERT INTO a_tbl VALUES (1, 2, 3), (2, 8, 10);
INSERT INTO b_tbl VALUES (10, 20), (15, 25);

SELECT * FROM a_tbl, b_tbl;                            -- 4 rows: the product
SELECT * FROM a_tbl JOIN b_tbl;                        -- 4 rows: no ON, still legal
SELECT * FROM a_tbl CROSS JOIN b_tbl;                  -- 4 rows: explicit
SELECT * FROM a_tbl JOIN b_tbl ON a_tbl.c = b_tbl.d;   -- 1 row
```

The first three are identical. **The database will not stop you from forgetting a
join condition**, so the habit has to come from you: write `JOIN`, write `ON`.

## One thing worth unlearning

"`JOIN` reduces the row count" is a belief a lot of people hold without ever
stating it, and it's what makes the 3,400 surprising. An `INNER JOIN` can return
fewer rows than either input, or more than both. It follows the matching
relationship.

Once you're reasoning about it as _multiply, then filter_, the question stops
being "why did JOIN do this to me" and becomes "how many rows on the right does
each row on the left match". That question you can answer with a `GROUP BY`.
