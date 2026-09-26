---
title: "At-least-once delivery means your consumer will process the same event twice"
description: "SQS, Kinesis, and DynamoDB Streams all guarantee at-least-once. That guarantee is a requirement on your consumer, not a promise you can ignore."
pubDatetime: 2026-09-27T13:00:00Z
tags:
  - backend
  - aws
  - idempotency
draft: false
---

Your event pipeline works. Then one day a counter is too high, or a user gets the
same notification twice, or a daily total is off by a few percent and you can't
reproduce it.

The cause is usually not a bug in your code. It's the delivery guarantee doing
exactly what it says, against a consumer that assumed something stronger.

## What the guarantee actually promises

SQS standard queues, Kinesis, and DynamoDB Streams are all **at-least-once**. The
plain-language version: _this event will be delivered. Possibly more than once._

Duplicates aren't a rare failure mode, they're normal operation. The common ways
one appears:

**The visibility timeout expires.** SQS hands your consumer a message and hides it
for, say, 30 seconds. If processing takes 35 seconds, the message becomes visible
again and another consumer picks it up while the first one is still working. Now
two consumers are processing the same event, and the first one's eventual delete
call arrives against a receipt handle that is no longer valid.

**The consumer crashes after the work, before the acknowledgement.** The database
write committed. The delete never ran. On redelivery, the write happens again.

**The producer retried.** A publish call timed out at the network layer and got
retried, but the original actually succeeded. Two distinct messages now carry the
same logical event.

Notice that the second one is unavoidable in principle. Between "do the work" and
"acknowledge the work" there is a window, and no amount of care closes it, because
any acknowledgement protocol has a last step that can fail. This is why
**exactly-once delivery doesn't exist** in the way people want it to. What systems
that advertise it actually provide is at-least-once delivery plus deduplication
somewhere, which is the same thing with the bookkeeping moved.

So the guarantee is really a requirement pointed at you: **make processing the
same event twice have the same effect as processing it once.** That property is
idempotency.

## Three ways to get idempotency

In rough order of how much machinery they need.

**Make the operation naturally idempotent.** Some writes already are. Setting a
status to `SHIPPED` twice leaves it `SHIPPED`. Writing a full row keyed by its own
identifier twice leaves one row. If you can express the change as _set this to
that_ rather than _adjust this by that_, you're finished and there's nothing to
maintain.

The trap is the other shape. `UPDATE counters SET views = views + 1` is not
idempotent and never will be, because it's defined relative to the current value.
Counters, balances, and append-only lists are the operations that need real work.

**Use a conditional write on a deduplication key.** Give every event a stable ID
from the producer, and make the first write of that ID the one that wins.

In DynamoDB that's a condition expression:

```python
table.put_item(
    Item={"event_id": event_id, "user_id": user_id, "processed_at": now},
    ConditionExpression="attribute_not_exists(event_id)",
)
```

A duplicate raises `ConditionalCheckFailedException`, which you catch and treat as
success, because it means the work was already done. In SQL the same idea is a
unique constraint on the event ID and catching the violation, or an
`INSERT ... ON CONFLICT DO NOTHING`.

Two details decide whether this actually works. The ID must come from the
**producer**, derived from the event's own content or a business key. If the
consumer generates it, a redelivery generates a different one and dedup does
nothing. And the dedup record must be written in the **same transaction** as the
effect it guards, or you get a crash window between "recorded that I did it" and
actually doing it.

**Upsert on a natural key.** For pipelines that rebuild state rather than react to
it, merge on a business key and let re-processing overwrite:

```sql
MERGE INTO silver.transactions AS t
USING staging.transactions AS s
ON t.transaction_id = s.transaction_id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *
```

This is the pattern I've leaned on most in batch work, because it gives you
something beyond duplicate safety: **the whole job becomes replayable.** A bad run
can be re-run over the same input and converge to the same state, which turns a
data incident from a forensic exercise into re-running yesterday's job.

## Retries, and why jitter is not optional

Once processing is idempotent, retrying becomes safe, and then you have to decide
how.

Retrying immediately is the wrong answer. If the downstream failed because it's
overloaded, an immediate retry adds load to the thing that's already failing.
**Exponential backoff** spaces attempts out: 1s, 2s, 4s, 8s, giving the dependency
room to recover.

Pure exponential backoff has a failure mode of its own though. If a dependency
drops for two seconds and a thousand consumers all fail together, they all back
off by the same schedule and all retry at the same instant. You've built a
synchronized load spike, and it can knock the dependency back down exactly as it's
recovering. **Jitter** breaks the alignment:

```python
delay = min(cap, base * 2 ** attempt)
delay = random.uniform(0, delay)          # full jitter
```

Also be deliberate about _what_ you retry. A 500 or a timeout is worth retrying.
A 400 means the request was malformed, and retrying it will produce the same 400
forever while consuming your retry budget. Retry transient failures; fail
permanent ones immediately.

## The dead letter queue is not a graveyard

After N failed attempts a message goes to a **dead letter queue**, which exists so
one bad message can't block a partition or consume infinite retries. A **poison
message** is the classic case: an event your code cannot process, which without a
DLQ retries forever.

The mistake I'd warn about is treating the DLQ as where failures go to be
forgotten. A queue nobody watches is a silent data loss channel that happens to
have durable storage.

Two things make it useful instead. **Alarm on depth greater than zero**, not on
some threshold, because the normal value is zero and anything else is a question
that needs answering. And **keep the failure context** with the message, the
exception and the attempt count, so that triage doesn't start by trying to
reproduce the failure from the payload alone.

Then a DLQ with idempotent consumers gives you a real recovery story: fix the bug,
redrive the queue, and re-processing is safe because re-processing was always
safe.

## The part worth keeping

Most of this collapses into one idea. **The delivery guarantee your queue offers
is a statement about what your consumer has to tolerate**, not a feature you
consume. At-least-once means duplicates are a normal input, the same way an empty
list is a normal input.

Which reframes the design question usefully. Instead of "how do I stop duplicates
from reaching me," which has no answer, you ask "what is the key that makes this
event the same event," and then everything else, dedup, retries, replay, follows
from having named it.
