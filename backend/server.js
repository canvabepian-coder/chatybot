const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

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

// Variables de configuración en memoria (en segundos)
let autoResponseDelay = 3; 

// Helper de pausa
const delay = ms => new Promise(res => setTimeout(res, ms));

// Inicializar whatsapp-web.js utilizando LocalAuth para mantener la sesión
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
  // Re-inicializar para volver a pedir QR
  client.initialize().catch(err => console.error('Error al re-inicializar:', err));
});

// Ejemplos de Multimedia Ficticios
const DUMMY_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; // 1x1 Pixel
const DUMMY_PDF_BASE64 = 'JVBERi0xLjQKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nCiAgICAgL1BhZ2VzIDIgMCBSCiAgPj4KZW5kb2JqCjIgMCBvYmogIDw8IC9UeXBlIC9QYWdlcwogICAgIC9LaWRzIFszIDAgUl0KICAgICAvQ291bnQgMQogID4+CmVuZG9iaiozIDAgb2JqCiAgPDwgL1R5cGUgL1BhZ2UKICAgICAvUGFyZW50IDIgMCBSCiAgICAgL01lZGlhQm94IFswIDAgNTk1IDg0Ml0KICAgICAvQ29udGVudHMgNCAwIFIKICAgICAvUmVzb3VyY2VzIDw8Pj4KICA+PgplbmRvYmoKNCAwIG9iagogIDw8IC9MZW5ndGggMTIgPj4Kc3RyZWFtCkJUCi9GMSAxMiBUZgplbmRzdHJlYW0KZW5kb2JqCnRyYWlsZXIKICA8PCAvUm9vdCAxIDAgUgoKICAgICAvU2l6ZSA1CiAgPj4KJSVFT0Y=';

// Lógica de Auto-respuestas
client.on('message', async (msg) => {
  const text = msg.body.toLowerCase().trim();
  
  if (text === 'hola' || text === 'precio' || text === 'imagen' || text === 'pdf') {
    try {
      const chat = await msg.getChat();
      
      // Activar estado de escritura
      await chat.sendStateTyping();
      
      // Esperar los segundos configurados en autoResponseDelay
      await delay(autoResponseDelay * 1000);
      
      if (text === 'hola') {
        await msg.reply('¡Hola! Soy un bot automatizado. Puedes consultarme por:\n- *precio* (para ver tarifas)\n- *imagen* (para recibir una imagen de prueba)\n- *pdf* (para recibir un PDF de prueba)');
      } else if (text === 'precio') {
        await msg.reply('Nuestros precios varían según el plan. El plan básico empieza en $10 USD/mes.');
      } else if (text === 'imagen') {
        // Enviar imagen ficticia. Mostramos ejemplo con Caption
        const media = new MessageMedia('image/png', DUMMY_IMAGE_BASE64, 'ejemplo.png');
        await client.sendMessage(msg.from, media, { caption: 'Aquí tienes la imagen de prueba solicitada (Modo Caption).' });
      } else if (text === 'pdf') {
        // Enviar PDF de prueba. Mostramos ejemplo con envío Independiente
        const media = new MessageMedia('application/pdf', DUMMY_PDF_BASE64, 'documento_ejemplo.pdf');
        // Primero enviamos el archivo
        await client.sendMessage(msg.from, media);
        // Esperamos un momento y enviamos el texto independiente
        await delay(500);
        await client.sendMessage(msg.from, 'Aquí tienes el PDF de prueba solicitado (Modo Independiente).');
      }
      
      // Detener estado de escritura
      await chat.clearState();
    } catch (err) {
      console.error('Error al manejar auto-respuesta:', err);
    }
  }
});

// Conexión Socket.io
io.on('connection', (socket) => {
  console.log('Cliente Socket.io conectado:', socket.id);
  // Enviar estado actual al conectarse
  socket.emit('ready', isReady);
  if (latestQr && !isReady) {
    socket.emit('qr', latestQr);
  }

  socket.on('disconnect', () => {
    console.log('Cliente Socket.io desconectado:', socket.id);
  });
});

// Endpoint para actualizar configuración en memoria
app.post('/api/config', (req, res) => {
  const { autoResponseDelay: newDelay } = req.body;
  if (typeof newDelay === 'number' && newDelay >= 0) {
    autoResponseDelay = newDelay;
    console.log(`Configuración actualizada: autoResponseDelay = ${autoResponseDelay}s`);
    return res.json({ success: true, autoResponseDelay });
  }
  return res.status(400).json({ error: 'Parámetro inválido' });
});

// Endpoint para consultar configuración actual
app.get('/api/config', (req, res) => {
  res.json({ autoResponseDelay, isReady });
});

// Endpoint de Envío Masivo
app.post('/api/send', async (req, res) => {
  const { numbers, message, media, bulkDelay, isCaption } = req.body;

  if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: 'Debe proporcionar una lista de números en un array.' });
  }

  const delayTime = typeof bulkDelay === 'number' ? bulkDelay : 2; // por defecto 2 segundos

  // Ejecutamos el envío masivo de forma asíncrona sin bloquear la respuesta HTTP
  // Pero devolvemos una confirmación de que el proceso ha iniciado
  res.json({ success: true, message: `Proceso de envío masivo iniciado para ${numbers.length} números.` });

  for (let i = 0; i < numbers.length; i++) {
    const rawNumber = numbers[i].replace(/[^\d]/g, '');
    if (!rawNumber) continue;

    // whatsapp-web.js requiere el formato 'numero@c.us'
    const formattedNumber = `${rawNumber}@c.us`;

    try {
      if (media && media.base64 && media.mimetype) {
        // Logística multimedia
        const messageMedia = new MessageMedia(media.mimetype, media.base64, media.filename || 'archivo');
        
        if (isCaption) {
          // Modo Caption (integrado como pie de página del archivo)
          await client.sendMessage(formattedNumber, messageMedia, { caption: message || '' });
        } else {
          // Modo Independiente (el archivo primero y el texto secuencialmente)
          await client.sendMessage(formattedNumber, messageMedia);
          if (message) {
            await delay(500); // Pequeño delay de cortesía entre el archivo y el texto
            await client.sendMessage(formattedNumber, message);
          }
        }
      } else if (message) {
        // Solo texto
        await client.sendMessage(formattedNumber, message);
      }
      console.log(`Mensaje enviado con éxito a: ${formattedNumber}`);
    } catch (err) {
      console.error(`Error al enviar mensaje a ${formattedNumber}:`, err);
    }

    // Aplicar delay obligatorio entre cada número
    if (i < numbers.length - 1) {
      console.log(`Esperando ${delayTime} segundos antes del siguiente envío...`);
      await delay(delayTime * 1000);
    }
  }
});

// Inicializar cliente de WhatsApp
client.initialize().catch(err => {
  console.error('Error al inicializar cliente de WhatsApp:', err);
});

// Iniciar servidor Express
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor de Chatbot corriendo en el puerto ${PORT}`);
});
