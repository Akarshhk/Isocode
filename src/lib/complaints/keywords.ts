import type { CategoryT, ScopeT, UrgencyT } from "./rules";

// Keyword fallback, used when the AI is unavailable, times out, or returns something invalid.
// Deliberately simple and predictable; tickets it classifies are flagged for review.

const CATEGORY_WORDS: [CategoryT, RegExp][] = [
  ["LIFT", /\b(lift|elevator)s?\b|लिफ्ट/i],
  ["PLUMBING", /\b(leak\w*|water|tap|pipe|drain\w*|flush|toilet|geyser|overflow\w*|seep\w*|choke\w*|sewage|tank)\b|पानी|पाणी|नल/i],
  ["ELECTRICAL", /\b(light|power|electric\w*|switch|socket|mcb|fuse|wiring|voltage|inverter|meter|fan)\b|बिजली|वीज/i],
  ["SECURITY", /\b(guard|security|theft|stolen|stranger|gate|intruder|cctv)\b/i],
  ["PARKING", /\b(parking|parked|car|bike|vehicle)\b/i],
  ["PEST_CONTROL", /\b(pest|cockroach\w*|rats?|mosquito\w*|termites?|bees?|snake)\b/i],
  ["HOUSEKEEPING", /\b(garbage|dirty|clean\w*|sweep\w*|trash|smell|stink\w*|dustbin|litter)\b|कचरा/i],
  ["CIVIL", /\b(crack\w*|plaster|ceiling|wall|tiles?|dampness|damp|paint|door|window|railing)\b/i],
];

const COMMON_WORDS =
  /\b(lift|elevator|corridor|lobby|stair\w*|parking|gate|garden|clubhouse|common|terrace|basement|podium|tower|whole building|entire building|all flats|street ?light|main line|no water supply|water supply)\b/i;

const HIGH_WORDS = /\b(urgent|immediately|emergency|flood\w*|no water|no power|power cut|overflow\w*|sewage|not working since|since (two|three|\d+) days)\b/i;
const LOW_WORDS = /\b(suggest\w*|request|whenever|paint|repaint|minor|small)\b/i;

export type KeywordResult = { category: CategoryT; urgency: UrgencyT; scope: ScopeT; reason: string };

export function classifyByKeywords(text: string): KeywordResult {
  const hit = CATEGORY_WORDS.find(([, re]) => re.test(text));
  const category = hit ? hit[0] : "OTHER";
  const urgency: UrgencyT = HIGH_WORDS.test(text) ? "HIGH" : LOW_WORDS.test(text) ? "LOW" : "MEDIUM";
  const scope: ScopeT = category === "LIFT" || COMMON_WORDS.test(text) ? "COMMON" : "FLAT";
  return {
    category,
    urgency,
    scope,
    reason: hit ? `Keyword match for ${category.toLowerCase().replace("_", " ")}.` : "No category keyword found.",
  };
}
