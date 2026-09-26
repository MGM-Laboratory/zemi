import { bucket, defineRailway, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "asia-southeast1-eqsg3a" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "asia-southeast1-eqsg3a", sizeMB: 5000 });
  const zemiMedia = bucket("zemi-media", { region: "sin" });
  const api = service("api", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "apps/api/Dockerfile" },
    healthcheck: "/api/v1/health",
    healthcheckTimeout: 180,
    replicas: { "asia-southeast1-eqsg3a": 1 },
    env: { APP_SECRET: preserve(), CLIENT_IP_HEADER: preserve(), DATABASE_URL: preserve(), HOST: preserve(), MAIL_FROM: preserve(), MEDIA_API_URL: preserve(), MEDIA_HLS_URL: preserve(), MEDIA_INTERNAL_SECRET: preserve(), MIGRATE_ON_BOOT: preserve(), NODE_ENV: preserve(), PORT: preserve(), PUBLIC_API_URL: preserve(), PUBLIC_WEB_URL: preserve(), REVALIDATE_SECRET: preserve(), RTMP_PUBLIC_URL: preserve(), S3_ACCESS_KEY_ID: preserve(), S3_AUTO_CREATE_BUCKET: preserve(), S3_BUCKET: preserve(), S3_ENDPOINT: preserve(), S3_FORCE_PATH_STYLE: preserve(), S3_REGION: preserve(), S3_SECRET_ACCESS_KEY: preserve(), SUPERADMIN_PASSPHRASE: preserve(), TRUST_PROXY: preserve(), WEB_ORIGIN: preserve(), WEB_REVALIDATE_URL: preserve() },
  });
  const web = service("web", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "apps/web/Dockerfile" },
    healthcheck: "/",
    healthcheckTimeout: 180,
    replicas: { "asia-southeast1-eqsg3a": 1 },
    env: { API_INTERNAL_URL: preserve(), NEXT_PUBLIC_API_PUBLIC_URL: preserve(), NEXT_PUBLIC_SITE_URL: preserve(), NEXT_TELEMETRY_DISABLED: preserve(), PORT: preserve(), REVALIDATE_SECRET: preserve(), SITE_INDEXING: preserve() },
  });
  const media = service("media", {
    replicas: { "asia-southeast1-eqsg3a": 1 },
    networking: { tcpProxies: { "1935": {} } },
    env: { MEDIA_INTERNAL_SECRET: preserve(), ZEMI_API_INTERNAL_URL: preserve() },
  });

  return project("zemi", {
    resources: [api, Postgres, web, media, postgresVolume, zemiMedia],
  });
});
