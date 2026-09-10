---
title: "Does MySQL need a COMMIT after INSERT? No, and that's the problem"
description: "The answer is no, MySQL autocommits by default. The interesting part is that typing COMMIT anyway raises no error, so a wrong mental model can survive for years."
pubDatetime: 2026-09-09T13:00:00Z
featured: true
tags:
  - sql
  - mysql
  - databases
  - transactions
draft: false
---

Short answer: **no.** MySQL runs with `autocommit` on by default, so an `INSERT`
is committed the moment it finishes. You don't need to type anything after it.

The reason this question keeps getting asked is that plenty of people are taught
the opposite, and MySQL never corrects them.

I was taught these two rules:

> 1. `INSERT`, `UPDATE`, and `DELETE` are not auto-committed. You must `COMMIT`
>    manually.
> 2. `CREATE`, `ALTER`, and `DROP` are auto-committed. No `COMMIT` needed.

Rule 2 is true everywhere. Rule 1 is true in **Oracle** and backwards in
**MySQL**. And since I was working through the material on MySQL, I checked both.

## Confirming autocommit is on

```sql
SELECT @@autocommit;   -- 1
```

`autocommit = 1` means **every individual statement is its own complete
transaction and commits as soon as it finishes.**

The test that settles it: run a single `INSERT`, type no `COMMIT` at all, quit the
client entirely, reconnect on a fresh connection, and query. The row is there.

## Why the wrong belief survives

Here's the part that makes this worth writing down. Typing `COMMIT;` in MySQL
after an `INSERT` **doesn't error.** Under autocommit it's a legal no-op.

So you type it, nothing complains, your data is there, and you conclude: _I
committed, therefore my data is safe._ The outcome is right. The model is wrong.
The data was safe the instant the `INSERT` ran, and your `COMMIT` did nothing.

Nothing in the system will ever tell you otherwise. That's the general shape of
the trap and it's worth naming: **no error is not evidence of effect.**

It stops being harmless the moment you actually need a transaction, because you
believe you already know how they work.

## Rule 2 is true, and sharper than it sounds

I tested it by opening a transaction, inserting a row, slipping a `CREATE TABLE`
into the middle, and rolling back:

```sql
START TRANSACTION;
INSERT INTO teachers (id, first_name) VALUES (302, 'ImplicitCommit');
CREATE TABLE demo_implicit (x INT);
ROLLBACK;

SELECT COUNT(*) FROM teachers WHERE id = 302;   -- 1
```

**The rollback did nothing. The row is still there.**

That `CREATE TABLE` triggered an **implicit commit**, which committed the pending
`INSERT` along with it. By the time `ROLLBACK` ran, there was nothing left to roll
back.

DDL can't be rolled back, in MySQL or Oracle. Which gives you a rule worth
keeping: **never put DDL inside a transaction**, or the transaction gets cut in
half without telling you. Migration scripts that mix schema changes and data
changes hit this constantly.

The corrected pair of rules:

|                                | Oracle                                    | MySQL                            |
| ------------------------------ | ----------------------------------------- | -------------------------------- |
| `INSERT` / `UPDATE` / `DELETE` | **not** auto-committed, `COMMIT` required | **auto-committed** by default    |
| `CREATE` / `ALTER` / `DROP`    | auto-committed, cannot roll back          | auto-committed, cannot roll back |

## What COMMIT actually means

I was also told "commit flushes from memory to disk." That's a piece of the
implementation, and it misses the part that matters.

`COMMIT` does three things:

- **Ends a transaction.** This group of operations stops here.
- **Makes atomicity real.** The group goes from revocable as a unit to
  irrevocable.
- **Makes the changes visible.** Other connections can now see them. Before the
  commit, you could and they couldn't.

The third one is completely absent from "flushes to disk," and it's the entire
reason transactions matter under concurrency.

On the disk question: InnoDB does by default
(`innodb_flush_log_at_trx_commit = 1`) flush the **redo log** at commit, so the
claim isn't invented. But the data pages may still be sitting in the buffer pool,
written later. **Durability comes from the redo log, not from data pages landing
immediately.**

A more accurate sentence: _these changes are final, other people can see them, and
a power failure won't lose them._ What happens on the platter is an implementation
detail.

## Using transactions in MySQL anyway

Since autocommit is on, you open a transaction explicitly:

```sql
START TRANSACTION;                                             -- or BEGIN
UPDATE accounts SET balance = balance - 100 WHERE id = 'A';
UPDATE accounts SET balance = balance + 100 WHERE id = 'B';
COMMIT;
```

This is the case autocommit can't cover. Two statements that must both succeed or
both not happen. If the connection dies between them, $100 stops existing.

And `ROLLBACK` genuinely works. I checked that the deleted row came back:

```sql
START TRANSACTION;
DELETE FROM teachers WHERE id = 301;
ROLLBACK;      -- the row is back
```

You can also turn autocommit off entirely, which makes MySQL behave like Oracle:

```sql
SET autocommit = 0;
```

Every DML statement then needs a manual `COMMIT`. Useful if you want your local
environment to match what you're being taught. Just remember it's a setting you
changed, not a default.

## The same question, one layer up

Python's database drivers usually default to autocommit **off**, which is the
reverse of what you experience in the MySQL command-line client:

```python
db.execute('INSERT INTO nums VALUES (1, 2);')
db.commit()      # required here, or nothing is persisted
```

So "do I need to commit?" has no context-free answer. It depends on three things:
**which database, which client, and the current value of autocommit.** Two of
those can change without you touching any code.

Which is the actual takeaway. Don't memorize the conclusion:

```sql
SELECT @@autocommit;
```

What stuck with me from this wasn't the setting. It was realizing I'd been handed
a rule with an unstated scope. It was true, for a database I wasn't using. Now
when I learn something database-specific, the first thing I write next to it is
which database it came from.
