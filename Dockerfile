FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:22-alpine
ENV NODE_ENV=production PORT=3100 DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
VOLUME ["/data"]
EXPOSE 3100
CMD ["node", "server/src/index.js"]
