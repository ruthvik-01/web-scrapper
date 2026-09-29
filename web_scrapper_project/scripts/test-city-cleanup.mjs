#!/usr/bin/env node

function decodeEntities(input) {
  const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    pound: '£', euro: '€', hellip: '…',
    mdash: '—', ndash: '–', rsquo: '\u2019', lsquo: '\u2018',
    ldquo: '\u201c', rdquo: '\u201d', bull: '•',
    eacute: 'é', egrave: 'è', ouml: 'ö',
    auml: 'ä', uuml: 'ü', copy: '©', reg: '®',
    trade: '™', deg: '°',
  };
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\u00c2(?=[\u00a3\u00a9\u00ae])/g, '');
}

function cleanCity(city) {
  const trimmed = city.trim();
  if (!trimmed) return '';

  const decoded = decodeEntities(trimmed);

  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(decoded)) {
    return '';
  }

  if (decoded.includes(' ') && decoded.length > 25) {
    const parts = decoded.split(/\s+/);
    const addressSuffixes = ['Road', 'Street', 'Lane', 'Avenue', 'Way', 'Drive', 
                              'Place', 'Close', 'Grove', 'Square', 'Court', 'Terrace',
                              'Walk', 'Centre', 'Center', 'House', 'Clinic', 'Care'];
    
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i].replace(/[,+]/, '');
      if (!part) continue;
      
      if (addressSuffixes.some(s => part.toLowerCase() === s.toLowerCase())) continue;
      if (/^\d+$/.test(part)) continue;
      if (/^[A-Z]{1,2}\d/i.test(part) && part.length <= 3) continue;
      
      if (i > 0) {
        const prevPart = parts[i - 1].replace(/[,+]/, '');
        const compoundCities = ['West Bromwich', 'West Sussex', 'East Sussex', 'West Yorkshire', 
                                 'East Riding', 'North Yorkshire', 'South Yorkshire'];
        const potentialCompound = prevPart + ' ' + part;
        if (compoundCities.includes(potentialCompound)) {
          return potentialCompound;
        }
      }
      
      return part;
    }
    return parts[parts.length - 1];
  }

  if (decoded.includes(',') || decoded.includes('+')) {
    const parts = decoded.split(/[,+]+/).map(p => p.trim());
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part && !/^\d/.test(part) && !/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(part)) {
        if (!/^(road|street|lane|avenue|way|drive|place|close|grove|square|court|terrace)$/i.test(part)) {
          return part;
        }
      }
    }
  }

  if (decoded.length <= 25 && !decoded.includes(',') && !decoded.includes('+')) {
    return decoded;
  }
  return '';
}

// Test on problematic rows
const problematic = [
  'Treatment Centre 32 Church Road Garston Liverpool',
  'Asden House Dental Clinic 1 – 5 Victoria Street West Bromwich',
  'Number 9 Dental Care 9 Newcastle Street Worksop Nottinghamshire',
  'Taptonville House Dental 1 Taptonville Road Broomhill Sheffield',
  'Grange Park Primary Care Centre  Wilks Walk  Northampton',
];

console.log('Testing city cleanup:');
for (const city of problematic) {
  console.log(`"${city}" -> "${cleanCity(city)}"`);
}
