import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { 
  QrCode, 
  Settings, 
  Send, 
  FileText, 
  Image, 
  Video, 
  X, 
  UploadCloud, 
  CheckCircle, 
  AlertCircle,
  MessageSquareCode
} from 'lucide-react';

const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

function App() {
  // Config States
  const [isReady, setIsReady] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [bulkDelay, setBulkDelay] = useState(2);
  const [autoResponseDelay, setAutoResponseDelay] = useState(3);
  
  // Form States
  const [numbers, setNumbers] = useState('');
  const [message, setMessage] = useState('');
  const [isCaption, setIsCaption] = useState(true);
  
  // Media State
  const [media, setMedia] = useState(null); // { name, size, mimetype, base64 }
  
  // UI Log list
  const [logs, setLogs] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  const fileInputRef = useRef(null);

  // Connect to Socket.io
  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on('connect', () => {
      addLog('Conectado al servidor de WebSocket.');
    });

    socket.on('qr', (qr) => {
      setQrCode(qr);
      setIsReady(false);
      addLog('Nuevo código QR recibido. Escanéalo con WhatsApp.');
    });

    socket.on('ready', (readyStatus) => {
      setIsReady(readyStatus);
      if (readyStatus) {
        setQrCode(null);
        addLog('¡WhatsApp está conectado y listo!');
      } else {
        addLog('WhatsApp desconectado.');
      }
    });

    socket.on('disconnect', () => {
      addLog('Desconectado del servidor de WebSocket.');
    });

    // Fetch initial configuration
    fetchConfig();

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      if (data) {
        setAutoResponseDelay(data.autoResponseDelay);
        setIsReady(data.isReady);
      }
    } catch (error) {
      console.error('Error fetching config:', error);
    }
  };

  const addLog = (text) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prevLogs) => [{ text, time: timestamp }, ...prevLogs].slice(0, 50));
  };

  // Update backend config
  const handleConfigUpdate = async (value) => {
    setAutoResponseDelay(value);
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ autoResponseDelay: value }),
      });
      const data = await response.json();
      if (data.success) {
        addLog(`Configuración de auto-respuesta actualizada a ${value}s`);
      }
    } catch (error) {
      addLog('Error al actualizar configuración en el servidor.');
    }
  };

  // File processing helpers
  const processFile = (file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      setMedia({
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        mimetype: file.type,
        base64: base64
      });
      addLog(`Archivo cargado: ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  // Drag and Drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Clipboard Paste handler
  const handlePaste = (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1 || items[i].type.indexOf('pdf') !== -1 || items[i].type.indexOf('video') !== -1) {
        const file = items[i].getAsFile();
        processFile(file);
        break;
      }
    }
  };

  const handleFileClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const removeMedia = () => {
    setMedia(null);
    addLog('Archivo multimedia eliminado.');
  };

  // Submit Bulk Messages
  const handleSendBulk = async (e) => {
    e.preventDefault();
    if (!isReady) {
      alert('Debe conectar primero el bot de WhatsApp escaneando el código QR.');
      return;
    }

    const numberList = numbers
      .split(',')
      .map(num => num.trim())
      .filter(num => num.length > 0);

    if (numberList.length === 0) {
      alert('Por favor ingrese al menos un número telefónico.');
      return;
    }

    if (!message && !media) {
      alert('Por favor ingrese un mensaje de texto o cargue un archivo.');
      return;
    }

    setIsSending(true);
    addLog(`Enviando mensajes a ${numberList.length} destinatarios con retardo de ${bulkDelay}s...`);

    try {
      const response = await fetch('/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          numbers: numberList,
          message,
          media,
          bulkDelay: Number(bulkDelay),
          isCaption
        }),
      });

      const data = await response.json();
      if (data.success) {
        addLog(data.message);
      } else {
        addLog(`Error al iniciar envío masivo: ${data.error}`);
      }
    } catch (error) {
      addLog('Error de red al intentar enviar mensajes.');
    } finally {
      setIsSending(false);
    }
  };

  // Help detect icon type
  const renderMediaIcon = (mime) => {
    if (mime.includes('image')) return <Image size={24} className="text-emerald-400" />;
    if (mime.includes('video')) return <Video size={24} className="text-blue-400" />;
    return <FileText size={24} className="text-amber-400" />;
  };

  return (
    <div className="container" onPaste={handlePaste}>
      <header className="header">
        <h1>🤖 ChatyBot</h1>
        <p>Sistema Avanzado de Gestión y Automatización de WhatsApp</p>
      </header>

      <div className="grid-layout">
        {/* Left Column - Connection & Settings */}
        <div className="sidebar-column">
          {/* Connection Panel */}
          <div className="glass-card">
            <h2>
              <QrCode className="text-emerald-400" /> Estado de Conexión
            </h2>
            <div style={{ marginBottom: '16px' }}>
              <span className={`status-badge ${isReady ? 'connected' : 'disconnected'}`}>
                {isReady ? '🟢 Conectado' : '🔴 Desconectado'}
              </span>
            </div>
            
            {!isReady && qrCode && (
              <div className="qr-container">
                <div className="qr-wrapper">
                  <QRCodeSVG value={qrCode} size={200} />
                </div>
                <p style={{ marginTop: '12px', fontSize: '0.85rem' }}>
                  Escanea este código QR desde WhatsApp para vincular el bot.
                </p>
              </div>
            )}

            {!isReady && !qrCode && (
              <div className="qr-container">
                <p style={{ color: 'var(--color-text-muted)' }}>
                  Esperando generación de código QR o conectando...
                </p>
              </div>
            )}

            {isReady && (
              <div className="qr-container" style={{ borderColor: 'var(--color-primary)' }}>
                <CheckCircle size={48} className="text-emerald-400" style={{ color: '#10b981' }} />
                <p style={{ marginTop: '8px', color: '#10b981', fontWeight: 600 }}>
                  ¡Listo para enviar mensajes!
                </p>
              </div>
            )}
          </div>

          {/* Time Configuration Panel */}
          <div className="glass-card">
            <h2>
              <Settings className="text-emerald-400" /> Configuración de Tiempos
            </h2>

            <div className="form-group">
              <label>Retraso en envíos masivos (segundos)</label>
              <input 
                type="number" 
                className="input-control" 
                value={bulkDelay}
                onChange={(e) => setBulkDelay(Math.max(0, Number(e.target.value)))}
                min="0"
              />
              <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                Intervalo de seguridad para evitar bloqueos por spam.
              </p>
            </div>

            <div className="form-group">
              <label>Simulación de escritura (segundos)</label>
              <input 
                type="number" 
                className="input-control" 
                value={autoResponseDelay}
                onChange={(e) => handleConfigUpdate(Math.max(0, Number(e.target.value)))}
                min="0"
              />
              <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                Tiempo de espera activo antes de auto-responder.
              </p>
            </div>
          </div>

          {/* Real-time Activity Logs */}
          <div className="glass-card">
            <h2>
              <MessageSquareCode className="text-emerald-400" /> Actividad del Sistema
            </h2>
            <ul className="logs-list">
              {logs.length === 0 ? (
                <li style={{ textAlign: 'center', padding: '10px 0' }}>Ningún evento registrado aún.</li>
              ) : (
                logs.map((log, index) => (
                  <li key={index}>
                    <span className="time">[{log.time}]</span>
                    {log.text}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* Right Column - Formulation & Media Dropzone */}
        <div className="main-column">
          <div className="glass-card">
            <h2>
              <Send className="text-emerald-400" /> Formulario de Envío Masivo
            </h2>

            <form onSubmit={handleSendBulk}>
              <div className="form-group">
                <label>Números Telefónicos (separados por comas)</label>
                <input 
                  type="text" 
                  className="input-control" 
                  placeholder="ej: 34600000000, 34611111111"
                  value={numbers}
                  onChange={(e) => setNumbers(e.target.value)}
                  required
                />
                <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                  Incluya siempre el código del país sin el símbolo "+" (ej: 52... para México, 34... para España).
                </p>
              </div>

              <div className="form-group">
                <label>Mensaje de Texto</label>
                <textarea 
                  className="input-control" 
                  placeholder="Escribe el cuerpo del mensaje aquí..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {/* Advanced Dropzone Container */}
              <div className="form-group">
                <label>Archivo Multimedia (Opcional - Imagen, PDF, Video)</label>
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  onChange={handleFileChange}
                  accept="image/*,application/pdf,video/*"
                />

                <div 
                  className={`dropzone-container ${dragActive ? 'drag-active' : ''}`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={handleFileClick}
                >
                  <UploadCloud size={32} className="text-emerald-400" />
                  <div>
                    <p style={{ fontWeight: 600 }}>Arrastra y suelta tu archivo aquí</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                      O haz clic para examinar archivos. También puedes pegar desde tu portapapeles (Ctrl + V).
                    </p>
                  </div>
                </div>

                {media && (
                  <div className="preview-container">
                    {media.mimetype.includes('image') ? (
                      <img 
                        src={`data:${media.mimetype};base64,${media.base64}`} 
                        alt="Preview" 
                        className="preview-thumbnail" 
                      />
                    ) : (
                      <div className="preview-thumbnail" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {renderMediaIcon(media.mimetype)}
                      </div>
                    )}
                    <div className="preview-info">
                      <div className="preview-name">{media.name}</div>
                      <div className="preview-size">{media.size}</div>
                    </div>
                    <button 
                      type="button" 
                      className="btn btn-danger-outline btn-small"
                      onClick={removeMedia}
                    >
                      <X size={16} /> Quitar
                    </button>
                  </div>
                )}
              </div>

              {/* Mode Toggle Caption vs Independent */}
              {media && (
                <div className="form-group">
                  <div 
                    className={`toggle-container ${isCaption ? 'active' : ''}`}
                    onClick={() => setIsCaption(!isCaption)}
                  >
                    <div>
                      <p style={{ fontWeight: 500, color: 'var(--color-text-main)' }}>Modo Caption (Leyenda)</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {isCaption 
                          ? 'El texto se enviará integrado en el pie del archivo multimedia.' 
                          : 'El archivo se enviará primero y el texto de forma independiente inmediatamente después.'}
                      </p>
                    </div>
                    <div className="toggle-switch"></div>
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={isSending}
                style={{ marginTop: '12px' }}
              >
                <Send size={18} /> {isSending ? 'Enviando...' : 'Iniciar Envío Masivo'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
