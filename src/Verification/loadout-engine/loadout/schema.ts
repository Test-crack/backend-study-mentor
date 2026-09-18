/**
 * The shape of a loadout: everything about one exam's CSV that Layer 1 needs,
 * expressed as data.
 *
 * Finding codes and severities are not here — they live in engine/findings.ts so
 * a loadout cannot invent a code or downgrade a failure.
 *
 * Rows in one file can differ from each other (a Mock file mixes MCQ, TFNG and
 * prompt rows), so a column says when it applies, when it must be blank, and can
 * carry `variants` when its rules depend on another column.
 */

/**
 * Codes a structured column raises. Listed per column because the drills codes
 * mix singular and plural (OPTIONS_EMPTY vs OPTION_VALUE_EMPTY) — no naming rule
 * derives them.
 */
export interface ColumnCodes {
  empty?: string;
  notJson?: string;
  notObject?: string;
  keysWrong?: string;
  valueNotString?: string;
  valueEmpty?: string;
  valueDuplicate?: string;
  notString?: string;
  notAllowed?: string;
}

/** A condition on another column's (normalized) value. */
export interface WhenClause {
  column: string;
  in: string[];
}

/** One way of validating a column. With variants, the first matching `when` wins. */
export interface ColumnVariant {
  when?: WhenClause;
  kind: 'enum' | 'text' | 'json_object' | 'json_string_enum' | 'loose_enum' | 'number';

  /** number: inclusive bounds, and the codes for missing / out-of-range. */
  min?: number;
  max?: number;
  missingCode?: string;
  outOfRangeCode?: string;

  /** enum / loose_enum: the members a cell may normalize to. */
  members?: string[];
  invalidCode?: string;
  /** enum: a blank cell is legal (Mock's exam_type defaults at the DB layer). */
  blankAllowed?: boolean;

  /** text */
  requireNonEmpty?: boolean;
  emptyCode?: string;

  /** json_object */
  requiredKeys?: string[];
  requireNonEmptyValues?: boolean;
  requireUniqueValues?: boolean;

  /** json_string_enum / loose_enum: values the parsed string may take. */
  allowed?: string[];
  /**
   * loose_enum. Default true: accepts `A` and `"A"`. Diagnostic sets false —
   * its column is a plain varchar, so only the bare form is valid.
   */
  parseJson?: boolean;
  /** Clause appended to the not-valid-JSON message. `{first}` = first allowed value. */
  notJsonHint?: string;
  /**
   * loose_enum accepts a bare `T` as well as a quoted `"T"`. Mock's TFNG answers
   * are written both ways in real content, and both reach the database the same.
   */
  codes?: ColumnCodes;
}

export interface LoadoutColumn extends ColumnVariant {
  name: string;
  /** Per-kind validation, when one column means different things in different rows. */
  variants?: ColumnVariant[];
  /** The column is only checked at all when this matches. */
  appliesWhen?: WhenClause;
  /** The column must be BLANK when this matches. */
  forbiddenWhen?: WhenClause;
  forbiddenCode?: string;
  /** Overrides the default "<column> is filled in, but not allowed here." prose. */
  forbiddenMessage?: string;
}

/** Which dimensions must appear in the filename, and how to phrase it when one doesn't. */
export interface FilenameCheck {
  dimension: string;
  onMissing: 'nameOther' | 'contradictOrUndetermined';
}

export interface DuplicateIdentityPart {
  column: string;
  normalize: 'foldCase' | 'optionSignature';
}

/**
 * A constraint between two columns, checked per ROW rather than per bucket.
 *
 * Mock needs this for "question_type must be one its skill actually has", which
 * is not a bucket property — question_type varies within a single file.
 */
export interface RowAllowList {
  keyColumn: string;
  valueColumn: string;
  allowed: Record<string, string[]>;
  code: string;
}

/**
 * A column whose legal values, and whether it may be filled at all, depend on
 * another column. Mock's `task_type` is required for prompt rows, must be blank
 * for everything else, and takes different values for Writing than Speaking.
 */
export interface ConditionalColumn {
  column: string;
  byColumn: string;
  allowed: Record<string, string[]>;
  codes: { required: string; invalid: string; notAllowed: string };
}

export interface Loadout {
  id: string;
  label: string;

  /** Ordered — this is the expected CSV header. */
  columns: LoadoutColumn[];

  sourceKeyColumn: string;
  embeddedHeaderThreshold: number;

  /**
   * Optional: Diagnostic has no bucket at all. Its CSVs are one staging batch
   * rather than one file per (skill, sub_skill, …) combination, so there is
   * nothing for a file to be uniform about and no filename to cross-check.
   */
  bucket?: {
    dimensions: string[];
    allowList?: {
      keyDimension: string;
      valueDimension: string;
      allowed: Record<string, string[]>;
      invalidCode: string;
    };
  };

  rowAllowList?: RowAllowList;
  conditionalColumns?: ConditionalColumn[];

  /**
   * The order row-level check groups run in, because the forks disagree.
   * Drills validates structured columns before free text; Mock does the reverse.
   * Finding order is part of what parity compares, so it has to be declared
   * rather than assumed.
   */
  checkOrder: (
    | 'enums'
    | 'conditional'
    | 'text'
    | 'structured'
    | 'credit'
    | 'sourceKey'
    /** `hook:<name>` places a hook's row findings at this position. */
    | `hook:${string}`
  )[];

  /** Order enum columns are checked in. Defaults to their order in `columns`. */
  enumOrder?: string[];

  /**
   * Optional: Diagnostic issues no keys. Its importer replaces a whole set
   * rather than upserting individual rows, so there is nothing for a permanent
   * per-question identifier to do.
   */
  sourceKey?: {
    prefix: string;
    /**
     * Which columns the key encodes, in order. These need NOT all be bucket
     * dimensions — Mock's key embeds question_type, which varies within a file,
     * so a key carries more than the bucket does. Bucket matching compares only
     * the bucket dimensions.
     */
    segments: string[];
    pad: number;
    words: Record<string, Record<string, string>>;
    /** A literal example key for the MALFORMED message; omit to leave it out. */
    exampleForMessage?: string;
  };

  filenameChecks: FilenameCheck[];
  /** Drills appends the parsed filename words to its message; Mock does not. */
  filenameShowWords?: boolean;

  folderCheck?: { dimension: string; code: string };

  duplicateIdentity: DuplicateIdentityPart[];

  expectedRows: {
    fallback: number;
    byDimension?: Record<string, Record<string, number>>;
  };

  warnings?: {
    explanationCredit?: {
      answerColumn: string;
      explanationColumn: string;
      optionKeys: string[];
      /** Mock only warns on MCQ rows. */
      appliesWhen?: WhenClause;
      /** Mock's wording is shorter than drills'. */
      message?: string;
    };
  };

  /**
   * Named code hooks, run in addition to the declarative checks.
   *
   * This is the escape hatch, and it is deliberately a fixed registry of named
   * hooks rather than anything a loadout can define inline. Mock's passage/audio
   * grouping — READING rows group by passage_id, LISTENING rows by audio_url,
   * standalone rows are legal — is real branching logic, not a column rule, and
   * pretending otherwise would mean inventing a rules language.
   */
  hooks?: string[];
}

export class LoadoutError extends Error {}

/** Reject a loadout that cannot be executed. */
export function validateLoadout(loadout: Loadout): void {
  const fail = (msg: string): never => {
    throw new LoadoutError(`loadout "${loadout.id}": ${msg}`);
  };

  if (loadout.columns.length === 0) fail('declares no columns.');

  const columnNames = new Set(loadout.columns.map(c => c.name));
  const duplicates = loadout.columns.map(c => c.name).filter((n, i, all) => all.indexOf(n) !== i);
  if (duplicates.length > 0) fail(`declares column "${duplicates[0]}" more than once.`);

  if (columnNames.has(loadout.sourceKeyColumn)) {
    fail(
      `lists "${loadout.sourceKeyColumn}" in columns, but the key column is added by tooling ` +
        `and must be declared only as sourceKeyColumn.`,
    );
  }

  const requireColumn = (name: string, where: string): void => {
    if (!columnNames.has(name)) fail(`${where} references column "${name}", which is not declared.`);
  };

  const checkVariant = (variant: ColumnVariant, label: string): void => {
    if (variant.when) requireColumn(variant.when.column, `${label}.when`);
    switch (variant.kind) {
      case 'enum':
      case 'loose_enum':
        if (!(variant.members ?? variant.allowed) || (variant.members ?? variant.allowed)!.length === 0) {
          fail(`${label} is ${variant.kind} but declares no members.`);
        }
        if (variant.kind === 'enum' && !variant.invalidCode) fail(`${label} declares no invalidCode.`);
        break;
      case 'text':
        if (variant.requireNonEmpty && !variant.emptyCode) fail(`${label} requires a value but declares no emptyCode.`);
        break;
      case 'json_object': {
        if (!variant.requiredKeys || variant.requiredKeys.length === 0) {
          fail(`${label} is a json_object but declares no requiredKeys.`);
        }
        const needed: (keyof ColumnCodes)[] = ['empty', 'notJson', 'notObject', 'keysWrong', 'valueNotString'];
        if (variant.requireNonEmptyValues) needed.push('valueEmpty');
        if (variant.requireUniqueValues) needed.push('valueDuplicate');
        for (const key of needed) {
          if (!variant.codes?.[key]) fail(`${label} declares no codes.${key}.`);
        }
        break;
      }
      case 'json_string_enum':
        if (!variant.allowed || variant.allowed.length === 0) fail(`${label} declares no allowed values.`);
        for (const key of ['empty', 'notAllowed'] as (keyof ColumnCodes)[]) {
          if (!variant.codes?.[key]) fail(`${label} declares no codes.${key}.`);
        }
        break;
    }
  };

  for (const column of loadout.columns) {
    if (column.appliesWhen) requireColumn(column.appliesWhen.column, `column "${column.name}".appliesWhen`);
    if (column.forbiddenWhen) {
      requireColumn(column.forbiddenWhen.column, `column "${column.name}".forbiddenWhen`);
      if (!column.forbiddenCode) fail(`column "${column.name}" declares forbiddenWhen but no forbiddenCode.`);
    }
    if (column.variants) {
      column.variants.forEach((v, i) => checkVariant(v, `column "${column.name}".variants[${i}]`));
    } else {
      checkVariant(column, `column "${column.name}"`);
    }
  }

  for (const dimension of loadout.bucket?.dimensions ?? []) requireColumn(dimension, 'bucket.dimensions');

  const dimensions = new Set(loadout.bucket?.dimensions ?? []);
  if (loadout.bucket?.allowList) {
    for (const d of [loadout.bucket.allowList.keyDimension, loadout.bucket.allowList.valueDimension]) {
      if (!dimensions.has(d)) fail(`bucket.allowList references "${d}", which is not a bucket dimension.`);
    }
  }

  if (loadout.rowAllowList) {
    requireColumn(loadout.rowAllowList.keyColumn, 'rowAllowList.keyColumn');
    requireColumn(loadout.rowAllowList.valueColumn, 'rowAllowList.valueColumn');
  }

  for (const conditional of loadout.conditionalColumns ?? []) {
    requireColumn(conditional.column, 'conditionalColumns.column');
    requireColumn(conditional.byColumn, 'conditionalColumns.byColumn');
  }

  // Key segments may name any column, not only bucket dimensions.
  if (loadout.sourceKey) {
    for (const segment of loadout.sourceKey.segments) {
      requireColumn(segment, 'sourceKey.segments');
      if (!loadout.sourceKey.words[segment]) fail(`sourceKey.words has no entry for segment "${segment}".`);
    }
    if (loadout.sourceKey.pad < 1) fail('sourceKey.pad must be at least 1.');
  }

  for (const check of loadout.filenameChecks) {
    if (!dimensions.has(check.dimension)) {
      fail(`filenameChecks references "${check.dimension}", which is not a bucket dimension.`);
    }
  }
  if (loadout.folderCheck && !dimensions.has(loadout.folderCheck.dimension)) {
    fail(`folderCheck references "${loadout.folderCheck.dimension}", which is not a bucket dimension.`);
  }

  for (const part of loadout.duplicateIdentity) requireColumn(part.column, 'duplicateIdentity');

  for (const dimension of Object.keys(loadout.expectedRows.byDimension ?? {})) {
    if (!dimensions.has(dimension)) {
      fail(`expectedRows.byDimension references "${dimension}", which is not a bucket dimension.`);
    }
  }

  const credit = loadout.warnings?.explanationCredit;
  if (credit) {
    requireColumn(credit.answerColumn, 'warnings.explanationCredit.answerColumn');
    requireColumn(credit.explanationColumn, 'warnings.explanationCredit.explanationColumn');
    if (credit.appliesWhen) requireColumn(credit.appliesWhen.column, 'warnings.explanationCredit.appliesWhen');
  }

  if (loadout.embeddedHeaderThreshold < 1) fail('embeddedHeaderThreshold must be at least 1.');
}
