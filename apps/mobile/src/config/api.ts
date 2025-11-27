import { Platform } from 'react-native';

/**
 * Centralized API endpoint configuration
 * 
 * Supports environment-based URLs:
 * - Development: localhost or emulator addresses
 * - Production: Azure Container Apps URL
 * 
 * Set EXPO_PUBLIC_API_URL environment variable to override defaults
 */
export const getApiBaseUrl = (): string => {
  // Check for explicit API URL override (useful for production)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Platform-specific defaults for development
  return Platform.select({
    web: 'http://localhost:3001',
    android: 'http://10.0.2.2:3001', // Android emulator special IP
    ios: 'http://localhost:3001',     // iOS simulator
    default: 'http://localhost:3001',
  }) || 'http://localhost:3001';
};

/**
 * Get the full API URL for a specific endpoint
 */
export const getApiUrl = (endpoint: string): string => {
  const baseUrl = getApiBaseUrl();
  // Remove leading slash from endpoint if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${baseUrl}/${cleanEndpoint}`;
};

// Export the base URL as a constant for backward compatibility
export const API_BASE = getApiBaseUrl();







