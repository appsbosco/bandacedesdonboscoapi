function normalizeText(s) {
  return String(s || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // quita acentos
}

function inferSectionFromInstrument(instrument) {
  const i = normalizeText(instrument);
  if (!i) return null;

  // OJO: ajustá patrones a tus nombres reales en DB
  const rules = [
    { section: "FLAUTAS", patterns: ["FLAUTA", "PICCOLO", "TRAVERSA"] },
    {
      section: "CLARINETES",
      patterns: ["CLARINETE", "CLARINET", "CLARINETE BAJO", "BASS CLARINET"],
    },
    { section: "SAXOFONES", patterns: ["SAX", "SAXOFON"] },
    { section: "TROMPETAS", patterns: ["TROMPETA", "TRUMPET"] },
    { section: "TROMBONES", patterns: ["TROMBON", "TROMBONE"] },
    {
      section: "EUFONIOS",
      patterns: ["EUFONIO", "EUPHONIUM", "BARITONO", "BARITONE"],
    },
    { section: "TUBAS", patterns: ["TUBA", "SOUSAFON", "SOUSAPHONE"] },
    { section: "CORNOS", patterns: ["CORNO", "FRENCH HORN", "HORN"] },
    {
      section: "MALLETS",
      patterns: [
        "MALLET",
        "XILOFONO",
        "XYLOPHONE",
        "MARIMBA",
        "VIBRAFONO",
        "VIBRAPHONE",
        "GLOCKENSPIEL",
      ],
    },
    {
      section: "PERCUSION",
      patterns: [
        "PERCUS",
        "DRUM",
        "TAMBOR",
        "REDOBLANTE",
        "CAJA",
        "BOMBO",
        "PLATILLO",
        "CYMBAL",
        "TIMBAL",
      ],
    },
    {
      section: "COLOR_GUARD",
      patterns: ["COLOR GUARD", "BANDERA", "FLAG", "RIFLE", "SABLE", "SABRE"],
    },
    { section: "DANZA", patterns: ["DANZA", "BAILE"] },
  ];

  for (const r of rules) {
    if (r.patterns.some((p) => i.includes(normalizeText(p)))) return r.section;
  }

  return null; // mejor null que NO_APLICA para permisos
}

module.exports = {
  inferSectionFromInstrument,
};
