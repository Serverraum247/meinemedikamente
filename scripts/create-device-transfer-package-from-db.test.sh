#!/usr/bin/env bash
set -euo pipefail

tmp_dir="$(mktemp -d /tmp/meinmediplan-transfer-test.XXXXXX)"
db_path="$tmp_dir/meine_medikamente.db"
out_path="$tmp_dir/test-transfer.mmptransfer"
code="1111-2222-3333-4444-5555-6666-7777-8888"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

sqlite3 "$db_path" <<'SQL'
CREATE TABLE personen (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  avatar_emoji TEXT,
  avatar_uri TEXT,
  ist_standard INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
);

CREATE TABLE medikamente (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  zusatz TEXT NOT NULL DEFAULT '',
  person_id TEXT NOT NULL,
  aktueller_bestand REAL NOT NULL DEFAULT 0,
  einzeldosis REAL NOT NULL DEFAULT 1.0,
  einheit TEXT NOT NULL DEFAULT 'Tabletten',
  pzn TEXT NOT NULL DEFAULT '',
  packungsgroesse REAL NOT NULL DEFAULT 0,
  warnung_ab_bestand REAL NOT NULL DEFAULT 7.0,
  sync_status INTEGER NOT NULL DEFAULT 0,
  erinnerung_aktiv INTEGER NOT NULL DEFAULT 0,
  einnahme_uhrzeiten TEXT NOT NULL DEFAULT '[]',
  auto_abzug_aktiv INTEGER NOT NULL DEFAULT 0,
  fruehe_einnahme_erlaubt INTEGER NOT NULL DEFAULT 1,
  arzt_id TEXT NOT NULL DEFAULT '',
  staerke_wert REAL NOT NULL DEFAULT 0,
  staerke_einheit TEXT NOT NULL DEFAULT '',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE packungen (
  id TEXT PRIMARY KEY NOT NULL,
  medikament_id TEXT NOT NULL,
  groesse REAL NOT NULL DEFAULT 0,
  pzn TEXT NOT NULL DEFAULT '',
  ist_ersatzprodukt INTEGER NOT NULL DEFAULT 0,
  ersatz_name TEXT NOT NULL DEFAULT '',
  gekauft_am TEXT,
  menge_verbleibend REAL NOT NULL DEFAULT 0
);

CREATE TABLE einnahmen (
  id TEXT PRIMARY KEY NOT NULL,
  medikament_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  menge REAL NOT NULL DEFAULT 0,
  timestamp TEXT NOT NULL,
  slot TEXT NOT NULL DEFAULT '',
  notiz TEXT NOT NULL DEFAULT ''
);

CREATE TABLE arzt_urlaub (
  id TEXT PRIMARY KEY NOT NULL,
  person_id TEXT NOT NULL,
  arzt_id TEXT NOT NULL DEFAULT '',
  praxis_name TEXT NOT NULL DEFAULT '',
  telefon TEXT NOT NULL DEFAULT '',
  urlaub_start TEXT NOT NULL,
  urlaub_ende TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE aerzte (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  telefon_landesvorwahl TEXT NOT NULL DEFAULT '',
  telefon TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  adresse TEXT NOT NULL DEFAULT '',
  plz TEXT NOT NULL DEFAULT '',
  ort TEXT NOT NULL DEFAULT '',
  land TEXT NOT NULL DEFAULT '',
  fachgebiet TEXT NOT NULL DEFAULT '',
  created_at TEXT
);

CREATE TABLE einstellungen (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

INSERT INTO personen (id, name, avatar_emoji, avatar_uri, ist_standard, created_at)
VALUES ('person-1', 'Daniel', '👤', '/private/avatar.jpg', 1, '2026-06-01T10:00:00.000Z');

INSERT INTO medikamente (
  id, name, zusatz, person_id, aktueller_bestand, einzeldosis, einheit, pzn, packungsgroesse,
  warnung_ab_bestand, sync_status, erinnerung_aktiv, einnahme_uhrzeiten, auto_abzug_aktiv,
  fruehe_einnahme_erlaubt, arzt_id, staerke_wert, staerke_einheit, created_at, updated_at
)
VALUES (
  'med-1', 'Ramipril', '', 'person-1', 20, 1, 'Tabletten', '', 50,
  7, 0, 1, '["08:00"]', 0, 1, '', 5, 'mg', '2026-06-01T10:00:00.000Z', '2026-06-01T10:00:00.000Z'
);

INSERT INTO einstellungen (key, value) VALUES
  ('premium_aktiv', 'true'),
  ('aktive_person_id', 'person-1'),
  ('einnahmeplan_default_uhrzeiten', '{"morgens":"07:30"}');
SQL

node scripts/create-device-transfer-package-from-db.js \
  --db "$db_path" \
  --out "$out_path" \
  --code "$code" \
  --verify >"$tmp_dir/output.log"

test -s "$out_path"

python3 - "$out_path" <<'PY'
import json
import sys
from pathlib import Path

package = json.loads(Path(sys.argv[1]).read_text())
assert package["magic"] == "MEIN_MEDIPLAN_TRANSFER"
assert package["ciphertext"]
assert package["header"]
assert package["mac"]
PY

grep -q 'Sicheres Paket geschrieben:' "$tmp_dir/output.log"
grep -q 'Inhalt: 1 Personen, 1 Medikamente' "$tmp_dir/output.log"

echo "create-device-transfer-package-from-db: OK"
