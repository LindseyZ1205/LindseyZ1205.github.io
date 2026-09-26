---
title: "A 90% cache hit rate and the API is still slow. Look at your connection pool."
description: "Caching removes repeated work. Connection pooling removes per-request setup. They fix different halves of your latency, and a cache cannot touch the half it doesn't own."
pubDatetime: 2026-09-26T13:00:00Z
tags:
  - backend
  - redis
  - caching
draft: false
---

You added Redis in front of the expensive query. The hit rate is sitting at 90%.
Average latency barely moved.

This is a common shape, and it usually means the thing you cached was never the
whole cost. It helps to split request latency into two parts that behave
completely differently:

**Variable cost** scales with how much work the request does. Running an
aggregation, scanning a collection, computing a recommendation. A cache attacks
this directly, because a cache hit means the work doesn't happen.

**Fixed cost** is paid by every request regardless of what it asks for. Opening a
connection, the TLS handshake, authentication, serialization, network round
trips. **A cache hit still pays all of it.**

So if your fixed cost is 100ms and your variable cost is 200ms, a perfect cache
takes you from 300ms to 100ms and then stops. Every further point of hit rate buys
you nothing, because there's nothing left in the half you own.

## Where the fixed cost actually goes

The usual culprit is that a new database connection is being established per
request.

Opening a connection to MongoDB or PostgreSQL is not cheap. There's a TCP
handshake, usually a TLS handshake on top of it, then authentication, then for
some drivers a round of server discovery. That's several network round trips
before your query has been sent. On a managed database in the same region you're
looking at tens of milliseconds. Across regions it's much worse.

A **connection pool** keeps a set of established connections open and hands one
out per request. The handshake cost is paid once at startup and amortized across
every request afterwards.

Most drivers pool by default _if you reuse the client object_. The bug is almost
always that the client is being constructed inside the request handler:

```python
# Every request builds a new client, and the pool it owns dies with it.
@app.get("/recommendations/{user_id}")
async def get_recommendations(user_id: str):
    client = AsyncIOMotorClient(MONGO_URI)
    ...

# One client for the process lifetime. The pool is reused.
client = AsyncIOMotorClient(MONGO_URI, maxPoolSize=50)

@app.get("/recommendations/{user_id}")
async def get_recommendations(user_id: str):
    ...
```

In serverless this gets subtler: the client has to live outside the handler
function so it survives between warm invocations, and you still pay the full
handshake on every cold start.

**How to tell this is your problem:** time the query at the database and compare
it to the latency your service reports. If the database says 5ms and your service
says 80ms, the missing 75ms is not query time and no cache will remove it.

## Now the cache half: which strategy

Assuming you do have real variable cost worth caching, the next question is how
writes interact with it. This is where most cache bugs live.

**Cache-aside** (also called lazy loading) is the default. The application checks
the cache; on a miss it reads the database and populates the cache. Writes go to
the database and then delete the cached key.

Its properties follow from that shape. The cache only ever holds data somebody
actually asked for, so it stays small. But every miss costs a full round trip plus
a populate, and there's a well-known race: a read that misses can write a stale
value into the cache after a concurrent write has already invalidated it.

**Write-through** puts the cache in the write path. A write goes to the cache and
the database together, so the cached value for any written key is current by
construction.

That buys simpler reasoning. There is no invalidate step to forget, and no window
where the cache holds a value the database has already replaced. You pay for it in
two places: writes get slower because they do two things instead of one, and the
cache fills with keys that may never be read.

**The choice is about your write path, not your reads.** Write-through earns its
cost when written data is read soon and often after being written, because then
the cache pollution isn't pollution. Cache-aside is the better default when your
write set is much larger than your read set, since there's no reason to cache
something nobody will request.

I've used write-through on a recommendation service, where the shape fit: results
were computed, stored, and then read repeatedly by the same user over a session.
Precomputing into the cache meant the first read after a write was a hit rather
than a miss.

## TTL and LRU solve different problems

These get used interchangeably and they are not interchangeable.

**TTL bounds staleness.** It's a correctness knob. It answers "how wrong is this
value allowed to get before we refuse to serve it."

**LRU bounds memory.** It's a capacity knob. It answers "when we run out of room,
what gets thrown away."

You generally want both, because a cache with only LRU will happily serve a
three-week-old value that survived because it stays popular, and a cache with only
TTL will run out of memory and start rejecting writes.

In Redis these are set in different places, which is a useful reminder that
they're different mechanisms. TTL is per key, at write time:

```python
r.set(f"rec:{user_id}", payload, ex=300)   # expire in 5 minutes
```

Eviction is server-wide configuration:

```
maxmemory 2gb
maxmemory-policy allkeys-lru
```

That policy choice matters more than people expect. The default in many setups is
`noeviction`, which means once you hit `maxmemory`, **writes start failing**
rather than old keys being dropped. If your cache "stopped working" under load and
the errors look like write rejections, check this first.

## What a cache genuinely cannot fix

Worth stating plainly, since it's the assumption underneath a lot of wasted
effort.

A cache does not fix a slow query, it hides it from the requests that hit. The
misses still pay full price, and so does everything after a deployment, a restart,
or an eviction sweep. If the underlying query takes two seconds, your p99 is still
two seconds and your cold-start behavior is still bad.

Fix the query first. An index that takes a query from 400ms to 4ms improves every
request including the misses, and then the cache is making something fast even
faster instead of papering over something slow.

The ordering I'd suggest: **measure where the time actually goes, remove fixed
cost, fix the underlying query, then cache.** Caching first is tempting because
it's the change you can make without understanding the problem, and that's exactly
why it so often produces a great hit rate and a disappointing graph.
