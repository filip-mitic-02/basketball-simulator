export function env(name) {
  const v = process.env[name];
  if (!v) throw new Error('Missing environment variable ' + name);
  return v;
}
export function baseUrl() {
  return env('BASE_URL').replace(/\/+$/, '');
}
export function isSecure() {
  return baseUrl().startsWith('https://');
}
