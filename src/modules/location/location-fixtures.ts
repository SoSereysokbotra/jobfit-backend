// Real rows lifted from GeoNames `cities15000` (the same file the importer reads), trimmed
// to a handful of alternate names each. Fixtures rather than a database read, so the
// resolution rules run in CI — but REAL data, because invented rows would not prove that
// Khmer script, "PNH" or a US state code behave the way production does.
//
// Chosen for what each one catches:
//   Phnom Penh / Siem Reap  — Khmer-script alternates, and the primary market
//   Bangkok                 — Thai-script alternates
//   Chicago / San Francisco — "IL" and "CA" as STATE codes ("CA" is also Canada's ISO code)
//   London GB vs London CA  — same name, two countries
//   Springfield MO vs MA    — same name, twice in ONE country
//   Phnom Penh + Dangkao    — two cities in ONE province (KH.22), for the 'same province' rung
//   Singapore               — city-state with NO admin1 (admin1Code: null)
//   New York City           — carries "NY" as an alternate NAME, not merely a state code

import { LocationRecord } from './location.types';

export const LOCATION_FIXTURES: LocationRecord[] = [
  {
    "geonameId": 1821306,
    "name": "Phnom Penh",
    "asciiName": "Phnom Penh",
    "alternateNames": [
      "ភនកពងតរាច",
      "ភនពេញ",
      "PNH",
      "Krong Chaktomuk",
      "Nam Van",
      "Nam-Vang"
    ],
    "countryCode": "KH",
    "countryName": "Cambodia",
    "admin1Code": "22",
    "admin1Name": "Phnom Penh",
    "population": 1573544
  },
  {
    "geonameId": 1822214,
    "name": "Siem Reap",
    "asciiName": "Siem Reap",
    "alternateNames": [
      "ក្រុងសៀមរាប",
      "SAI",
      "Ciudad de Siem Riep",
      "Khett Siem Reab",
      "Siem Reab"
    ],
    "countryCode": "KH",
    "countryName": "Cambodia",
    "admin1Code": "24",
    "admin1Name": "Siem Reap",
    "population": 139458
  },
  {
    "geonameId": 1830784,
    "name": "Dangkao",
    "asciiName": "Dangkao",
    "alternateNames": [
      "Dangkao",
      "Khum Dangkao",
      "Khŭm Dângkaô",
      "Rung"
    ],
    "countryCode": "KH",
    "countryName": "Cambodia",
    "admin1Code": "22",
    "admin1Name": "Phnom Penh",
    "population": 76421
  },
  {
    "geonameId": 4887398,
    "name": "Chicago",
    "asciiName": "Chicago",
    "alternateNames": [
      "CHI",
      "Cekaga",
      "Chi-ka-ko",
      "Chicagu"
    ],
    "countryCode": "US",
    "countryName": "United States",
    "admin1Code": "IL",
    "admin1Name": "Illinois",
    "population": 2664452
  },
  {
    "geonameId": 5391959,
    "name": "San Francisco",
    "asciiName": "San Francisco",
    "alternateNames": [
      "SF",
      "SFO",
      "Franciscopolis",
      "Frisco",
      "Kapalakiko"
    ],
    "countryCode": "US",
    "countryName": "United States",
    "admin1Code": "CA",
    "admin1Name": "California",
    "population": 827526
  },
  {
    "geonameId": 1609350,
    "name": "Bangkok",
    "asciiName": "Bangkok",
    "alternateNames": [
      "กรุงเทพ",
      "กรุงเทพมหานคร",
      "BKK",
      "Amphoe Phra Nakhon",
      "Ban'nkok",
      "Bancac"
    ],
    "countryCode": "TH",
    "countryName": "Thailand",
    "admin1Code": "40",
    "admin1Name": "Bangkok",
    "population": 5104476
  },
  {
    "geonameId": 1880252,
    "name": "Singapore",
    "asciiName": "Singapore",
    "alternateNames": [
      "SG",
      "SIN",
      "Danmaxi",
      "Garden City",
      "Little Red Dot"
    ],
    "countryCode": "SG",
    "countryName": "Singapore",
    "admin1Code": null,
    "admin1Name": null,
    "population": 5638700
  },
  {
    "geonameId": 2643743,
    "name": "London",
    "asciiName": "London",
    "alternateNames": [
      "LON",
      "ILondon",
      "Lakana",
      "Landan"
    ],
    "countryCode": "GB",
    "countryName": "United Kingdom",
    "admin1Code": "ENG",
    "admin1Name": "England",
    "population": 8961989
  },
  {
    "geonameId": 6058560,
    "name": "London",
    "asciiName": "London",
    "alternateNames": [
      "YXU",
      "Landona",
      "Londonas",
      "Londono"
    ],
    "countryCode": "CA",
    "countryName": "Canada",
    "admin1Code": "08",
    "admin1Name": "Ontario",
    "population": 422324
  },
  {
    "geonameId": 5128581,
    "name": "New York City",
    "asciiName": "New York City",
    "alternateNames": [
      "NY",
      "NYC",
      "Aebura",
      "Bandar Raya New York",
      "Big Apple"
    ],
    "countryCode": "US",
    "countryName": "United States",
    "admin1Code": "NY",
    "admin1Name": "New York",
    "population": 8804190
  },
  {
    "geonameId": 4409896,
    "name": "Springfield",
    "asciiName": "Springfield",
    "alternateNames": [],
    "countryCode": "US",
    "countryName": "United States",
    "admin1Code": "MO",
    "admin1Name": "Missouri",
    "population": 170188
  },
  {
    "geonameId": 4951788,
    "name": "Springfield",
    "asciiName": "Springfield",
    "alternateNames": [],
    "countryCode": "US",
    "countryName": "United States",
    "admin1Code": "MA",
    "admin1Name": "Massachusetts",
    "population": 154341
  }
];
