const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Aumentar el límite de carga de Express para archivos pesados
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// Variables de configuración en memoria (sincronizadas con base de datos)
let autoResponseDelay = 3; 

// Cargar autoResponseDelay inicial desde DB
db.get("SELECT value FROM settings WHERE key = 'autoResponseDelay'", (err, row) => {
  if (!err && row) {
    autoResponseDelay = Number(row.value);
    console.log(`autoResponseDelay inicializado desde DB: ${autoResponseDelay}s`);
  }
});

// Helper de pausa
const delay = ms => new Promise(res => setTimeout(res, ms));

// Inicializar whatsapp-web.js utilizando LocalAuth y webVersionCache
const client = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
  },
  puppeteer: {
    headless: true,
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--ignore-certificate-errors',
      '--ignore-ssl-errors'
    ]
  }
});

let isReady = false;
let latestQr = null;

// Eventos del cliente de WhatsApp
client.on('qr', (qr) => {
  console.log('Código QR recibido.');
  latestQr = qr;
  io.emit('qr', qr);
});

client.on('ready', () => {
  console.log('Cliente de WhatsApp listo.');
  isReady = true;
  latestQr = null;
  io.emit('ready', true);
});

client.on('disconnected', (reason) => {
  console.log('Cliente de WhatsApp desconectado:', reason);
  isReady = false;
  io.emit('ready', false);
  client.initialize().catch(err => console.error('Error al re-inicializar:', err));
});

// Lógica de Auto-respuestas Dinámicas desde SQLite
client.on('message', async (msg) => {
  const text = msg.body.toLowerCase().trim();

  // Consultar todas las reglas de triggers guardadas en base de datos
  db.all("SELECT * FROM triggers", async (err, rows) => {
    if (err || !rows) return;

    // Buscar coincidencia basada en el match_type
    const matchedTrigger = rows.find(trigger => {
      const keyword = trigger.keyword.toLowerCase().trim();
      if (trigger.match_type === 'exact') {
        return text === keyword;
      } else if (trigger.match_type === 'contains') {
        return text.includes(keyword);
      }
      return false;
    });

    if (matchedTrigger) {
      try {
        const chat = await msg.getChat();
        
        // Activar estado de escritura
        await chat.sendStateTyping();
        
        // Esperar la demora configurada
        await delay(autoResponseDelay * 1000);
        
        if (matchedTrigger.media_base64 && matchedTrigger.media_mimetype) {
          const media = new MessageMedia(
            matchedTrigger.media_mimetype,
            matchedTrigger.media_base64,
            matchedTrigger.media_filename || 'archivo'
          );

          if (matchedTrigger.is_caption) {
            // Con caption
            await client.sendMessage(msg.from, media, { caption: matchedTrigger.response_text || '' });
          } else {
            // Independiente
            await client.sendMessage(msg.from, media);
            if (matchedTrigger.response_text) {
              await delay(500);
              await client.sendMessage(msg.from, matchedTrigger.response_text);
            }
          }
        } else if (matchedTrigger.response_text) {
          // Solo texto
          await client.sendMessage(msg.from, matchedTrigger.response_text);
        }
        
        // Limpiar estado de escritura
        await chat.clearState();
        console.log(`Auto-respuesta disparada para: "${msg.body}" -> Trigger: "${matchedTrigger.keyword}"`);
      } catch (err) {
        console.error('Error al manejar auto-respuesta:', err);
      }
    }
  });
});

// Conexión Socket.io
io.on('connection', (socket) => {
  console.log('Cliente Socket.io conectado:', socket.id);
  socket.emit('ready', isReady);
  if (latestQr && !isReady) {
    socket.emit('qr', latestQr);
  }

  socket.on('disconnect', () => {
    console.log('Cliente Socket.io desconectado:', socket.id);
  });
});

// GET Settings
app.get('/api/config', (req, res) => {
  res.json({ autoResponseDelay, isReady });
});

// POST Settings
app.post('/api/config', (req, res) => {
  const { autoResponseDelay: newDelay } = req.body;
  if (typeof newDelay === 'number' && newDelay >= 0) {
    autoResponseDelay = newDelay;
    
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['autoResponseDelay', newDelay.toString()], (err) => {
      if (err) {
        console.error('Error al guardar config en DB:', err.message);
      }
    });

    console.log(`Configuración actualizada: autoResponseDelay = ${autoResponseDelay}s`);
    return res.json({ success: true, autoResponseDelay });
  }
  return res.status(400).json({ error: 'Parámetro inválido' });
});

// --- API CRUD para Triggers ---

// Listar todos los disparadores
app.get('/api/triggers', (req, res) => {
  db.all("SELECT * FROM triggers ORDER BY id DESC", (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Crear o actualizar un disparador
app.post('/api/triggers', (req, res) => {
  const { id, keyword, match_type, response_text, media_base64, media_mimetype, media_filename, is_caption } = req.body;

  if (!keyword || !match_type || (!response_text && !media_base64)) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios (palabra clave, coincidencia y contenido de respuesta).' });
  }

  const captionVal = is_caption ? 1 : 0;

  if (id) {
    // Editar
    const query = `
      UPDATE triggers 
      SET keyword = ?, match_type = ?, response_text = ?, media_base64 = ?, media_mimetype = ?, media_filename = ?, is_caption = ?
      WHERE id = ?
    `;
    db.run(query, [keyword, match_type, response_text, media_base64, media_mimetype, media_filename, captionVal, id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, id });
    });
  } else {
    // Crear (INSERT OR REPLACE)
    const query = `
      INSERT OR REPLACE INTO triggers (keyword, match_type, response_text, media_base64, media_mimetype, media_filename, is_caption)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(query, [keyword, match_type, response_text, media_base64, media_mimetype, media_filename, captionVal], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, id: this.lastID });
    });
  }
});

// Eliminar un disparador
app.delete('/api/triggers/:id', (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM triggers WHERE id = ?", [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// --- Fin API CRUD para Triggers ---

// Endpoint de Envío Masivo con Variables Dinámicas
app.post('/api/send', async (req, res) => {
  const { contacts, template, media, bulkDelay, isCaption, countryCode } = req.body;

  if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'Debe proporcionar una lista de contactos.' });
  }

  const delayTime = typeof bulkDelay === 'number' ? bulkDelay : 2;

  // Devolver confirmación HTTP inmediata
  res.json({ success: true, message: `Proceso de envío masivo iniciado para ${contacts.length} destinatarios.` });

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    
    // Buscar la columna mapeada como teléfono. El frontend enviará los datos limpios.
    // Pero por si acaso, soportamos "phone", "telefono", "celular", "número", etc.
    let phoneKey = Object.keys(contact).find(k => k.toLowerCase() === 'phone' || k.toLowerCase() === 'telefono' || k.toLowerCase() === 'celular');
    if (!phoneKey) {
      // Si no hay clave explícita, tomamos la primera propiedad que parezca número telefónico
      phoneKey = Object.keys(contact)[0];
    }

    const rawPhone = String(contact[phoneKey] || '').replace(/[^\d]/g, '');
    if (!rawPhone) continue;

    // Prepender el código de país opcional si no está presente
    let targetPhone = rawPhone;
    if (countryCode && !targetPhone.startsWith(countryCode)) {
      targetPhone = countryCode + targetPhone;
    }

    const formattedNumber = `${targetPhone}@c.us`;

    // Resolver la plantilla dinámicamente con los campos del contacto
    let resolvedMessage = template || '';
    Object.keys(contact).forEach(key => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      resolvedMessage = resolvedMessage.replace(regex, contact[key] || '');
    });

    try {
      if (media && media.base64 && media.mimetype) {
        const messageMedia = new MessageMedia(media.mimetype, media.base64, media.filename || 'archivo');
        if (isCaption) {
          await client.sendMessage(formattedNumber, messageMedia, { caption: resolvedMessage });
        } else {
          await client.sendMessage(formattedNumber, messageMedia);
          if (resolvedMessage) {
            await delay(500);
            await client.sendMessage(formattedNumber, resolvedMessage);
          }
        }
      } else if (resolvedMessage) {
        await client.sendMessage(formattedNumber, resolvedMessage);
      }
      console.log(`Mensaje personalizado enviado a: ${formattedNumber}`);
    } catch (err) {
      console.error(`Error al enviar mensaje masivo personalizado a ${formattedNumber}:`, err);
    }

    // Delay entre envíos masivos
    if (i < contacts.length - 1) {
      console.log(`Esperando ${delayTime} segundos antes del siguiente envío...`);
      await delay(delayTime * 1000);
    }
  }
});

// Inicializar cliente
client.initialize().catch(err => {
  console.error('Error al inicializar cliente de WhatsApp:', err);
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor de Chatbot corriendo en el puerto ${PORT}`);
});
