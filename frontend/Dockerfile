# Use Node.js 24 as the base image
FROM node:24

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock/pnpm-lock.yaml if used)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of the app
COPY . .

# Expose port 3000 (adjust if your app uses a different port)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
