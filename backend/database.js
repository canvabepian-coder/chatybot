const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'chatybot.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos SQLite:', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite chatybot.db');
  }
});

// Inicializar tablas
db.serialize(() => {
  // Tabla de configuraciones
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Sembrar valores por defecto si no existen
  const insertStmt = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  insertStmt.run('autoResponseDelay', '3');
  insertStmt.run('bulkDelay', '2');
  insertStmt.finalize();

  // Tabla de disparadores (Triggers) de auto-respuestas
  db.run(`
    CREATE TABLE IF NOT EXISTS triggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT UNIQUE,
      match_type TEXT CHECK(match_type IN ('exact', 'contains')),
      response_text TEXT,
      media_base64 TEXT,
      media_mimetype TEXT,
      media_filename TEXT,
      is_caption INTEGER DEFAULT 1
    )
  `, (err) => {
    if (err) {
      console.error('Error al crear la tabla de disparadores:', err.message);
    } else {
      // Sembrar algunos ejemplos si la tabla está vacía
      db.get('SELECT COUNT(*) as count FROM triggers', (err, row) => {
        if (!err && row.count === 0) {
          const insertTrigger = db.prepare(`
            INSERT OR IGNORE INTO triggers (keyword, match_type, response_text, media_base64, media_mimetype, media_filename, is_caption)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          insertTrigger.run('hola', 'exact', '¡Hola! Soy un bot automatizado. Puedes consultarme por:\n- *precio* (para ver tarifas)\n- *imagen* (para recibir una imagen de prueba)\n- *pdf* (para recibir un PDF de prueba)', null, null, null, 1);
          insertTrigger.run('precio', 'contains', 'Nuestros precios varían según el plan. El plan básico empieza en $10 USD/mes.', null, null, null, 1);
          
          // Imagen ficticia por defecto
          const DUMMY_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
          insertTrigger.run('imagen', 'exact', 'Aquí tienes la imagen de prueba solicitada (Modo Caption).', DUMMY_IMAGE_BASE64, 'image/png', 'ejemplo.png', 1);
          
          // PDF ficticio por defecto
          const DUMMY_PDF_BASE64 = 'JVBERi0xLjQKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nCiAgICAgL1BhZ2VzIDIgMCBSCiAgPj4KZW5kb2JqCjIgMCBvYmogIDw8IC9UeXBlIC9QYWdlcwogICAgIC9LaWRzIFszIDAgUl0KICAgICAvQ291bnQgMQogID4+CmVuZG9iaiozIDAgb2JqCiAgPDwgL1R5cGUgL1BhZ2UKICAgICAvUGFyZW50IDIgMCBSCiAgICAgL01lZGlhQm94IFswIDAgNTk1IDg0Ml0KICAgICAvQ29udGVudHMgNCAwIFIKICAgICAvUmVzb3VyY2VzIDw8Pj4KICA+PgplbmRvYmoKNCAwIG9iagogIDw8IC9MZW5ndGggMTIgPj4Kc3RyZWFtCkJUCi9GMSAxMiBUZgplbmRzdHJlYW0KZW5kb2JqCnRyYWlsZXIKICA8PCAvUm9vdCAxIDAgUgoKICAgICAvU2l6ZSA1CiAgPj4KJSVFT0Y=';
          insertTrigger.run('pdf', 'exact', 'Aquí tienes el PDF de prueba solicitado (Modo Independiente).', DUMMY_PDF_BASE64, 'application/pdf', 'documento_ejemplo.pdf', 0);
          
          insertTrigger.finalize();
          console.log('Se sembraron los disparadores de ejemplo por defecto.');
        }
      });
    }
  });
});

module.exports = db;
