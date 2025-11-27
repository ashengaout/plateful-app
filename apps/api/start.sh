#!/bin/bash
# Startup script for Azure App Service
# Ensures node_modules are available and shared package is present

cd /home/site/wwwroot

echo "Checking for node_modules..."

# First, try to extract from tar.gz if it exists (Azure's optimization)
if [ -f "node_modules.tar.gz" ] && [ ! -d "node_modules" ]; then
    echo "Found node_modules.tar.gz, extracting..."
    tar -xzf node_modules.tar.gz -C /node_modules 2>/dev/null
    if [ -d "/node_modules" ]; then
        echo "Creating symlink to /node_modules..."
        ln -sfn /node_modules ./node_modules
    fi
fi

# If node_modules still doesn't exist or is incomplete, install dependencies
if [ ! -d "node_modules" ] || [ ! -d "node_modules/hono" ]; then
    echo "node_modules missing or incomplete, installing dependencies..."
    npm install --production --legacy-peer-deps --no-audit --no-fund
fi

# Ensure @plateful/shared is present (local workspace package)
if [ ! -d "node_modules/@plateful/shared" ]; then
    echo "Copying @plateful/shared package..."
    mkdir -p node_modules/@plateful
    if [ -d "dist/packages/shared" ]; then
        cp -r dist/packages/shared node_modules/@plateful/shared
        # Also copy package.json if it exists in the dist
        if [ -f "dist/packages/shared/package.json" ]; then
            cp dist/packages/shared/package.json node_modules/@plateful/shared/
        fi
    fi
fi

# Verify critical dependencies
if [ ! -d "node_modules/hono" ]; then
    echo "ERROR: hono still not found after installation!"
    echo "Listing node_modules contents:"
    ls -la node_modules/ | head -20
    exit 1
fi

echo "✅ Dependencies verified. Starting application..."
exec npm start

