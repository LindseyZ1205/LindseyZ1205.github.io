import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://lindseyz1205.github.io/",
    title: "Lindsey Zhang",
    description:
      "Backend engineer working on AWS. Notes on distributed systems, data platforms, and the parts of software AI does not do for you.",
    author: "Lindsey Zhang",
    profile: "https://lindseyz1205.github.io/",
    ogImage: "default-og.jpg",
    lang: "en",
    timezone: "America/New_York",
    dir: "ltr",
  },
  posts: {
    perPage: 6,
    perIndex: 4,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: true,
    showBackButton: true,
    editPost: {
      enabled: false,
    },
    search: "pagefind",
  },
  socials: [
    { name: "github", url: "https://github.com/LindseyZ1205" },
    { name: "linkedin", url: "https://www.linkedin.com/in/yingzi-zhang-sde/" },
    { name: "mail", url: "mailto:lindseyzh365@gmail.com" },
  ],
  shareLinks: [
    { name: "linkedin", url: "https://www.linkedin.com/sharing/share-offsite/?url=" },
    { name: "x", url: "https://x.com/intent/post?url=" },
    { name: "mail", url: "mailto:?subject=See%20this%20post&body=" },
  ],
});
