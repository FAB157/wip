/// <reference types="vite/client" />

// tz-lookup non pubblica tipi: coordinate → fuso IANA ("Europe/Rome").
declare module 'tz-lookup' {
  export default function tzLookup(lat: number, lon: number): string;
}
