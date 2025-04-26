#!/bin/bash
set -e

# Configuration
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_USER=minioadmin
MINIO_PASSWORD=minioadmin
CONTAINER_NAME=fireproof-test-minio
BUCKET_NAME=testbucket

# Check for CI environment
if [ ! -z "${FP_CI}" ] || [ ! -z "${GITHUB_ACTIONS}" ]; then
  echo "Running in CI environment"
  # In CI, we assume Minio is already running on the standard port
  if [ ! -z "${CI_MINIO_ENDPOINT}" ]; then
    echo "Using Minio endpoint: ${CI_MINIO_ENDPOINT}"
    exit 0
  fi
  # If running in GitHub Actions, Minio is already started as a service container
  if [ ! -z "${GITHUB_ACTIONS}" ]; then
    echo "Using GitHub Actions service container for Minio"
    # Skip Docker operations and proceed to bucket creation
    # Install Minio Client if needed for bucket operations
    if ! command -v mc &> /dev/null; then
      echo "Installing Minio Client..."
      if [[ $(uname -m) == "aarch64" || $(uname -m) == "arm64" ]]; then
        curl -O https://dl.min.io/client/mc/release/linux-arm64/mc
      else
        curl -O https://dl.min.io/client/mc/release/linux-amd64/mc
      fi
      chmod +x mc
      export PATH=$PATH:.
    fi
    # Skip to bucket creation section
    goto_bucket_creation=true
  fi
fi

# Initialize goto_bucket_creation if not set
goto_bucket_creation=${goto_bucket_creation:-false}

# Only do Docker operations if we're not skipping to bucket creation
if [ "$goto_bucket_creation" != "true" ]; then
  # Check if container is already running
  if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
    echo "Minio container is already running"
  else
    echo "Starting Minio container..."
    docker run -d --rm --name $CONTAINER_NAME \
      -p $MINIO_PORT:9000 -p $MINIO_CONSOLE_PORT:9001 \
      -e "MINIO_ROOT_USER=$MINIO_USER" \
      -e "MINIO_ROOT_PASSWORD=$MINIO_PASSWORD" \
      quay.io/minio/minio server /data --console-address ":9001"

    # Wait for Minio to start up
    echo "Waiting for Minio to start..."
    for i in {1..10}; do
      if curl -s http://localhost:$MINIO_PORT/minio/health/live > /dev/null; then
        echo "Minio is up and running"
        break
      fi
      if [ $i -eq 10 ]; then
        echo "Minio failed to start in time"
        exit 1
      fi
      echo "Waiting... ($i/10)"
      sleep 1
    done
  fi
fi

# Create the test bucket
echo "Creating test bucket..."

# Install mc (Minio Client) if not installed
if ! command -v mc &> /dev/null; then
  if [ "$(uname)" == "Darwin" ]; then
    # macOS using docker
    docker run --rm -it --entrypoint="/bin/sh" -v "$PWD:/data" minio/mc -c \
      "mc alias set myminio http://host.docker.internal:9000 $MINIO_USER $MINIO_PASSWORD && \
       mc mb myminio/$BUCKET_NAME --ignore-existing"
  else
    # Linux using docker with network=host
    docker run --rm -it --network=host --entrypoint="/bin/sh" minio/mc -c \
      "mc alias set myminio http://localhost:9000 $MINIO_USER $MINIO_PASSWORD && \
       mc mb myminio/$BUCKET_NAME --ignore-existing"
  fi
else
  # If mc is installed locally, use it directly
  mc alias set myminio http://localhost:9000 $MINIO_USER $MINIO_PASSWORD
  mc mb myminio/$BUCKET_NAME --ignore-existing
fi

# Set public read/write policy
if command -v mc &> /dev/null; then
  mc policy set public myminio/$BUCKET_NAME || true
else
  if [ "$(uname)" == "Darwin" ]; then
    docker run --rm -it --entrypoint="/bin/sh" -v "$PWD:/data" minio/mc -c \
      "mc alias set myminio http://host.docker.internal:9000 $MINIO_USER $MINIO_PASSWORD && \
       mc policy set public myminio/$BUCKET_NAME"
  else
    docker run --rm -it --network=host --entrypoint="/bin/sh" minio/mc -c \
      "mc alias set myminio http://localhost:9000 $MINIO_USER $MINIO_PASSWORD && \
       mc policy set public myminio/$BUCKET_NAME"
  fi
fi

echo "Minio setup complete"
