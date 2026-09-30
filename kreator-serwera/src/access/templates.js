'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Szablony serwerów sprzedawcy (np. „Minecraft Premium”).
 * Sprzedawca projektuje serwer w /stworz i w podsumowaniu klika „Zapisz jako szablon”.
 * Kod z `szablon=<id>` otwiera u kupującego gotowy projekt – buduje go jednym kliknięciem.
 * Każdy szablon to osobny plik data/szablony/<id>.json.
 */

const ID_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

class TemplateStore {
  constructor({ dir }) {
    this.dir = dir;
  }

  fileOf(id) {
    if (!ID_RE.test(id)) throw new Error('ID szablonu: 2–32 znaki, małe litery, cyfry i myślniki (np. minecraft-premium).');
    return path.join(this.dir, `${id}.json`);
  }

  list() {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const t = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'));
          return { id: t.id, name: t.name, description: t.description, type: t.type, stats: t.stats, createdAt: t.createdAt, uses: t.uses || 0 };
        } catch {
          return null;
        }
      })
      .filter((t) => t && ID_RE.test(t.id || ''))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id) {
    const key = String(id || '').toLowerCase();
    if (!ID_RE.test(key)) return null;
    const file = path.join(this.dir, `${key}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  }

  exists(id) {
    return Boolean(this.get(id));
  }

  save({ id, name, description = '', answers, stats = null, authorId = null }) {
    const file = this.fileOf(id);
    fs.mkdirSync(this.dir, { recursive: true });
    const previous = this.get(id);
    const data = {
      id,
      name: String(name || id).trim().slice(0, 80),
      description: String(description || '').trim().slice(0, 300),
      type: answers?.type || null,
      stats,
      answers,
      authorId,
      createdAt: previous?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      uses: previous?.uses || 0,
    };
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
    fs.renameSync(`${file}.tmp`, file);
    return { ...data, updated: Boolean(previous) };
  }

  /** Licznik budów z szablonu (statystyka dla sprzedawcy). */
  countUse(id) {
    const t = this.get(id);
    if (!t) return;
    t.uses = (t.uses || 0) + 1;
    const file = this.fileOf(t.id);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(t, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  }

  delete(id) {
    const t = this.get(id);
    if (!t) return false;
    fs.unlinkSync(this.fileOf(t.id));
    return true;
  }
}

module.exports = { TemplateStore, slugify, ID_RE };
