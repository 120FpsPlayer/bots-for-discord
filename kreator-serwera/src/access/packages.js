'use strict';

/**
 * Pakiety sprzedaży (wybierane przy generowaniu kodu: `kod pakiet=standard`).
 *  • basic    – szybki kreator (4 pytania) + tryb budowy; bez dodatków,
 *  • standard – pełny kreator, kanały pod popularne boty, ikona z inicjałów,
 *  • premium  – wszystko: onboarding Discorda, banery, paczka emoji serwera.
 * Kod bez pakietu = premium. Sprzedawca (właściciel bota) i tryb bez kodów też mają premium.
 * Ograniczenia są pilnowane w kreatorze (zablokowane opcje) i przed budową (applyPackage).
 */

const FEATURES = {
  bots: { emoji: '🤖', label: 'Kanały i linki pod popularne boty' },
  icon: { emoji: '🖼️', label: 'Ikona serwera z inicjałów' },
  onboarding: { emoji: '🧭', label: 'Onboarding Discorda (pytania przy wejściu)' },
  banners: { emoji: '🏞️', label: 'Banery nad regulaminem i informacjami' },
  emojiPack: { emoji: '😀', label: 'Paczka emoji w kolorach serwera' },
};

const PACKAGES = {
  basic: {
    key: 'basic', emoji: '🥉', label: 'Podstawowy',
    description: 'Szybki kreator (4 pytania) i tryb budowy',
    full: false, import: false, features: [],
  },
  standard: {
    key: 'standard', emoji: '🥈', label: 'Standard',
    description: 'Pełny kreator, kanały pod boty, ikona z inicjałów',
    full: true, import: true, features: ['bots', 'icon'],
  },
  premium: {
    key: 'premium', emoji: '🥇', label: 'Premium',
    description: 'Wszystko: onboarding, banery, paczka emoji…',
    full: true, import: true, features: ['bots', 'icon', 'onboarding', 'banners', 'emojiPack'],
  },
};

const DEFAULT_PACKAGE = 'premium';

function packageOf(key) {
  return PACKAGES[key] || PACKAGES[DEFAULT_PACKAGE];
}

/** pkg = null → bez ograniczeń (sprzedawca / kody wyłączone). */
function allows(pkg, feature) {
  return !pkg || pkg.features.includes(feature);
}

/** Najtańszy pakiet z daną funkcją – do komunikatu „🔒 dostępne w pakiecie …”. */
function packageFor(feature) {
  return Object.values(PACKAGES).find((p) => p.features.includes(feature)) || PACKAGES.premium;
}

function lockLabel(feature) {
  const p = packageFor(feature);
  return `🔒 pakiet ${p.label}`;
}

/** Wyłącza w odpowiedziach funkcje spoza pakietu. Zwraca listę wyłączonych funkcji. */
function applyPackage(answers, pkg) {
  if (!pkg) return [];
  const removed = [];
  const off = (feature, fn) => {
    if (!allows(pkg, feature) && fn()) removed.push(FEATURES[feature].label);
  };
  off('onboarding', () => {
    const was = Boolean(answers.onboarding?.enabled);
    if (answers.onboarding) answers.onboarding.enabled = false;
    return was;
  });
  off('bots', () => {
    const was = (answers.bots || []).length > 0;
    answers.bots = [];
    return was;
  });
  for (const feature of ['banners', 'icon', 'emojiPack']) {
    off(feature, () => {
      const was = Boolean(answers.graphics?.[feature]);
      if (answers.graphics) answers.graphics[feature] = false;
      return was;
    });
  }
  return removed;
}

module.exports = { PACKAGES, FEATURES, DEFAULT_PACKAGE, packageOf, allows, packageFor, lockLabel, applyPackage };
