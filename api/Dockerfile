# ---- API image: Node.js + Express ----
FROM node:22-alpine

# production mode: Express runs faster, npm skips dev dependencies
ENV NODE_ENV=production

WORKDIR /app

# copy package files first -> "npm ci" layer is cached as long as dependencies don't change
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js .

# the official node image already has a non-root user called "node"
USER node

EXPOSE 3000

# wget comes with alpine (busybox) - no need to install curl
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# run node directly (not "npm start") so node receives SIGTERM from docker
CMD ["node", "server.js"]
