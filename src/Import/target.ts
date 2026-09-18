/**
 * Choosing which database to write to.
 *
 * The brief is explicit that the target must be a parameter and never hardcoded: one
 * script points at dev or prod depending on how it is invoked, rather than two copies
 * of a script or an edit-before-you-run ritual.
 *
 * So `--target` is REQUIRED. It is not defaulted to dev, because a default is exactly
 * the thing that gets forgotten on the run that mattered.
 *
 * ## The name check
 *
 * Naming a target is not the same as being connected to it. The connection string comes
 * from the environment, and in this project it points through an SSH tunnel at
 * `localhost:5433` — the port says nothing about which database is on the other end, and
 * the checked-in `.env` has a password containing the word "prod" while addressing
 * `testcrack_db_dev`. Reading "prod" somewhere in a URL proves nothing either way.
 *
 * Therefore: the database NAME in the resolved URL must equal the name expected for the
 * named target, or the run is refused. Saying `--target dev` while the tunnel actually
 * points at `testcrack_db_main` is the single most expensive mistake available here, and
 * it is cheap to make it impossible.
 */

export type TargetName = 'dev' | 'prod';

/** Database names from the task brief. */
export const DATABASE_FOR_TARGET: Record<TargetName, string> = {
  dev: 'testcrack_db_dev',
  prod: 'testcrack_db_main',
};

/** Env var consulted first for each target, so the two can be configured separately. */
export const ENV_VAR_FOR_TARGET: Record<TargetName, string> = {
  dev: 'DATABASE_URL_DEV',
  prod: 'DATABASE_URL_PROD',
};

export function parseTarget(raw: string): TargetName | null {
  const value = raw.trim().toLowerCase();
  return value === 'dev' || value === 'prod' ? value : null;
}

/**
 * Extract the database name from a Postgres URL.
 *
 * Hand-parsed rather than passed to `new URL()`: these connection strings routinely
 * contain an unescaped `@` inside the password (the checked-in one does), which makes
 * `URL` throw or mis-split the authority. Only the path segment is needed, so take the
 * text between the last `/` and any `?`.
 */
export function databaseNameFromUrl(url: string): string | null {
  const withoutQuery = url.split('?')[0];
  const lastSlash = withoutQuery.lastIndexOf('/');
  if (lastSlash === -1 || lastSlash === withoutQuery.length - 1) return null;
  const name = withoutQuery.slice(lastSlash + 1).trim();
  return name === '' ? null : name;
}

/** A URL with the credentials replaced, safe to print in a log or paste to a reviewer. */
export function redactUrl(url: string): string {
  const schemeEnd = url.indexOf('://');
  if (schemeEnd === -1) return '(unparseable connection string)';
  const scheme = url.slice(0, schemeEnd);
  const rest = url.slice(schemeEnd + 3);
  const lastAt = rest.lastIndexOf('@');
  const hostAndPath = lastAt === -1 ? rest : rest.slice(lastAt + 1);
  return `${scheme}://***@${hostAndPath}`;
}

export interface ResolvedTarget {
  target: TargetName;
  url: string;
  databaseName: string;
  /** Which environment variable the URL came from. */
  source: string;
}

export class TargetError extends Error {}

/**
 * Resolve a target to a connection string, refusing anything ambiguous.
 *
 * `explicitUrl` (from `--database-url`) wins, for one-off connections that have no env
 * var — but it is name-checked exactly the same way. An override is a reason to be more
 * careful, not less.
 */
export function resolveTarget(
  target: TargetName,
  env: Record<string, string | undefined>,
  explicitUrl?: string,
): ResolvedTarget {
  const expected = DATABASE_FOR_TARGET[target];
  const envVar = ENV_VAR_FOR_TARGET[target];

  let url: string | undefined;
  let source: string;

  if (explicitUrl !== undefined && explicitUrl.trim() !== '') {
    url = explicitUrl.trim();
    source = '--database-url';
  } else if (env[envVar] !== undefined && env[envVar]!.trim() !== '') {
    url = env[envVar]!.trim();
    source = envVar;
  } else if (env.DATABASE_URL !== undefined && env.DATABASE_URL.trim() !== '') {
    url = env.DATABASE_URL.trim();
    source = 'DATABASE_URL';
  } else {
    throw new TargetError(
      `No connection string for --target ${target}.\n` +
        `  Set ${envVar} (preferred), or DATABASE_URL, or pass --database-url.`,
    );
  }

  const databaseName = databaseNameFromUrl(url);
  if (databaseName === null) {
    throw new TargetError(
      `Could not read a database name out of the connection string from ${source}.\n` +
        `  Got: ${redactUrl(url)}`,
    );
  }

  if (databaseName !== expected) {
    throw new TargetError(
      `REFUSING TO RUN — the connection does not point at the target you named.\n` +
        `  --target ${target} expects the database "${expected}".\n` +
        `  ${source} actually points at "${databaseName}"  (${redactUrl(url)})\n` +
        `  Either the tunnel is pointed somewhere else, or the wrong target was named.\n` +
        `  Nothing was read or written.`,
    );
  }

  return { target, url, databaseName, source };
}
