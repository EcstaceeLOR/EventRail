FROM node:24.8.0-alpine3.22 AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN if find apps -path '*/.next/static/*' -name '*.map' -print -quit | grep -q .; then echo "browser source maps must not ship"; exit 1; fi

FROM node:24.8.0-alpine3.22 AS runtime

ARG RELEASE_VERSION=development
LABEL org.opencontainers.image.source="https://github.com/EcstaceeLOR/EventRail" \
      org.opencontainers.image.revision=$RELEASE_VERSION \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV RELEASE_VERSION=$RELEASE_VERSION
ENV COMPONENT=gateway
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY --from=build --chown=node:node /workspace /workspace
USER node
EXPOSE 3000 3001 3002 4000
STOPSIGNAL SIGTERM

ENTRYPOINT ["node", "scripts/container-entrypoint.mjs"]
