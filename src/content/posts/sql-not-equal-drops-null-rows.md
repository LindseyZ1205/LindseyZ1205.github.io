---
title: "Your WHERE <> filter is silently dropping every NULL row"
description: "WHERE role <> 'TA' looks like it means everyone who isn't a TA. It means everyone we know for certain isn't a TA. Nothing errors, the result is just short."
pubDatetime: 2026-09-10T14:00:00Z
tags:
  - sql
  - mysql
  - databases
  - null-handling
draft: false
---

Here is a query that returns a wrong answer without failing:

```sql
SELECT * FROM teachers WHERE role <> 'TA';
```

You read it as _everyone who isn't a TA_. What you get is _everyone we know for
certain isn't a TA_. Every row where `role` is `NULL` is excluded, silently.

No error. No warning. The result set is just a few rows short, and if you're
counting or aggregating on top of it, the number you report is wrong.

## Why it happens

`NULL` is not an empty string and it is not zero. **It means the value is
unknown.**

Follow that through and you get the part that trips everyone: **a comparison
involving `NULL` returns neither true nor false. It returns `NULL`.** SQL has
three-valued logic, not two.

Now recall what `WHERE` actually does. It doesn't discard rows where the condition
is false. It **keeps rows where the condition is true.** Those sound like the same
sentence until a third outcome exists.

For a row where `role` is `NULL`, the expression `role <> 'TA'` evaluates to
`NULL`. Not true. So the row isn't kept. It wasn't rejected on the merits, it just
never qualified.

To include those rows you have to ask for them:

```sql
SELECT * FROM teachers WHERE role <> 'TA' OR role IS NULL;
```

## The louder version of the same bug

This one at least announces itself:

```sql
SELECT * FROM teachers WHERE email = NULL;   -- always zero rows
```

Always empty, even when the table is full of rows with no email. "Is unknown equal
to unknown?" is unknown, and `WHERE` keeps only true.

That's what the `IS` operator exists for:

```sql
SELECT * FROM teachers WHERE email IS NULL;
SELECT * FROM teachers WHERE email IS NOT NULL;
```

Getting zero rows back is at least a signal that sends you looking. The `<>`
version is more dangerous precisely because it returns _plausible_ results.

## See it in four lines

```sql
INSERT INTO teachers (id, first_name, role) VALUES (99, 'Unknown', NULL);

SELECT * FROM teachers WHERE role <> 'TA';                  -- id=99 missing
SELECT * FROM teachers WHERE role <> 'TA' OR role IS NULL;  -- id=99 present
SELECT * FROM teachers WHERE role = NULL;                   -- zero rows
SELECT * FROM teachers WHERE role IS NULL;                  -- one row
```

Run those once and this stops being trivia.

## Where else it leaks

Three-valued logic doesn't stay in `WHERE`. Once a `NULL` enters an expression it
propagates through the whole thing, and `NOT` doesn't rescue you. `NOT NULL` is
still `NULL`.

**`NOT IN` with a NULL in the list returns nothing.** This is the nastiest form:

```sql
SELECT * FROM teachers
WHERE id NOT IN (SELECT manager_id FROM employees);
```

If a single `manager_id` in that subquery is `NULL`, this returns **zero rows**,
always. `id NOT IN (1, 2, NULL)` expands to `id <> 1 AND id <> 2 AND id <> NULL`,
and that last term is `NULL`, which poisons the whole `AND` chain. Use
`NOT EXISTS` instead, or filter the `NULL`s out of the subquery.

**Aggregates skip NULLs, except `COUNT(*)`.** `COUNT(role)` counts rows where
`role` is not null; `COUNT(*)` counts all rows. `AVG(salary)` divides by the number
of non-null salaries, not the number of rows, which is sometimes what you want and
sometimes a quiet bias in your number.

**`LIKE '%'` is not the same as `IS NOT NULL`.** It matches any string including
the empty one, but against a `NULL` it returns `NULL`, so those rows don't appear.
People reach for it as a catch-all and it isn't one.

## What to actually do about it

Treat any column that permits `NULL` as a column where `=` and `<>` are incomplete
tools. Two habits cover most of it.

**When you write a negative condition, ask what should happen to the unknowns.**
Usually you want them included, which means adding `OR col IS NULL`. Sometimes you
genuinely want them out. Either way it should be a decision, not an accident.

**Push `NOT NULL` into the schema wherever the column truly can't be unknown.**
Every column that can't be `NULL` is a column you never have to reason about this
way again. The cheapest fix for a class of bugs is making the state unrepresentable.

If you want a shortcut for the common case, MySQL has a null-safe equality
operator, `<=>`, which returns true when both sides are `NULL`. It's not standard
SQL, so don't scatter it through code you might port, but it's handy for
comparisons in a one-off query.

The thing I'd want someone to take away isn't the syntax. It's that **a query
returning results is not evidence that it returned the right ones.** This was the
first case where I saw a database hand back an answer that was confidently,
quietly incomplete, and it changed how much I trust a row count I didn't verify.
