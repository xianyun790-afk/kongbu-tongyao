FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY scripts ./scripts
COPY config ./config
ENV DINING_BIND_HOST=0.0.0.0 DINING_PUBLIC_PORT=4185
USER node
EXPOSE 4185
CMD ["node", "scripts/dining-public-server.mjs"]
