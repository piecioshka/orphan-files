export interface OrphanFilesConfig {
  include?: string[];
  exclude?: string[];
  /** Entry points: kept, and everything they import is kept transitively. */
  entry?: string[];
  /** Treated as additional entry points (kept and seed reachability). */
  exceptions?: string[];
}

export interface TsAliases {
  paths?: Record<string, string[]>;
  pathsBaseDir?: string;
  baseUrlDir?: string;
}

export interface AnalyzeOptions {
  projectDir?: string;
  entryPatterns?: string[];
  tsAliases?: TsAliases;
}

export interface AnalysisResult {
  /** file -> resolved files it imports */
  graph: Map<string, string[]>;
  /** file -> files that import it */
  reverseGraph: Map<string, string[]>;
  /** entry-point files (reachability roots) */
  entries: Set<string>;
  /** files reachable from any entry point */
  reachable: Set<string>;
  /** files NOT reachable from any entry point */
  unused: string[];
  tsAliases: TsAliases;
}

export interface ExplainResult {
  file: string;
  status: "entry" | "used" | "unused" | "unknown";
  reason: string;
  /** chain of relative paths from an entry point to the file (for "used") */
  path: string[];
}

/**
 * Scans a directory for files matching the given glob pattern.
 */
export function scanProject(
  cwd: string,
  pattern?: string,
  ignore?: string[],
  options?: { respectGitignore?: boolean },
): Promise<string[]>;

/**
 * Extracts all import/require/export-from/glob specifiers from a source file.
 */
export function extractImports(filePath: string): string[];

/**
 * Builds the import graph and computes which files are reachable from entry
 * points. Files that are unreachable are unused — including islands of files
 * that only import each other.
 */
export function analyze(
  allFiles: string[],
  fileImports: Record<string, string[]>,
  options?: AnalyzeOptions,
): AnalysisResult;

/**
 * Returns the files that are not reachable from any entry point.
 * `exceptionPatterns` are treated as additional entry points.
 */
export function findUnusedFiles(
  allFiles: string[],
  fileImports: Record<string, string[]>,
  exceptionPatterns?: string[],
  projectDir?: string,
): string[];

/**
 * Explains why a file is kept or unused, tracing the chain of importers back to
 * an entry point.
 */
export function explainFile(
  targetFile: string,
  result: AnalysisResult,
  projectDir?: string,
): ExplainResult;
