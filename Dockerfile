# Use official Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (only production)
RUN npm ci --only=production

# Copy build output and public assets
COPY .next/ .next/
COPY public/ public/
COPY next.config.ts ./
COPY .env.production ./

# Expose port (default Next.js)
EXPOSE 3000

# Start Next.js app
CMD ["npm", "start"]
