# Use Playwright's official image (includes browsers)
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript (if needed)
RUN npm run build || true

# BC permanent Pacific Time (UTC-7); Etc/GMT+7 = UTC-7
ENV TZ=Etc/GMT+7

# Default command - start the scheduler
CMD ["npx", "ts-node", "src/scheduler.ts", "start"]
