---
title: "Idempotent MERGE: the re-run was safe, so why did the totals change?"
description: "Merging on a natural key is supposed to make a batch job replayable. It does, right up until the source batch, the ordering, or the input window stops being what you assumed."
pubDatetime: 2026-10-01T12:00:00Z
tags:
  - backend
  - data-engineering
  - idempotency
draft: false
---

You built the pipeline the way you were told to. The Silver table is written with
a `MERGE` on the transaction ID, so re-processing a batch updates the rows that
already exist instead of appending duplicates. The job is idempotent. Running it
twice is the same as running it once.

Then a run fails halfway, you re-run yesterday's batch to recover, and a number
in the Gold layer moves. Not by much. Enough that someone notices.

Nothing about the `MERGE` was wrong. What was wrong was the sentence "running it
twice is the same as running it once," which is true of the merge statement and
not necessarily true of the job that contains it. That gap is where this kind of
bug lives, and it's worth walking through the four places it opens up, because
they fail in different ways and only one of them is loud.

I should be clear about which parts of this I learned which way. The merge itself
I built: natural-key upserts with deduplication, writing the Silver layer of a
medallion lake. The ordering problem in the second section is not an incident I
debugged. It's something I only understood properly afterwards, going back over a
design I'd already shipped and noticing an assumption I had never actually
checked. The rest is reasoning outward from there, so read it as a list of
questions I'd now ask rather than a list of scars.

## The same key can appear twice inside one batch

Idempotency is a claim about the relationship between the target table and the
source batch. It assumes the source has at most one row per key, because that's
the only way "merge this key" is a well defined instruction.

Source batches don't always cooperate. An upstream system that emits an event on
create and another on update will happily put both in the same hour. A CDC feed
carries every intermediate state a row passed through. A file that was uploaded
twice and concatenated has every key exactly twice.

Delta Lake handles this the good way, which is to refuse. When more than one
source row matches the same target row, the merge fails rather than picking one,
because picking one would be non-deterministic and the whole point of the
operation is that it isn't. The job stops and you go look.

I found that out from the documentation rather than from an outage, which is the
pleasant version. It's a guarantee worth knowing you have, because it means this
particular mistake is one the engine will not let you make silently.

The failure mode isn't the error. It's what people do next. The obvious fix is to
collapse the duplicates before merging, and the obvious way to collapse them is
whatever makes the error go away. `DISTINCT` on the key, or a `GROUP BY` that
picks some arbitrary row per key. The job runs, the error is gone, and you have
quietly replaced a loud non-determinism with a silent one. Now the row that wins
is whichever one the engine happened to hand you, and on a re-run it might be the
other one.

Deduplicating deterministically costs one more line of thought: decide what
"latest" means, and say so.

```sql
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY transaction_id ORDER BY updated_at DESC, sequence_no DESC
  ) AS rn
  FROM staging.transactions
) WHERE rn = 1
```

That window is doing the real work, and the tiebreaker after `updated_at` is
doing more of it than it looks. Timestamps collide, especially when they come
from a system that stamps in whole seconds, and a `ROW_NUMBER` with ties broken
arbitrarily is arbitrary in exactly the way you were trying to avoid. If there is
any monotonic sequence available from the source, put it in the ordering. If
there isn't, that's worth knowing, because it means the source cannot tell you
which of two same-second updates came last, and no amount of care downstream will
recover the answer.

## Idempotent is not the same as order independent

This is the one I'd put money on being the actual cause, and it's the one whose
name misleads people.

Idempotency says applying the same operation twice has the same effect as once.
It says nothing at all about applying two different operations in different
orders. Those are separate properties, and a `MERGE` that satisfies the first can
violate the second badly.

Picture a key that gets updated twice on the same day, landing in two different
batches. Batch A carries the earlier version, batch B carries the later one. In
the normal run they process in order, B lands last, the table holds the current
value. Everything is fine.

Now the recovery case. Batch B ran, then something failed downstream, and you
re-run batch A to be safe. `WHEN MATCHED THEN UPDATE SET *` does exactly what it
says: it takes the source row and overwrites the target. The target now holds
batch A's older version. The merge was idempotent. Re-running it a third time
would produce the same wrong answer, which is precisely the property you asked
for.

The fix is to make the merge refuse to move backwards:

```sql
WHEN MATCHED AND s.updated_at > t.updated_at THEN UPDATE SET *
```

With that predicate, replaying an old batch over newer data becomes a no-op
instead of a regression, and the operation picks up the property you thought you
already had.

This is the clause I shipped without. Nothing broke, because the batches I was
handling arrived in order and the recovery path never ran against stale input.
That is a description of my luck, not of my design. The gap was invisible
precisely because the only thing that would expose it was the replay capability
the whole approach existed to provide, and I never had to use it. I would rather
have found this by reasoning about it, which is eventually what happened, than by
finding out which number moved.

Worth noting what this predicate assumes, since it inherits the previous
section's problem. It trusts `updated_at` to be a real version, monotonic per key
and generated by whoever owns the row. If it's the time your pipeline read the
record rather than the time the record changed, it is not a version and this
comparison will confidently do the wrong thing. A timestamp assigned by the
consumer tells you about the consumer.

## Replay only works if the input is pinned

The third one has nothing to do with the merge and everything to do with the word
"same."

A replayable job is one where running it again over the same input produces the
same output. That definition leans hard on "the same input," and a surprising
number of pipelines define their input relative to the moment they run:

```sql
WHERE created_at >= current_timestamp() - INTERVAL 1 DAY
```

Re-run that tomorrow and it reads a different set of rows. It isn't a replay of
yesterday's job, it's a new job that happens to share code. Rows that arrived
since are now included, and rows at the old boundary have fallen out. The merge
behaved perfectly and the result is still not what you were trying to reproduce.

The version that actually replays takes the window as a parameter, from the
orchestrator, and the orchestrator passes the same value on a retry that it
passed on the first attempt. Then a re-run is a re-run.

Late-arriving data sits in the same family of problems. If a record for Monday
shows up on Wednesday, a Monday-windowed job will never see it unless something
goes back for it. That's not an idempotency bug, but it presents as one, because
the symptom is the same: two runs that should have agreed and didn't. When a
number changes on re-processing, "did the input change" is a faster question to
answer than "is the merge correct," and it's more often the answer.

## Silver being correct does not make Gold correct

The last one is about scope, and it's the reason the totals moved rather than the
rows. This one I have not hit either, and I'm including it because it's the first
thing I'd check now and it would have taken me a while to think of before.

Fixing Silver fixes Silver. Whether that propagates depends entirely on how Gold
is built. If Gold is a full recomputation from Silver, it propagates and you're
done. If Gold is incremental, appending each batch's contribution to a running
aggregate, it doesn't, and re-running Silver makes Gold _more_ wrong, because the
contribution gets added a second time.

This is the same distinction as the naturally-idempotent operations question one
layer up. `SET total = <recomputed value>` converges. `SET total = total + x`
accumulates. A pipeline can be carefully idempotent at every write and still be
non-idempotent end to end, because the property doesn't compose upward on its
own. Each layer has to hold it, and the layer that quietly doesn't is usually an
aggregate someone made incremental for performance.

The tell is the shape of the discrepancy. Wrong row values point at the merge or
the ordering. Right rows with wrong totals point downstream, at something that
counted a batch twice.

## Where I'd start

If a total moved after a re-run, I'd go in this order, because it's cheapest
first and because the most likely cause is not the most interesting one.

First, compare the input. Re-read the window the failed run used and the window
the re-run used, count the rows, and check whether they're the same set. Most of
the time they aren't, and everything else is wasted effort until that's ruled
out.

Second, ask whether the layer that moved is recomputed or accumulated. If a total
changed while the underlying rows didn't, the answer is downstream and there's no
point examining the merge at all.

Third, look at the merge's `WHEN MATCHED` clause and see whether it can move a
row backwards. If there's no version predicate, it can, and the recovery path is
the exact situation that triggers it.

Only then the source batch and its duplicates, because Delta will usually have
told you about that one already by failing.

The general lesson I'd keep is that idempotency is a property of an operation,
and replayability is a property of a system. The second requires the first at
every layer, plus a pinned input, plus an ordering rule, and the word "idempotent"
covers only the first of those. Most pipelines that describe themselves as
replayable have verified one part and assumed the rest. Which is fine, right up
until the day you need to use it, and that day is always a bad day already.
