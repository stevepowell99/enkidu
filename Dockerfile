FROM node:18-slim

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy app
COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]


