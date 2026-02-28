# build
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Serve 
FROM nginx:alpine

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# nginx default port is 80
EXPOSE 80
