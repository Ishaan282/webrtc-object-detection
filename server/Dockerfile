# Use Node.js 24 as the base image
FROM node:24

# Set working directory
WORKDIR /app

# Copy dependency files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your code
COPY . .

# Expose both ports your app uses
EXPOSE 3001
EXPOSE 9000

# Run your Node app
CMD ["node", "index.js"]
