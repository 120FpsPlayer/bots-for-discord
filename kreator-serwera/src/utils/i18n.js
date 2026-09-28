'use strict';

/**
 * Minimalny system tłumaczeń używany w katalogach danych.
 * Każdy tekst widoczny na budowanym serwerze jest zapisany jako { pl, en },
 * dzięki czemu kreator może zbudować serwer po polsku albo po angielsku.
 */

/** Tworzy dwujęzyczny tekst. */
function L(pl, en) {
  return { pl, en: en ?? pl };
}

/** Zwraca tekst w wybranym języku (obsługuje zwykłe stringi i obiekty { pl, en }). */
function tr(value, lang = 'pl') {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'function') return value(lang);
  return value[lang] ?? value.pl ?? '';
}

/** Podstawia {zmienne} w tekście. */
function fill(text, vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (match, key) => (vars[key] !== undefined ? String(vars[key]) : match));
}

module.exports = { L, tr, fill };
