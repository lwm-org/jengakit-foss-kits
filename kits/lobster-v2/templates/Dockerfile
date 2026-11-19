FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json .
RUN npm install --omit=dev && npm cache clean --force
COPY . .
ENV ASSISTANT_NAME=Lobster
ENV LOBSTER_AUTONOMY=supervised
EXPOSE 3000
CMD ["node", "server.js"]
