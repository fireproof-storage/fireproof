#!/bin/bash
# Fireproof Cloud - Docker Startup Script
#
# Usage:
#   ./docker/start.sh          # Start all services (full Docker build)
#   ./docker/start.sh --infra  # Start infrastructure only (MinIO)
#   ./docker/start.sh --down   # Stop all services
#   ./docker/start.sh --clean  # Stop and remove volumes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Ensure .env exists
ensure_env() {
    if [ ! -f ".env" ]; then
        if [ -f ".env.docker" ]; then
            log_info "Creating .env from .env.docker..."
            cp .env.docker .env
        else
            log_error ".env.docker not found. Cannot create .env file."
            exit 1
        fi
    fi
}

# Start infrastructure only
start_infra() {
    log_info "Starting infrastructure services (MinIO)..."
    docker compose -f docker-compose.infra.yaml up -d

    log_info "Waiting for MinIO to be ready..."
    sleep 5

    echo ""
    log_info "Infrastructure is ready!"
    echo ""
    echo "MinIO Console: http://localhost:9001"
    echo "  Username: minioadmin"
    echo "  Password: minioadmin"
    echo ""
    echo "S3 Endpoint: http://localhost:9000"
    echo "  Bucket: testbucket"
    echo ""
    echo "To run services locally:"
    echo "  export STORAGE_URL=http://127.0.0.1:9000/testbucket"
    echo "  export ACCESS_KEY_ID=minioadmin"
    echo "  export SECRET_ACCESS_KEY=minioadmin"
    echo ""
}

# Start all services
start_all() {
    ensure_env

    log_info "Building and starting all Fireproof Cloud services..."
    log_warn "This may take several minutes on first run..."

    docker compose up --build -d

    log_info "Waiting for services to be ready..."

    # Wait for services
    echo -n "Waiting for cloud-backend"
    for i in {1..30}; do
        if curl -s http://localhost:8909/ > /dev/null 2>&1; then
            echo " ready!"
            break
        fi
        echo -n "."
        sleep 2
    done

    echo -n "Waiting for dashboard"
    for i in {1..30}; do
        if curl -s http://localhost:7370/ > /dev/null 2>&1; then
            echo " ready!"
            break
        fi
        echo -n "."
        sleep 2
    done

    echo -n "Waiting for proxy"
    for i in {1..30}; do
        if curl -s http://localhost:8080/proxy/health > /dev/null 2>&1; then
            echo " ready!"
            break
        fi
        echo -n "."
        sleep 2
    done

    echo ""
    log_info "Fireproof Cloud is ready!"
    echo ""
    echo "Proxy (primary entry point):"
    echo "  http://localhost:8080"
    echo ""
    echo "Direct access (debug):"
    echo "  Cloud Backend:  http://localhost:8909"
    echo "  Dashboard:      http://localhost:7370"
    echo ""
    echo "Logs:"
    echo "  docker compose logs -f"
    echo ""
}

# Stop services
stop_services() {
    log_info "Stopping services..."
    docker compose -f docker-compose.infra.yaml down 2>/dev/null || true
    docker compose down 2>/dev/null || true
    log_info "Services stopped."
}

# Clean up
clean_up() {
    log_info "Stopping services and removing volumes..."
    docker compose -f docker-compose.infra.yaml down -v 2>/dev/null || true
    docker compose down -v 2>/dev/null || true
    log_info "Cleanup complete."
}

# Main
case "${1:-}" in
    --infra|-i)
        start_infra
        ;;
    --down|-d)
        stop_services
        ;;
    --clean|-c)
        clean_up
        ;;
    --help|-h)
        echo "Fireproof Cloud Docker Startup Script"
        echo ""
        echo "Usage:"
        echo "  ./docker/start.sh          Start all services (full Docker build)"
        echo "  ./docker/start.sh --infra  Start infrastructure only (MinIO)"
        echo "  ./docker/start.sh --down   Stop all services"
        echo "  ./docker/start.sh --clean  Stop and remove volumes"
        echo "  ./docker/start.sh --help   Show this help"
        ;;
    *)
        start_all
        ;;
esac
