const WINDOWS_EPOCH_OFFSET_MS_X1000 = 11644473600000000;

const TRANSITION_TYPES = [
  'link',
  'typed',
  'auto_bookmark',
  'auto_subframe',
  'manual_subframe',
  'generated',
  'auto_toplevel',
  'form_submit',
  'reload',
  'keyword',
  'keyword_generated'
];

const TRANSITION_IDS = new Map(TRANSITION_TYPES.map((name, index) => [name, index]));

export function convertToUnixEpoch(windowsEpochVisitTime) {
  return (Number(windowsEpochVisitTime) - WINDOWS_EPOCH_OFFSET_MS_X1000) / 1000;
}

export function convertToWindowsEpoch(unixEpochVisitTime) {
  return Number(unixEpochVisitTime) * 1000 + WINDOWS_EPOCH_OFFSET_MS_X1000;
}

export function convertTransitionToText(transition) {
  const value = String(transition);
  if (/^-?\d+$/.test(value)) {
    const typeId = Number(value) & 0xff;
    return TRANSITION_TYPES[typeId] ?? 'unknown';
  }
  return value;
}

export function convertTextToTransition(transitionText) {
  return TRANSITION_IDS.get(transitionText);
}

export function parseHtuLine(lineInput) {
  const result = {
    url: null,
    visitTime: null,
    transition: null,
    title: null,
    fileType: null,
    error: null,
    errorMsg: null
  };

  if (!/[\r\n]+$/.test(lineInput)) {
    result.error = 'MISSING_LINEBREAK';
    result.errorMsg = `no linebreaks for line: '${lineInput}'`;
    return result;
  }

  const line = lineInput.replace(/[\r\n]+$/, '');
  const columns = line.split('\t');

  if (columns.length !== 3 && columns.length !== 4 && columns.length !== 8) {
    result.error = 'WRONG_COLUMN_COUNT';
    result.errorMsg = `wrong number of columns (${columns.length}) for line: '${line}'`;
    return result;
  }

  let url;
  let visitTime;
  let transition;
  let title;

  if (columns.length === 3 || columns.length === 4) {
    url = columns[0];
    visitTime = columns[1];
    transition = columns[2];
    title = columns.length === 4 ? columns[3] : null;
  } else {
    url = columns[0];
    visitTime = columns[3];
    transition = columns[6];
    title = columns[7];
  }

  const errors = [];
  if (!isValidUrl(url)) errors.push('url');
  if (!isValidVisitTime(visitTime)) errors.push('visitTime');
  if (!isValidTransition(transition)) errors.push('transition');

  if (errors.length) {
    result.error = 'INVALID_FIELD';
    result.errorMsg = `Invalid ${errors.join(', ')} for line '${line}'`;
    return result;
  }

  let fileType = `${columns.length}col`;

  if (columns.length !== 8) {
    if (visitTime.match(/^U/)) {
      fileType += '_unix';
      visitTime = Number.parseFloat(visitTime.replace('U', ''));
    } else {
      fileType += '_win';
      visitTime = convertToUnixEpoch(visitTime);
    }
    transition = convertTransitionToText(transition);
  } else {
    visitTime = Number.parseFloat(visitTime);
  }

  result.url = url;
  result.visitTime = visitTime;
  result.transition = transition;
  result.title = title;
  result.fileType = fileType;
  return result;
}

export function parseHtuTsv(text) {
  const rows = [];
  const errors = [];
  const linePattern = /[^\r\n]*(?:\r\n|\n\r|\r|\n)/g;
  let match;
  let parsedLength = 0;

  while ((match = linePattern.exec(text)) !== null) {
    const rawLine = match[0];
    parsedLength = linePattern.lastIndex;
    if (rawLine === '\n' || rawLine === '\r' || rawLine === '\r\n' || rawLine === '\n\r') {
      continue;
    }

    const parsed = parseHtuLine(rawLine);
    if (parsed.error) {
      errors.push(parsed);
    } else {
      rows.push(parsed);
    }
  }

  if (parsedLength < text.length) {
    errors.push(parseHtuLine(text.slice(parsedLength)));
  }

  return { rows, errors };
}

export function serializeArchivedRows(rows) {
  let output = '';
  for (const row of rows) {
    const transitionId = convertTextToTransition(row.transition);
    output += [
      row.url ?? '',
      `U${formatVisitTime(row.visitTime)}`,
      transitionId ?? '',
      row.title ?? ''
    ].join('\t');
    output += '\r\n';
  }
  return output;
}

function formatVisitTime(visitTime) {
  const value = Number(visitTime);
  return Number.isInteger(value) ? String(value) : String(visitTime);
}

function isValidUrl(url) {
  return typeof url === 'string' && url.length > 0;
}

function isValidVisitTime(time) {
  return typeof time === 'string' && /^U?\d+\.?\d*$/.test(time);
}

function isValidTransition(transition) {
  return typeof transition === 'string' && /^(?:-?\d+|[a-z_]+)$/i.test(transition);
}
