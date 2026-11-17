import { Injectable } from '@angular/core';
import { Product } from './pos-data.models';

export interface Gs1ParsedData {
  gtin14: string;
  ean13: string;
  expireDate?: string; // ISO YYYY-MM-DD
  batchLot?: string;
}

export interface BarcodeMatchResult {
  status: 'matched' | 'qr_blocked' | 'not_found';
  product?: Product;
  gs1Data?: Gs1ParsedData;
  effectiveExpireDate?: string;
}

@Injectable({
  providedIn: 'root'
})
export class BarcodeService {
  /**
   * Detects non-product QR payloads (plain URLs, Wi-Fi strings, vCards, receipt hashes)
   * that are NOT structured GS1 Digital Link product codes.
   */
  public isNonProductQrPayload(raw: string): boolean {
    const input = (raw || '').trim();
    if (!input) return false;

    // GS1 Digital Links contain /01/<14-digits> — allow those through to the GS1 parser
    if (/^https?:\/\/.+\/01\/\d{14}(?:\/|\?|#|$)/i.test(input)) {
      return false;
    }

    return (
      /^https?:\/\//i.test(input) ||
      /^www\./i.test(input) ||
      /^WIFI:/i.test(input) ||
      /^BEGIN:VCARD/i.test(input) ||
      input.includes('aade.gr') ||
      input.length > 48
    );
  }

  /**
   * Parses GS1 2D Barcodes (Sunrise 2027 Digital Link URLs or FNC1/Parenthesized Element Strings)
   * extracting AI (01) GTIN-14 / EAN-13, AI (17) Expiration Date, and AI (10) Batch/Lot.
   */
  public parseGs1Barcode(rawScan: string): Gs1ParsedData | null {
    const input = (rawScan || '').trim();
    if (!input) return null;

    let gtin14: string | null = null;
    let rawExpire: string | null = null;
    let batchLot: string | undefined;

    if (/^https?:\/\//i.test(input)) {
      const gtinMatch = input.match(/\/01\/(\d{14})(?:\/|\?|#|$)/);
      if (!gtinMatch) return null;

      gtin14 = gtinMatch[1];

      const expMatch = input.match(/(?:\/17\/|[?&]17=)(\d{6})(?:\/|\?|&|#|$)/);
      if (expMatch) rawExpire = expMatch[1];

      const lotMatch = input.match(/(?:\/10\/|[?&]10=)([^/?&#]+)/);
      if (lotMatch) batchLot = decodeURIComponent(lotMatch[1]);
    } else {
      const clean = input.replace(/[\x1D\u001d]/g, '');
      const gtinMatch = clean.match(/^\(?01\)?(\d{14})(.*)$/);
      if (!gtinMatch) return null;

      gtin14 = gtinMatch[1];
      const remainder = gtinMatch[2] || '';

      const expMatch = remainder.match(/\(?17\)?(\d{6})/);
      if (expMatch) rawExpire = expMatch[1];

      const lotMatch = remainder.match(/\(?10\)?([A-Za-z0-9\-_]{1,20})/);
      if (lotMatch) batchLot = lotMatch[1];
    }

    const ean13 = gtin14.startsWith('0') ? gtin14.slice(1) : gtin14;

    let expireDate: string | undefined;
    if (rawExpire && /^\d{6}$/.test(rawExpire)) {
      const yy = Number(rawExpire.slice(0, 2));
      const mm = Number(rawExpire.slice(2, 4));
      let dd = Number(rawExpire.slice(4, 6));

      if (mm >= 1 && mm <= 12) {
        const fullYear = 2000 + yy;
        if (dd === 0) {
          dd = new Date(fullYear, mm, 0).getDate();
        }
        if (dd >= 1 && dd <= 31) {
          expireDate = `${fullYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        }
      }
    }

    return { gtin14, ean13, expireDate, batchLot };
  }

  /**
   * Matches a scanned string (1D EAN-13/8/UPC or 2D GS1) against the active product catalog.
   */
  public resolveScan(rawInput: string, products: Product[]): BarcodeMatchResult {
    const trimmed = (rawInput || '').trim();
    if (!trimmed) return { status: 'not_found' };

    const gs1Data = this.parseGs1Barcode(trimmed) || undefined;
    const lookupCodes = gs1Data ? [gs1Data.ean13, gs1Data.gtin14] : [trimmed];

    if (!gs1Data && this.isNonProductQrPayload(trimmed)) {
      return { status: 'qr_blocked' };
    }

    const product = products.find(p => {
      if (p.isActive === false) return false;
      const main = String(p.barcode ?? '').trim();
      const alts = Array.isArray(p.altBarcodes)
        ? p.altBarcodes.map(a => String(a).trim())
        : [];
      return lookupCodes.some(code => code === main || alts.includes(code));
    });

    if (!product) {
      return { status: 'not_found', gs1Data };
    }

    return {
      status: 'matched',
      product,
      gs1Data,
      effectiveExpireDate: gs1Data?.expireDate || product.expire
    };
  }
}