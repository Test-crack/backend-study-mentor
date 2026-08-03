// Express 5's ParamsDictionary types every route param as `string | string[]`,
// since path-to-regexp now allows repeated/wildcard segments (e.g. `:id+`) to
// produce arrays. None of this app's routes use those, so a param is always a
// single string at runtime — this narrows the type without changing behavior.
export function paramStr(value: string | string[]): string {
    return Array.isArray(value) ? value[0] : value;
}
