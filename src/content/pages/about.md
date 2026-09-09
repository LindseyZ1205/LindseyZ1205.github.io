---
title: "About"
description: "Lindsey Zhang — backend engineer, M.S. Computer Science at Northeastern University."
---

I'm Lindsey Zhang, a backend engineer based in the U.S. and an M.S. Computer
Science student at Northeastern University (Sep 2024 – Dec 2027).

## What I've been working on

**Amazon Web Services** — Software Development Engineer Intern, Summer 2026,
New York. I worked on AWS Quick, Amazon's agentic AI companion for research and
business automation, and owned the sharing feature for Workstream end to end:
shipping it across web and desktop codebases that had historically diverged.

The interesting constraint was that a shared dashboard has to stay exactly what
the sender saw. I designed the share path as a URL-shortener pattern — short
codes keying HTML snapshots in S3, served through CloudFront with Origin Access
Control, bucket fully private — and froze each dashboard as an immutable
point-in-time snapshot rather than a live view, so later agent activity could
never leak into what a recipient sees. Hardening the export for public serving
meant stripping scripts and event handlers to render the files inert, escaping
user input, and enforcing size caps on both ends.

**EasyScaleCloud** — Software Engineer Intern, Summer 2025. Built a four-layer
medallion data lake on S3 consolidating five source systems, with Python/Polars
ETL on Lambda, orchestrated by Step Functions and EventBridge. Mixed ingestion
cadences in one pipeline, with Delta Lake `MERGE` for idempotent upserts. Added
PII masking and column-level access control through Lake Formation to meet audit
requirements.

**Terra Byte X** — Software Engineer Intern, 2024. Primary backend developer on
an e-learning recommendation platform: Python/FastAPI microservices over
MongoDB, Redis, and AWS serverless. Cut average API latency from 320ms to 150ms
with write-through caching and connection pooling, and eliminated collection
scans by reworking aggregation pipelines and indexes.

## What I work with

**Languages** — Python, Java, TypeScript, JavaScript, Go

**Backend** — FastAPI, Spring Boot, Django, Express.js, Node.js

**Data & infra** — PostgreSQL, MongoDB, Redis, Elasticsearch, Delta Lake, Docker,
Kubernetes

**AWS** — S3, Lambda, CloudFront, Step Functions, EventBridge, DynamoDB, SQS,
API Gateway, RDS, IAM, Lake Formation, Glue Data Catalog, Athena

## About this site

This is where I write things down properly instead of leaving them in scratch
files — notes on backend engineering, distributed systems, data platforms, and
whatever I'm currently reading about. Writing something up is how I find out
whether I actually understood it.

## Get in touch

I'm open to backend, distributed systems, and data infrastructure roles. The
fastest way to reach me is [email](mailto:lindseyzh365@gmail.com), and you can
also find me on [GitHub](https://github.com/LindseyZ1205) and
[LinkedIn](https://www.linkedin.com/in/yingzi-zhang-sde/).
