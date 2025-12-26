#!/bin/sh
set -e

# KubeUI installer script
# Usage: curl -sSL https://raw.githubusercontent.com/opengittr/kubeui/main/scripts/install.sh | sh

REPO="opengittr/kubeui"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="kubeui"

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Darwin)
            echo "darwin"
            ;;
        Linux)
            echo "linux"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "windows"
            ;;
        *)
            echo "Unsupported operating system: $(uname -s)" >&2
            exit 1
            ;;
    esac
}

# Detect architecture
detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64)
            echo "amd64"
            ;;
        arm64|aarch64)
            echo "arm64"
            ;;
        *)
            echo "Unsupported architecture: $(uname -m)" >&2
            exit 1
            ;;
    esac
}

# Get latest version from GitHub
get_latest_version() {
    curl -sSL "https://api.github.com/repos/${REPO}/releases/latest" | \
        grep '"tag_name":' | \
        sed -E 's/.*"([^"]+)".*/\1/'
}

main() {
    OS=$(detect_os)
    ARCH=$(detect_arch)
    VERSION=$(get_latest_version)

    if [ -z "$VERSION" ]; then
        echo "Error: Could not determine latest version" >&2
        exit 1
    fi

    echo "Installing KubeUI ${VERSION} for ${OS}/${ARCH}..."

    # Construct download URL
    if [ "$OS" = "windows" ]; then
        FILENAME="${BINARY_NAME}_${OS}_${ARCH}.zip"
    else
        FILENAME="${BINARY_NAME}_${OS}_${ARCH}.tar.gz"
    fi

    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${FILENAME}"

    # Create temp directory
    TMP_DIR=$(mktemp -d)
    trap "rm -rf ${TMP_DIR}" EXIT

    # Download
    echo "Downloading ${DOWNLOAD_URL}..."
    curl -sSL -o "${TMP_DIR}/${FILENAME}" "${DOWNLOAD_URL}"

    # Extract
    cd "${TMP_DIR}"
    if [ "$OS" = "windows" ]; then
        unzip -q "${FILENAME}"
    else
        tar -xzf "${FILENAME}"
    fi

    # Install
    if [ -w "${INSTALL_DIR}" ]; then
        mv "${BINARY_NAME}" "${INSTALL_DIR}/"
    else
        echo "Installing to ${INSTALL_DIR} (requires sudo)..."
        sudo mv "${BINARY_NAME}" "${INSTALL_DIR}/"
    fi

    chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

    echo ""
    echo "KubeUI ${VERSION} installed successfully!"
    echo ""
    echo "Run 'kubeui' to start the dashboard."
}

main
