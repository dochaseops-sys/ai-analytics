import { GTMTag } from '../types';

export const normalizeName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, ' ')
    .replace(/[\W]+/g, ' ')
    .trim();

export const matchesAnyName = (value: string, patterns: string[]): boolean => {
  const normalized = normalizeName(value);
  return patterns.some((pattern) => {
    const normalizedPattern = normalizeName(pattern);
    return normalized === normalizedPattern || normalized.includes(normalizedPattern);
  });
};

export const findMatchingName = (values: string[] | undefined, patterns: string[]): string | undefined => {
  if (!Array.isArray(values)) {
    return undefined;
  }
  return values.find((value) => matchesAnyName(value, patterns));
};

export const findMatchingConversion = (
  conversions: Array<{ name: string }> | undefined,
  patterns: string[]
): { name: string } | undefined => {
  return conversions?.find((conversion) => matchesAnyName(conversion.name, patterns));
};

export const findGtmTagByName = (tags: GTMTag[] | undefined, patterns: string[]): GTMTag | undefined => {
  if (!Array.isArray(tags)) return undefined;
  return tags.find((tag) => {
    if (!tag.name) return false;
    const normalizedName = normalizeName(tag.name);
    const isGtmEventTag = typeof tag.type === 'string' && ['gaawe', 'ga4', 'gtag', 'analytics', 'html', 'ua', 'event', 'custom'].some((test) => tag.type.toLowerCase().includes(test));
    if (!isGtmEventTag) return false;
    return patterns.some((pattern) => normalizedName.includes(normalizeName(pattern)));
  });
};

export const getSummaryList = (items: string[], limit = 3): string =>
  Array.from(new Set(items.filter(Boolean))).slice(0, limit).join(', ');
