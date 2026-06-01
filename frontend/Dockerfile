# Stage 1: Build the React application
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies using clean install
COPY package*.json ./
RUN npm ci

# Copy source and build static files
COPY . .
RUN npm run build

# Stage 2: Serve static files with Nginx
FROM nginx:alpine
# Copy built static files to default Nginx folder
COPY --from=build /app/dist /usr/share/nginx/html
# Copy custom Nginx routing config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
