export function getAppEnvironment(): string {
  return process.env.NODE_ENV || process.env.RAILWAY_ENVIRONMENT_NAME || 'development';
}

export function isProductionEnvironment(): boolean {
  return getAppEnvironment() === 'production';
}
