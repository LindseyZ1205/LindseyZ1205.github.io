---
title: "You created an index and the query is still slow. Here's why MySQL ignores it."
description: "EXPLAIN says type: ALL and key: NULL even though the index exists. Four common reasons an index you just built gets skipped, and how to confirm which one you hit."
pubDatetime: 2026-09-11T14:00:00Z
tags:
  - sql
  - mysql
  - databases
  - performance
draft: false
---

You created the index:

```sql
CREATE INDEX idx_teachers_first_name ON teachers(first_name);
```

The query is still slow. `EXPLAIN` tells you why, and it isn't what you hoped:

```
type: ALL
key: NULL
```

`type: ALL` means full table scan. `key: NULL` means no index was used. The index
exists, MySQL knows about it, and it decided not to bother.

Usually one of four things is going on.

## First, confirm you're reading EXPLAIN right

Put `EXPLAIN` in front of any query and MySQL tells you how it _plans_ to execute
it, without running it:

```sql
EXPLAIN SELECT * FROM teachers WHERE first_name = 'Kay';
```

Two columns carry most of the signal:

- **`type`** is the access method. `ALL` is a full table scan. `ref`, `range`, and
  `const` all mean an index is doing work.
- **`key`** is the index actually chosen. `NULL` means none.

Getting into the habit of running `EXPLAIN` right after creating an index, rather
than assuming it took effect, catches all four of the cases below in a few
seconds.

## Reason 1: a leading wildcard

```sql
SELECT * FROM teachers WHERE first_name LIKE '%kay%';
```

An index in InnoDB is a **B+ tree**, and a B+ tree is ordered by prefix. Looking
up `kay%` means descending to where the `k` entries start. Looking up `%kay` gives
the tree no starting point, so there's nothing to descend to. The only option left
is to look at every row.

This one is worth checking first because it's silent and extremely common,
especially in search boxes built with `LIKE '%' + input + '%'`.

```sql
EXPLAIN SELECT * FROM teachers WHERE first_name LIKE 'kay%';   -- uses the index
EXPLAIN SELECT * FROM teachers WHERE first_name LIKE '%kay';   -- does not
```

If you genuinely need substring search, an index won't save you. That's what
full-text indexes exist for.

## Reason 2: the column is wrapped in a function

```sql
SELECT * FROM teachers WHERE UPPER(first_name) = 'KAY';
```

The index stores `first_name`, not `UPPER(first_name)`. MySQL would have to
compute the function for every row before it could compare, which means reading
every row.

The same thing happens with dates, and this version catches a lot of people:

```sql
WHERE YEAR(created_at) = 2026        -- index unusable
WHERE created_at >= '2026-01-01'
  AND created_at <  '2027-01-01'     -- index usable
```

Rewriting the condition so the bare column sits on one side is the fix. Implicit
type conversion counts too: comparing an indexed `VARCHAR` column to a number
forces a conversion on every row and kills the index the same way.

## Reason 3: the table is small

If the table has a few hundred rows, the optimizer may correctly decide that
scanning it is cheaper than descending a tree and then jumping back to fetch rows.

This is not a problem. It's the optimizer being right. But it does mean **testing
index behavior on a tiny development table tells you nothing** about what happens
in production. If you're benchmarking an index, benchmark it on realistic data
volume.

## Reason 4: the query returns most of the table

An index lookup gives you a row pointer, and then MySQL fetches the actual row.
If a query matches 60% of rows, doing that lookup-then-fetch dance for most of the
table is slower than reading it straight through.

So `WHERE status = 'active'` on a table where nearly everything is active won't
use an index on `status`, and shouldn't. Indexes pay off on **selective**
conditions, ones that eliminate most of the table.

## What the index is costing you meanwhile

Worth knowing before you add three more trying to fix this.

**Disk space.** An index is a second data structure. Several indexes on a wide
table can take more space than the data.

**Slower writes.** Every `INSERT`, `UPDATE`, and `DELETE` must update the data
_and_ every affected index. This cost is paid continuously and never shows up in
the query you were trying to speed up, which is why it's the one people
underestimate.

**A harder job for the optimizer.** More indexes means a bigger search space for
the planner, and occasionally it chooses worse.

Which makes the rule straightforward: **index columns that are read often and
written rarely.** Adding one to every column is not a strategy, it's a tax.

## You already have indexes you didn't create

MySQL builds one automatically for `PRIMARY KEY` and `UNIQUE`. It has to, since
otherwise checking uniqueness would mean a full scan on every insert.

```sql
SHOW INDEX FROM teachers;
```

The `PRIMARY` row is the one that came free. This is also why lookups by primary
key always feel fast, and why `WHERE id = 3` was never your performance problem.

## The diagnostic loop

```sql
EXPLAIN SELECT * FROM teachers WHERE first_name = 'Kay';       -- baseline
CREATE INDEX idx_teachers_first_name ON teachers(first_name);
EXPLAIN SELECT * FROM teachers WHERE first_name = 'Kay';       -- type and key changed?
EXPLAIN SELECT * FROM teachers WHERE first_name LIKE '%ay';    -- compare: unusable
```

Reading those last two side by side is the fastest way to make "a leading wildcard
disables the index" concrete.

The habit that's actually worth building isn't memorizing these four cases. It's
never trusting that an index took effect because you created it. `EXPLAIN` takes
two seconds and answers the question directly, and the four reasons above are just
what you find once you start looking.
