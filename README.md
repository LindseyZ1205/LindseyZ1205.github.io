# lindseyz1205.github.io

Personal site and notes. Built with [Astro](https://astro.build) on the
[AstroPaper](https://github.com/satnaing/astro-paper) theme, deployed to GitHub
Pages.

## Running it locally

```bash
npm install
npm run dev      # http://localhost:4321
```

| Command           | What it does                                                     |
| ----------------- | ---------------------------------------------------------------- |
| `npm run dev`     | Dev server with hot reload                                       |
| `npm run build`   | Type-check, build to `dist/`, generate the Pagefind search index |
| `npm run preview` | Serve the built `dist/` locally                                  |
| `npm run format`  | Format everything with Prettier                                  |
| `npm run lint`    | ESLint                                                           |

Run `npm run build` before pushing — the deploy workflow runs `astro check`, so a
type error in a config file or a bad frontmatter field fails the deploy.

## Writing a note

Create a `.md` or `.mdx` file in `src/content/posts/`. The filename becomes the
URL slug. Frontmatter:

```yaml
---
title: "Post title" # required
description: "One or two sentences." # required — used in previews and SEO
pubDatetime: 2026-09-09T12:00:00Z # required
modDatetime: 2026-09-10T09:00:00Z # optional, shows an "updated" date
tags: # optional, defaults to ["others"]
  - postgres
  - indexing
featured: false # optional, pins it to the homepage
draft: false # optional, true hides it from the build
---
```

The schema lives in [`src/content.config.ts`](src/content.config.ts) — the build
fails if a required field is missing, which is deliberate.

Files and folders starting with `_` are ignored by the content loader, so
`src/content/posts/_drafts/` is a safe place to park unfinished notes.

## Configuration

Nearly everything is in [`astro-paper.config.ts`](astro-paper.config.ts): site
title, description, social links, posts per page, and feature toggles.

- **Colors** — `src/styles/theme.css`
- **Layout and components** — `src/components/`, `src/layouts/`
- **Homepage intro** — `src/pages/index.astro`
- **About page** — `src/content/pages/about.md`

Theme documentation copied from AstroPaper lives in [`docs/astropaper/`](docs/astropaper/).
It is outside `src/content/`, so it is never published.

## Deployment

Pushing to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds the site and publishes it to GitHub Pages. Nothing to run by hand.

## License

Theme licensed under MIT by Sat Naing — see [LICENSE](LICENSE). Post content is
mine.
