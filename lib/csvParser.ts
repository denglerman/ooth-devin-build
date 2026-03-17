import Papa from 'papaparse';

export type ParsedContact = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  original_notes: string | null;
  source: string;
};

type CSVRow = Record<string, string>;

function detectFormat(headers: string[]): 'google' | 'linkedin' | 'unknown' {
  const headerSet = new Set(headers.map((h) => h.trim().toLowerCase()));

  if (headerSet.has('e-mail 1 - value') || headerSet.has('organization 1 - name')) {
    return 'google';
  }

  if (headerSet.has('email address') || headerSet.has('connected on') || headerSet.has('position')) {
    return 'linkedin';
  }

  // Fallback: check for generic column names
  if (headerSet.has('first name') && headerSet.has('last name')) {
    if (headerSet.has('company')) return 'linkedin';
    return 'google';
  }

  return 'unknown';
}

function getFieldValue(row: CSVRow, ...keys: string[]): string | null {
  for (const key of keys) {
    // Try exact match first
    if (row[key] !== undefined && row[key].trim() !== '') {
      return row[key].trim();
    }
    // Try case-insensitive match
    const found = Object.keys(row).find(
      (k) => k.trim().toLowerCase() === key.toLowerCase()
    );
    if (found && row[found].trim() !== '') {
      return row[found].trim();
    }
  }
  return null;
}

function parseGoogleRow(row: CSVRow): ParsedContact {
  return {
    first_name: getFieldValue(row, 'First Name', 'Given Name'),
    last_name: getFieldValue(row, 'Last Name', 'Family Name'),
    email: getFieldValue(row, 'E-mail 1 - Value', 'Email 1 - Value'),
    phone: getFieldValue(row, 'Phone 1 - Value'),
    company: getFieldValue(row, 'Organization 1 - Name'),
    job_title: getFieldValue(row, 'Organization 1 - Title'),
    original_notes: getFieldValue(row, 'Notes'),
    source: 'Google',
  };
}

function parseLinkedInRow(row: CSVRow): ParsedContact {
  return {
    first_name: getFieldValue(row, 'First Name'),
    last_name: getFieldValue(row, 'Last Name'),
    email: getFieldValue(row, 'Email Address'),
    phone: null,
    company: getFieldValue(row, 'Company'),
    job_title: getFieldValue(row, 'Position'),
    original_notes: getFieldValue(row, 'Connected On'),
    source: 'LinkedIn',
  };
}

function parseGenericRow(row: CSVRow): ParsedContact {
  return {
    first_name: getFieldValue(row, 'First Name', 'first_name', 'firstName'),
    last_name: getFieldValue(row, 'Last Name', 'last_name', 'lastName'),
    email: getFieldValue(row, 'Email', 'email', 'Email Address', 'E-mail'),
    phone: getFieldValue(row, 'Phone', 'phone', 'Phone Number'),
    company: getFieldValue(row, 'Company', 'company', 'Organization'),
    job_title: getFieldValue(row, 'Title', 'Job Title', 'Position', 'job_title'),
    original_notes: getFieldValue(row, 'Notes', 'notes'),
    source: 'Import',
  };
}

export function parseCSV(csvText: string): {
  contacts: ParsedContact[];
  source: string;
  skipped: number;
} {
  // LinkedIn CSVs may have preamble lines — scan for first line containing "First Name"
  const lines = csvText.split('\n');
  let startIndex = 0;

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (lines[i].includes('First Name')) {
      startIndex = i;
      break;
    }
  }

  const cleanedCSV = lines.slice(startIndex).join('\n');

  const result = Papa.parse<CSVRow>(cleanedCSV, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (!result.data || result.data.length === 0) {
    return { contacts: [], source: 'Unknown', skipped: 0 };
  }

  const headers = result.meta.fields || [];
  const format = detectFormat(headers);

  let skipped = 0;
  const contacts: ParsedContact[] = [];

  for (const row of result.data) {
    let contact: ParsedContact;

    switch (format) {
      case 'google':
        contact = parseGoogleRow(row);
        break;
      case 'linkedin':
        contact = parseLinkedInRow(row);
        break;
      default:
        contact = parseGenericRow(row);
    }

    // Skip rows with no meaningful data
    if (!contact.first_name && !contact.last_name && !contact.email) {
      skipped++;
      continue;
    }

    contacts.push(contact);
  }

  const source = format === 'google' ? 'Google Contacts' : format === 'linkedin' ? 'LinkedIn' : 'CSV Import';

  return { contacts, source, skipped };
}
