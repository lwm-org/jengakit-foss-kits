/**
 * download-kjv.mjs — Fetch full KJV Bible data during Docker build.
 *
 * Downloads from the public domain aruljohn/Bible-kjv GitHub repository.
 * The KJV is public domain (published 1611, no copyright).
 * GitHub filenames use no spaces (e.g., "1Samuel.json", "SongofSolomon.json").
 *
 * Run: node scripts/download-kjv.mjs
 * Output: public/data/bibles/en/kjv/book/*.json (66 files)
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "public", "data", "bibles", "en", "kjv", "book");

// Book ID → GitHub filename (no spaces in filenames)
const BOOK_MAP = {
  genesis: "Genesis", exodus: "Exodus", leviticus: "Leviticus",
  numbers: "Numbers", deuteronomy: "Deuteronomy", joshua: "Joshua",
  judges: "Judges", ruth: "Ruth", "1samuel": "1Samuel", "2samuel": "2Samuel",
  "1kings": "1Kings", "2kings": "2Kings", "1chronicles": "1Chronicles",
  "2chronicles": "2Chronicles", ezra: "Ezra", nehemiah: "Nehemiah",
  esther: "Esther", job: "Job", psalms: "Psalms", proverbs: "Proverbs",
  ecclesiastes: "Ecclesiastes", songofsolomon: "SongofSolomon",
  isaiah: "Isaiah", jeremiah: "Jeremiah", lamentations: "Lamentations",
  ezekiel: "Ezekiel", daniel: "Daniel", hosea: "Hosea", joel: "Joel",
  amos: "Amos", obadiah: "Obadiah", jonah: "Jonah", micah: "Micah",
  nahum: "Nahum", habakkuk: "Habakkuk", zephaniah: "Zephaniah",
  haggai: "Haggai", zechariah: "Zechariah", malachi: "Malachi",
  matthew: "Matthew", mark: "Mark", luke: "Luke", john: "John",
  acts: "Acts", romans: "Romans", "1corinthians": "1Corinthians",
  "2corinthians": "2Corinthians", galatians: "Galatians",
  ephesians: "Ephesians", philippians: "Philippians", colossians: "Colossians",
  "1thessalonians": "1Thessalonians", "2thessalonians": "2Thessalonians",
  "1timothy": "1Timothy", "2timothy": "2Timothy", titus: "Titus",
  philemon: "Philemon", hebrews: "Hebrews", james: "James",
  "1peter": "1Peter", "2peter": "2Peter", "1john": "1John",
  "2john": "2John", "3john": "3John", jude: "Jude",
  revelation: "Revelation",
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "moms-bible-build" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJSON(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

async function downloadBook(bookId, ghFilename) {
  const outFile = join(DATA_DIR, `${bookId}.json`);

  // Skip if already downloaded with real data
  if (existsSync(outFile)) {
    try {
      const parsed = JSON.parse(readFileSync(outFile, "utf-8"));
      if (Object.keys(parsed.chapters || {}).length > 1) {
        console.log(`  ✓ ${ghFilename} (cached)`);
        return true;
      }
    } catch {}
  }

  const url = `https://raw.githubusercontent.com/aruljohn/Bible-kjv/refs/heads/master/${ghFilename}.json`;

  try {
    const raw = await fetchJSON(url);
    // Format: { "book": "Genesis", "chapters": [ { "chapter": "1", "verses": [{verse:"1",text:"..."}] }, ... ] }
    const chapters = {};
    if (Array.isArray(raw.chapters)) {
      for (const ch of raw.chapters) {
        const chNum = ch.chapter || String(raw.chapters.indexOf(ch) + 1);
        chapters[String(chNum)] = (ch.verses || []).map((v) => ({
          verse: parseInt(v.verse) || 0,
          text: v.text || "",
        }));
      }
    }

    writeFileSync(outFile, JSON.stringify({ book: raw.book || ghFilename, chapters }));
    console.log(`  ✓ ${ghFilename} (${Object.keys(chapters).length} chapters)`);
    return true;
  } catch (err) {
    console.error(`  ✗ ${ghFilename}: ${err.message}`);
    return false;
  }
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  console.log("Downloading KJV Bible data (public domain)...\n");

  const books = Object.entries(BOOK_MAP);
  let success = 0;
  let failed = 0;

  for (const [id, ghFilename] of books) {
    const ok = await downloadBook(id, ghFilename);
    if (ok) success++;
    else failed++;
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`\nDone: ${success} books downloaded, ${failed} failed.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(0); // Don't fail the build
});
