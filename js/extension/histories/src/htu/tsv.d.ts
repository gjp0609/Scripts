export type HtuParsedRow = {
  url: string;
  visitTime: number;
  transition: string;
  title: string | null;
  fileType: string;
  error: null;
  errorMsg: null;
};

export type HtuParseError = {
  url: null;
  visitTime: null;
  transition: null;
  title: null;
  fileType: null;
  error: string;
  errorMsg: string;
};

export function convertToUnixEpoch(windowsEpochVisitTime: string | number): number;
export function convertToWindowsEpoch(unixEpochVisitTime: string | number): number;
export function convertTransitionToText(transition: string | number): string;
export function convertTextToTransition(transitionText: string): number | undefined;
export function parseHtuLine(lineInput: string): HtuParsedRow | HtuParseError;
export function parseHtuTsv(text: string): {
  rows: HtuParsedRow[];
  errors: HtuParseError[];
};
export function serializeArchivedRows(rows: HtuParsedRow[]): string;

