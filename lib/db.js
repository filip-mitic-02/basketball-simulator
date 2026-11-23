import { neon } from '@neondatabase/serverless';
import { env } from './env.js';
let _sql;
// Tagged-template client: every value is sent as a bound parameter, never concatenated into SQL.
export function sql() {
  if (!_sql) _sql = neon(env('DATABASE_URL'));
  return _sql;
}
