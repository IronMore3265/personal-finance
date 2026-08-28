// SMS rule engine.
//
// A pasted message is matched against the rule table top to bottom: the sender
// name has to appear in the text, then the rule's regex has to capture an
// amount. Merchant keywords, when present, override the rule's default category
// - "paid to GRAMEENPHONE" is Mobile & net, not Uncategorised.
//
// Everything here is local. No text leaves the device.

import { MERCHANT_MAP } from '../data/seed.js';

/**
 * A real SMS carries its sender as metadata, and plenty of alerts never name
 * the provider in the body ("You have received Tk 2,500.00 from 017..."), so an
 * explicit sender wins when we have one. Pasted text with no known sender falls
 * back to scanning the body.
 */
function senderMatches(rule, text, sender) {
  const want = rule.sender.toLowerCase();
  if (sender) return sender.toLowerCase() === want;
  if (text.toLowerCase().indexOf(want) >= 0) return true;
  // Bank alerts often omit the bank name but always carry a masked account.
  return rule.sender === 'CityBank' && /A\/C \*\*/i.test(text);
}

// Merchant names arrive SHOUTED ("paid to GRAMEENPHONE", "at SHWAPNO GULSHAN").
// This has to run case-sensitively, which is why it is separate from the rule
// regex - those are matched with /i so their keywords stay forgiving.
const MERCHANT_PATTERNS = [
  /\bpaid to ([A-Z]{2,}(?: [A-Z]{2,})*)/,
  /\bat ([A-Z]{2,}(?: [A-Z]{2,})*)/,
  /\bto ([A-Z]{2,}(?: [A-Z]{2,})*)/
];

function merchantFrom(text) {
  for (const re of MERCHANT_PATTERNS) {
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return '';
}

function categoryFor(rule, merchant, text) {
  const haystack = (merchant + ' ' + text).toUpperCase();
  for (const entry of MERCHANT_MAP) {
    if (entry.k.some(k => haystack.indexOf(k) >= 0)) return entry.cat;
  }
  return rule.cat;
}

/**
 * @param {string} text    message body
 * @param {Array}  rules   rule table, tried in order
 * @param {string} [sender] sender address, when the platform gave us one
 * @returns {{ok:true, rule, amount, merchant, cat}|{ok:false}}
 */
export function parseSms(text, rules, sender) {
  if (!text || !text.trim()) return { ok: false };

  for (const rule of rules) {
    if (!senderMatches(rule, text, sender)) continue;

    let match;
    try {
      match = text.match(new RegExp(rule.pattern, 'i'));
    } catch {
      continue; // a bad user-authored pattern must not break the whole table
    }
    if (!match) continue;

    const amount = parseFloat(String(match[1]).replace(/,/g, ''));
    if (!isFinite(amount)) continue;

    const merchant = merchantFrom(text);

    return {
      ok: true,
      rule,
      amount,
      merchant,
      cat: categoryFor(rule, merchant, text)
    };
  }
  return { ok: false };
}
