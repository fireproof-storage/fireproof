FROM public.ecr.aws/lambda/nodejs:22

# Install Playwright system dependencies
RUN dnf install -y \
    atk \
    cups-libs \
    gtk3 \
    libXcomposite \
    alsa-lib \
    libXdamage \
    libXrandr \
    pango \
    at-spi2-atk \
    libXScrnSaver \
    libdrm \
    mesa-libgbm \
    libxshmfence \
    nss \
    nspr \
    dbus-libs \
    liberation-fonts \
    libX11 \
    libXext \
    libXrender \
    libXt \
    libXtst \
    && dnf clean all

# Set working directory
WORKDIR ${LAMBDA_TASK_ROOT}

# Copy everything needed
COPY package.json ./
COPY tsconfig.json ./
COPY src/ ./src/

RUN npm install
RUN npm run build
RUN ls -la ; cp -pr dist/* .

# Install Playwright browsers
RUN npx playwright install chromium

# Set the CMD to your handler
CMD [ "index.handler" ]
