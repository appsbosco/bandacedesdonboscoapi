/**
 * cleanup_attendance_feb14_only.mongosh.js
 *
 * RUN:
 *   mongosh "MONGODB_URI" --file cleanup_attendance_feb14_only.mongosh.js
 *
 * Opcional:
 *   DB_NAME=APP-BCDB mongosh "MONGODB_URI" --file cleanup_attendance_feb14_only.mongosh.js
 */

const TZ = "America/Costa_Rica";
const TARGET_DAY = "2026-02-14";

// DB
const DB_NAME =
  (typeof process !== "undefined" && process.env && process.env.DB_NAME) ||
  "APP-BCDB";
const database = db.getSiblingDB(DB_NAME);

// Collections
const sessionsCol = database.getCollection("rehearsalSessions");
const recordsCol = database.getCollection("attendanceRecords");

function dayExpr(fieldPath) {
  return {
    $dateToString: { date: fieldPath, timezone: TZ, format: "%Y-%m-%d" },
  };
}

function isTargetDayMatch() {
  return { $expr: { $eq: [dayExpr("$dateNormalized"), TARGET_DAY] } };
}

function isNotTargetDayMatch() {
  return { $expr: { $ne: [dayExpr("$dateNormalized"), TARGET_DAY] } };
}

function toMillis(d) {
  if (!d) return 0;
  try {
    return new Date(d).getTime();
  } catch {
    return 0;
  }
}

function logCounts(label) {
  const sessCount = sessionsCol.countDocuments();
  const recCount = recordsCol.countDocuments();
  print(`\n📊 ${label}`);
  print(`- rehearsalSessions: ${sessCount}`);
  print(`- attendanceRecords: ${recCount}`);
}

(function main() {
  print(`\n🧹 Limpieza: SOLO ${TARGET_DAY} (TZ=${TZ}) en DB=${DB_NAME}`);
  logCounts("ANTES");

  // 1) Encontrar sesiones del 14-feb (CR) que vamos a conservar
  const keepSessions = sessionsCol
    .find(isTargetDayMatch(), {
      projection: { _id: 1, section: 1, createdAt: 1 },
    })
    .toArray();

  if (!keepSessions.length) {
    print(
      `\n❌ No encontré rehearsalSessions para ${TARGET_DAY}. ABORTO para no borrar todo.`,
    );
    print(
      `   Revisá que dateNormalized esté bien o que la DB_NAME sea correcta.`,
    );
    return;
  }

  const keepIds = keepSessions.map((s) => s._id);

  print(`\n✅ Sesiones encontradas para ${TARGET_DAY}: ${keepIds.length}`);

  // 2) Borrar attendanceRecords que NO pertenezcan a sesiones del 14-feb
  const delRecRes = recordsCol.deleteMany({ session: { $nin: keepIds } });
  print(
    `🗑️ attendanceRecords borrados (fuera del 14-feb): ${delRecRes.deletedCount}`,
  );

  // 3) Borrar rehearsalSessions que NO sean del 14-feb
  const delSessRes = sessionsCol.deleteMany(isNotTargetDayMatch());
  print(
    `🗑️ rehearsalSessions borradas (fuera del 14-feb): ${delSessRes.deletedCount}`,
  );

  // 4) Re-cargar sesiones del día (por si hubo cambios)
  const daySessions = sessionsCol
    .find(isTargetDayMatch(), {
      projection: { _id: 1, section: 1, createdAt: 1 },
    })
    .toArray();

  // Agrupar por sección
  const bySection = {};
  for (const s of daySessions) {
    const key = s.section || "SIN_SECCION";
    bySection[key] = bySection[key] || [];
    bySection[key].push(s);
  }

  // 5) Merge de sesiones duplicadas por sección
  let mergedSessions = 0;
  let movedRecords = 0;
  let deletedDupRecords = 0;

  for (const section of Object.keys(bySection)) {
    const list = bySection[section];
    if (list.length <= 1) continue;

    const ids = list.map((x) => x._id);

    // contar records por sesión para elegir canonical (más records, y si empate, más vieja)
    const countsArr = recordsCol
      .aggregate([
        { $match: { session: { $in: ids } } },
        { $group: { _id: "$session", c: { $sum: 1 } } },
      ])
      .toArray();

    const counts = new Map(countsArr.map((x) => [String(x._id), x.c]));

    list.sort((a, b) => {
      const ca = counts.get(String(a._id)) || 0;
      const cb = counts.get(String(b._id)) || 0;
      if (cb !== ca) return cb - ca; // más records primero
      return toMillis(a.createdAt) - toMillis(b.createdAt); // más vieja primero
    });

    const canonical = list[0];
    const dupSessions = list.slice(1);

    print(
      `\n🔁 Sección ${section}: ${list.length} sesiones -> canonical=${canonical._id}`,
    );

    for (const dup of dupSessions) {
      // Traer todos los records de la sesión duplicada
      const cursor = recordsCol.find(
        { session: dup._id },
        {
          projection: {
            _id: 1,
            user: 1,
            status: 1,
            notes: 1,
            recordedBy: 1,
            createdAt: 1,
            updatedAt: 1,
            legacyId: 1,
            legacyAttended: 1,
            legacyDate: 1,
          },
        },
      );

      while (cursor.hasNext()) {
        const rec = cursor.next();

        const existing = recordsCol.findOne(
          { session: canonical._id, user: rec.user },
          { projection: { _id: 1, updatedAt: 1 } },
        );

        if (!existing) {
          // mover record a canonical
          const r = recordsCol.updateOne(
            { _id: rec._id },
            { $set: { session: canonical._id } },
          );
          if (r.modifiedCount === 1) movedRecords++;
          continue;
        }

        // Si ya existe para ese user en canonical -> dedupe: conservar el más reciente por updatedAt
        const recU = toMillis(rec.updatedAt);
        const exU = toMillis(existing.updatedAt);

        if (recU > exU) {
          // reemplazar contenido del existente con el más nuevo, y borrar el duplicado
          recordsCol.updateOne(
            { _id: existing._id },
            {
              $set: {
                status: rec.status,
                notes: rec.notes,
                recordedBy: rec.recordedBy,
                updatedAt: rec.updatedAt || new Date(),
                // conservar trazas legacy si venían
                ...(rec.legacyId ? { legacyId: rec.legacyId } : {}),
                ...(rec.legacyAttended
                  ? { legacyAttended: rec.legacyAttended }
                  : {}),
                ...(rec.legacyDate ? { legacyDate: rec.legacyDate } : {}),
              },
            },
          );
        }

        const d = recordsCol.deleteOne({ _id: rec._id });
        if (d.deletedCount === 1) deletedDupRecords++;
      }

      // borrar la sesión duplicada ya vaciada/mergeada
      const ds = sessionsCol.deleteOne({ _id: dup._id });
      if (ds.deletedCount === 1) mergedSessions++;
    }
  }

  print(`\n✅ Merge terminado`);
  print(`- Sesiones duplicadas borradas: ${mergedSessions}`);
  print(`- Records movidos a canonical: ${movedRecords}`);
  print(`- Records duplicados borrados: ${deletedDupRecords}`);

  // 6) Chequeo de duplicados (session,user) y asegurar índice unique
  const dupPairs = recordsCol
    .aggregate([
      {
        $group: { _id: { session: "$session", user: "$user" }, c: { $sum: 1 } },
      },
      { $match: { c: { $gt: 1 } } },
      { $limit: 5 },
    ])
    .toArray();

  if (dupPairs.length) {
    print(`\n⚠️ Aún hay duplicados (session,user). Ejemplos:`);
    printjson(dupPairs);
    print(`⚠️ No intento crear índice unique porque fallaría.`);
  } else {
    // crear índice si no existe
    const idx = recordsCol.getIndexes().map((i) => i.name);
    if (!idx.includes("session_1_user_1")) {
      recordsCol.createIndex(
        { session: 1, user: 1 },
        { name: "session_1_user_1", unique: true },
      );
      print(`\n🔒 Índice unique creado: session_1_user_1`);
    } else {
      print(`\nℹ️ Índice session_1_user_1 ya existe`);
    }
  }

  logCounts("DESPUÉS");

  print(
    `\n🏁 Listo. Quedó SOLO data del 14-feb y dedupe por usuario en ese día.`,
  );
})();
