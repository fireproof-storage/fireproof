FROM node:22-alpine

# Install npm-register globally
RUN npm install -g npm-register

# Create directory for registry data
RUN mkdir -p /registry
WORKDIR /registry

# Expose default port
EXPOSE 8080

# Start npm-register
CMD ["npm-register"]
