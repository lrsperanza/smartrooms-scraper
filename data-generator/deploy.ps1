# ==============================================================================
# Deploy script for express-backend
# Builds and pushes to Artifact Registry
# ==============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ------------------------------------------------------------------------------
# Configuration (update these values)
# ------------------------------------------------------------------------------
# southamerica-east1-docker.pkg.dev/auramed-484205/auramed-artifact-registry
$REPOSITORY_NAME = "auramed-artifact-registry"
$PROJECT_ID = "auramed-484205"
$REGION = "southamerica-east1"
$REGISTRY = "$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY_NAME"
$SERVICE_NAME = "smartrooms-scraper-service"
$IMAGE_NAME = "smartrooms-scraper-image"
$CONTAINER_PORT = "3001"

# Generate a timestamp tag for versioning
$TIMESTAMP = Get-Date -Format "yyyyMMdd-HHmmss"
$IMAGE_TAG = "$REGISTRY/$IMAGE_NAME"

Write-Host "=============================================="
Write-Host "Deploying $SERVICE_NAME"
Write-Host "=============================================="
Write-Host "Project:  $PROJECT_ID"
Write-Host "Region:   $REGION"
Write-Host "Image:    $IMAGE_TAG"
Write-Host "Port:     $CONTAINER_PORT"
Write-Host "=============================================="

$dockerConfigDir = $null
$previousDockerConfig = $env:DOCKER_CONFIG

try {
    # Step 1: Authenticate Docker with Artifact Registry (using temp config to avoid credHelper issues)
    Write-Host ""
    Write-Host "Configuring Docker authentication..."
    $dockerConfigDir = Join-Path ([System.IO.Path]::GetTempPath()) ("docker-config-" + [System.IO.Path]::GetRandomFileName())
    New-Item -ItemType Directory -Path $dockerConfigDir | Out-Null
    $env:DOCKER_CONFIG = $dockerConfigDir

    gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin "https://$REGION-docker.pkg.dev"

    # Step 2: Build the Docker image
    Write-Host ""
    Write-Host "Building Docker image..."
    docker build -t "$IMAGE_TAG`:$TIMESTAMP" -t "$IMAGE_TAG`:latest" .

    # Step 3: Push to Artifact Registry
    Write-Host ""
    Write-Host "Pushing to Artifact Registry..."
    docker push "$IMAGE_TAG`:$TIMESTAMP"
    docker push "$IMAGE_TAG`:latest"
}
finally {
    if ([string]::IsNullOrWhiteSpace($previousDockerConfig)) {
        Remove-Item Env:DOCKER_CONFIG -ErrorAction SilentlyContinue
    }
    else {
        $env:DOCKER_CONFIG = $previousDockerConfig
    }

    if ($null -ne $dockerConfigDir -and (Test-Path -Path $dockerConfigDir)) {
        Remove-Item -Path $dockerConfigDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
