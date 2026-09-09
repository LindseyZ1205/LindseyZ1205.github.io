---
title: "Starting these notes"
description: "Why I'm writing things down in public, and what will end up here."
pubDatetime: 2026-09-09T12:00:00Z
tags:
  - meta
featured: true
---

I've been keeping notes in scratch files for a couple of years now. They work
fine until I need one of them again, at which point I discover that past-me
wrote three lines of shorthand that no longer mean anything.

So this is the fix: write it up properly, in public, where the cost of being
sloppy is visible.

## What goes here

Mostly the things I hit while building backend systems — the ones where the
documentation tells you _what_ the API does but not _why_ you'd reach for it,
or where the obvious approach turns out to be wrong for a reason nobody wrote
down.

Concretely, I expect that to mean:

- **Databases and query performance.** Execution plans, index design, and the
  gap between a query that works and a query that scales.
- **Distributed systems.** Consistency, failure modes, and what actually happens
  when a node stops answering.
- **Data platforms.** Pipeline design, idempotency, and schema evolution.
- **AWS.** Specific services, specific problems, and the parts of the pricing
  and permission models that surprised me.

## How I'm writing them

Each note is meant to stand on its own and be short enough to actually finish.
I'd rather publish something narrow and correct than a survey I stopped caring
about halfway through.

If I get something wrong here, I'd genuinely like to know — the contact links
are in the [about](/about) page.
