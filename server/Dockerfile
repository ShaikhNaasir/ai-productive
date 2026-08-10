# Express API
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .
RUN npx prisma generate

ENV NODE_ENV=production
EXPOSE 4000

# Apply migrations then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
