#!/bin/bash

# ==============================================================================
# Deploy script for express-backend
# Builds, pushes to Artifact Registry, and deploys to Cloud Run
# ==============================================================================

set -euo pipefail

# Cleanup function
cleanup() {
  if [ -n "${DOCKER_CONFIG_DIR:-}" ] && [ -d "${DOCKER_CONFIG_DIR}" ]; then
    rm -rf "${DOCKER_CONFIG_DIR}"
  fi
}
trap cleanup EXIT

# ------------------------------------------------------------------------------
# Configuration (update these values)
# ------------------------------------------------------------------------------
#southamerica-east1-docker.pkg.dev/auramed-484205/auramed-artifact-registry
REPOSITORY_NAME="auramed-artifact-registry"
PROJECT_ID="auramed-484205"
REGION="southamerica-east1"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY_NAME}"
SERVICE_NAME="smartrooms-scraper-service"
IMAGE_NAME="smartrooms-scraper-image"
CONTAINER_PORT="3001"

# Generate a timestamp tag for versioning
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
IMAGE_TAG="${REGISTRY}/${IMAGE_NAME}"

echo "=============================================="
echo "🚀 Deploying ${SERVICE_NAME}"
echo "=============================================="
echo "Project:  ${PROJECT_ID}"
echo "Region:   ${REGION}"
echo "Image:    ${IMAGE_TAG}"
echo "Port:     ${CONTAINER_PORT}"
echo "=============================================="

# Step 1: Authenticate Docker with Artifact Registry (using temp config to avoid credHelper issues)
echo ""
echo "🔐 Configuring Docker authentication..."
DOCKER_CONFIG_DIR=$(mktemp -d)
export DOCKER_CONFIG="${DOCKER_CONFIG_DIR}"
gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin "https://${REGION}-docker.pkg.dev"

# Step 2: Build the Docker image
echo ""
echo "🔨 Building Docker image..."
docker build -t "${IMAGE_TAG}:${TIMESTAMP}" -t "${IMAGE_TAG}:latest" .

# Step 3: Push to Artifact Registry
echo ""
echo "📤 Pushing to Artifact Registry..."
docker push "${IMAGE_TAG}:${TIMESTAMP}"
docker push "${IMAGE_TAG}:latest"
