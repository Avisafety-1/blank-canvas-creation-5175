import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN || "https://1143658787c872b744efce0c8aea08fe@o4511049644376064.ingest.de.sentry.io/4511049650470992";

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    sampleRate: 1.0,
    tracePropagationTargets: ["localhost", /^https:\/\/avisafev2\.lovable\.app/],
    enabled: !!dsn,
  });
}

export { Sentry };
