import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
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
  MessageSquareCode,
  ListPlus,
  Play,
  Copy,
  Trash2,
  Edit2,
  FileSpreadsheet,
  HelpCircle,
  Plus
} from 'lucide-react';

const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState('bulk'); // 'bulk' | 'triggers'

  // Config States
  const [isReady, setIsReady] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [bulkDelay, setBulkDelay] = useState(2);
  const [autoResponseDelay, setAutoResponseDelay] = useState(3);
  
  // Contacts and Mapping States
  const [contacts, setContacts] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [phoneColumn, setPhoneColumn] = useState('');
  const [nameColumn, setNameColumn] = useState('');
  const [emailColumn, setEmailColumn] = useState('');
  const [countryCode, setCountryCode] = useState(''); // e.g. '52'
  const [pastedText, setPastedText] = useState('');
  const [showPasteArea, setShowPasteArea] = useState(false);

  // Template message State
  const [template, setTemplate] = useState('Hola {{nombre}}, un gusto saludarlo. Le informamos que su correo electrónico es {{correo}}.');
  const [previewMessage, setPreviewMessage] = useState('');

  // Bulk Media State
  const [bulkMedia, setBulkMedia] = useState(null); // { name, size, mimetype, base64 }
  const [isCaption, setIsCaption] = useState(true);

  // Triggers CRUD States
  const [triggers, setTriggers] = useState([]);
  const [triggerId, setTriggerId] = useState(null);
  const [triggerKeyword, setTriggerKeyword] = useState('');
  const [triggerMatchType, setTriggerMatchType] = useState('exact');
  const [triggerResponse, setTriggerResponse] = useState('');
  const [triggerMedia, setTriggerMedia] = useState(null); // { name, size, mimetype, base64 }
  const [triggerIsCaption, setTriggerIsCaption] = useState(true);
  
  // UI Log list
  const [logs, setLogs] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  const fileInputRef = useRef(null);
  const triggerMediaInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Connect to Socket.io & Load settings / triggers
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

    // Fetch config & triggers on mount
    fetchConfig();
    fetchTriggers();

    return () => {
      socket.disconnect();
    };
  }, []);

  // Update preview compiled template whenever template, mapped columns, or contacts change
  useEffect(() => {
    if (contacts.length > 0) {
      const sampleContact = contacts[0];
      let resolved = template;
      
      // Resolve mapped name
      const nameVal = nameColumn ? sampleContact[nameColumn] : '';
      resolved = resolved.replace(/{{\s*nombre\s*}}/gi, nameVal);

      // Resolve mapped email
      const emailVal = emailColumn ? sampleContact[emailColumn] : '';
      resolved = resolved.replace(/{{\s*correo\s*}}/gi, emailVal);

      // Resolve any other header variable
      headers.forEach(header => {
        const regex = new RegExp(`{{\\s*${header}\\s*}}`, 'gi');
        resolved = resolved.replace(regex, sampleContact[header] || '');
      });

      setPreviewMessage(resolved);
    } else {
      setPreviewMessage('');
    }
  }, [template, contacts, nameColumn, emailColumn, headers]);

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

  const fetchTriggers = async () => {
    try {
      const response = await fetch('/api/triggers');
      const data = await response.json();
      if (Array.isArray(data)) {
        setTriggers(data);
      }
    } catch (error) {
      console.error('Error fetching triggers:', error);
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
        addLog(`Configuración de auto-respuesta guardada en DB: ${value}s`);
      }
    } catch (error) {
      addLog('Error al guardar configuración en la base de datos.');
    }
  };

  // Intelligent detection of columns (phone, name, email)
  const detectPhoneColumn = (headersList, contactsList) => {
    let foundPhone = '';
    let foundName = '';
    let foundEmail = '';

    // Search header names for matches
    headersList.forEach(header => {
      const lowHeader = header.toLowerCase();
      if (lowHeader.includes('tel') || lowHeader.includes('cel') || lowHeader.includes('phone') || lowHeader.includes('num')) {
        foundPhone = header;
      }
      if (lowHeader.includes('nom') || lowHeader.includes('name') || lowHeader.includes('cli')) {
        foundName = header;
      }
      if (lowHeader.includes('mail') || lowHeader.includes('corr') || lowHeader.includes('email')) {
        foundEmail = header;
      }
    });

    // If headers matching failed, scan first row values
    if (contactsList.length > 0) {
      const firstRow = contactsList[0];
      Object.keys(firstRow).forEach(key => {
        const val = String(firstRow[key]).trim();
        if (!foundPhone && /^\+?\d{8,15}$/.test(val.replace(/[^\d+]/g, ''))) {
          foundPhone = key;
        }
        if (!foundEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          foundEmail = key;
        }
      });
    }

    setPhoneColumn(foundPhone || headersList[0] || '');
    setNameColumn(foundName || '');
    setEmailColumn(foundEmail || '');
  };

  // Excel Upload Parser
  const handleExcelUpload = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (json.length === 0) {
          alert('El archivo de Excel está vacío.');
          return;
        }
        
        // Determinar cabeceras y filas
        let headersList = [];
        let dataRows = [];
        const firstRowHasNumbers = json[0].some(cell => /^\+?\d{7,15}$/.test(String(cell).replace(/[^\d+]/g, '')));
        if (!firstRowHasNumbers && json.length > 1) {
          headersList = json[0].map(h => String(h || '').trim());
          dataRows = json.slice(1);
        } else {
          headersList = json[0].map((_, idx) => `Columna_${idx + 1}`);
          dataRows = json;
        }

        // Convertir filas a objetos
        const parsedContacts = dataRows.map(row => {
          const contact = {};
          headersList.forEach((header, idx) => {
            contact[header] = row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : '';
          });
          return contact;
        }).filter(c => Object.values(c).some(val => val !== '')); // Quitar vacíos

        setHeaders(headersList);
        setContacts(parsedContacts);
        detectPhoneColumn(headersList, parsedContacts);
        addLog(`Importado exitosamente: ${parsedContacts.length} contactos desde Excel/CSV.`);
      } catch (err) {
        alert('Error al leer el archivo Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Clipboard Paste Excel cells parser (tab-separated text)
  const parsePastedExcelText = (text) => {
    if (!text || !text.trim()) return;
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const rows = lines.map(line => line.split('\t'));
    
    if (rows.length === 0) return;

    let headersList = [];
    let dataRows = [];
    const firstRowHasNumbers = rows[0].some(cell => /^\+?\d{7,15}$/.test(cell.replace(/[^\d+]/g, '')));
    if (!firstRowHasNumbers && rows.length > 1) {
      headersList = rows[0].map(h => h.trim() || 'Columna');
      dataRows = rows.slice(1);
    } else {
      headersList = rows[0].map((_, idx) => `Columna_${idx + 1}`);
      dataRows = rows;
    }

    const parsedContacts = dataRows.map(row => {
      const contact = {};
      headersList.forEach((header, idx) => {
        contact[header] = row[idx] ? row[idx].trim() : '';
      });
      return contact;
    }).filter(c => Object.values(c).some(val => val !== ''));

    setHeaders(headersList);
    setContacts(parsedContacts);
    detectPhoneColumn(headersList, parsedContacts);
    setShowPasteArea(false);
    setPastedText('');
    addLog(`Pegados exitosamente: ${parsedContacts.length} contactos desde portapapeles.`);
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
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        handleExcelUpload(file);
      } else {
        processMediaFile(file, setBulkMedia);
      }
    }
  };

  const processMediaFile = (file, setter) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      setter({
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        mimetype: file.type,
        base64: base64
      });
      addLog(`Archivo multimedia cargado: ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  const insertVariable = (variable) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const insertText = `{{${variable}}}`;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    setTemplate(before + insertText + after);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertText.length, start + insertText.length);
    }, 50);
  };

  // Submit Triggers (Save or Update in SQLite DB)
  const handleSaveTrigger = async (e) => {
    e.preventDefault();
    if (!triggerKeyword.trim()) {
      alert('Por favor ingrese una palabra clave.');
      return;
    }

    try {
      const body = {
        id: triggerId,
        keyword: triggerKeyword.trim(),
        match_type: triggerMatchType,
        response_text: triggerResponse,
        media_base64: triggerMedia ? triggerMedia.base64 : null,
        media_mimetype: triggerMedia ? triggerMedia.mimetype : null,
        media_filename: triggerMedia ? triggerMedia.name : null,
        is_caption: triggerIsCaption
      };

      const response = await fetch('/api/triggers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.success) {
        addLog(`Disparador guardado en DB: "${triggerKeyword}"`);
        // Reset form
        setTriggerId(null);
        setTriggerKeyword('');
        setTriggerMatchType('exact');
        setTriggerResponse('');
        setTriggerMedia(null);
        setTriggerIsCaption(true);
        fetchTriggers();
      } else {
        alert('Error al guardar disparador: ' + data.error);
      }
    } catch (error) {
      alert('Error de red al guardar disparador.');
    }
  };

  // Edit Trigger (Load trigger data into form)
  const handleEditTrigger = (trig) => {
    setTriggerId(trig.id);
    setTriggerKeyword(trig.keyword);
    setTriggerMatchType(trig.match_type);
    setTriggerResponse(trig.response_text || '');
    setTriggerIsCaption(trig.is_caption === 1);
    if (trig.media_base64) {
      setTriggerMedia({
        name: trig.media_filename || 'archivo',
        size: 'N/D',
        mimetype: trig.media_mimetype,
        base64: trig.media_base64
      });
    } else {
      setTriggerMedia(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    addLog(`Cargado disparador para edición: "${trig.keyword}"`);
  };

  // Delete Trigger from SQLite DB
  const handleDeleteTrigger = async (id, keyword) => {
    if (!window.confirm(`¿Seguro que deseas eliminar el disparador "${keyword}"?`)) return;

    try {
      const response = await fetch(`/api/triggers/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        addLog(`Disparador eliminado de DB: "${keyword}"`);
        fetchTriggers();
      }
    } catch (error) {
      addLog('Error de red al eliminar disparador.');
    }
  };

  // Submit Bulk Personalised Messages
  const handleSendBulkPersonalized = async (e) => {
    e.preventDefault();
    if (!isReady) {
      alert('Debe conectar primero el bot de WhatsApp escaneando el código QR.');
      return;
    }

    if (contacts.length === 0) {
      alert('Debe importar al menos un contacto desde un archivo de Excel o pegar datos.');
      return;
    }

    if (!phoneColumn) {
      alert('Por favor mapee la columna que contiene el número telefónico.');
      return;
    }

    setIsSending(true);
    addLog(`Iniciando envío masivo personalizado a ${contacts.length} destinatarios con retardo de ${bulkDelay}s...`);

    // Preprocesar contactos mapeados para enviarlos estructuradamente al backend
    const mappedContactsToSend = contacts.map(c => {
      const contactObj = {
        phone: String(c[phoneColumn] || '').trim(),
      };
      
      // Inject mapped variables: name as 'nombre', email as 'correo'
      if (nameColumn) contactObj['nombre'] = String(c[nameColumn] || '').trim();
      if (emailColumn) contactObj['correo'] = String(c[emailColumn] || '').trim();

      // Incorporate all other headers
      headers.forEach(h => {
        contactObj[h] = String(c[h] || '').trim();
      });

      return contactObj;
    });

    try {
      const response = await fetch('/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contacts: mappedContactsToSend,
          template: template,
          media: bulkMedia,
          bulkDelay: Number(bulkDelay),
          isCaption: isCaption,
          countryCode: countryCode.trim()
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

  const handleMediaUploadClick = () => {
    fileInputRef.current.click();
  };

  const handleTriggerMediaUploadClick = () => {
    triggerMediaInputRef.current.click();
  };

  const handleExcelFileClick = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleExcelUpload(file);
    }
  };

  return (
    <div className="container" onPaste={(e) => {
      // Solo capturar paste global si no estamos en un textarea o input de texto
      if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
        const text = e.clipboardData.getData('text');
        if (text && text.includes('\t')) {
          parsePastedExcelText(text);
        }
      }
    }}>
      <header className="header">
        <h1>🤖 ChatyBot V2</h1>
        <p>Gestión Masiva Personalizada por Excel & Triggers Auto-Persistidos</p>
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

        {/* Right Column - Navigation Tabs & Dynamic Forms */}
        <div className="main-column">
          <div className="tabs-header">
            <button 
              className={`tab-btn ${activeTab === 'bulk' ? 'active' : ''}`}
              onClick={() => setActiveTab('bulk')}
            >
              <FileSpreadsheet size={18} /> Envíos Masivos (Excel)
            </button>
            <button 
              className={`tab-btn ${activeTab === 'triggers' ? 'active' : ''}`}
              onClick={() => setActiveTab('triggers')}
            >
              <ListPlus size={18} /> Auto-respuestas (Triggers)
            </button>
          </div>

          {/* TAB 1: Bulk Sender with Excel Mapping */}
          {activeTab === 'bulk' && (
            <div className="glass-card">
              <h2>
                <Send className="text-emerald-400" /> Envíos Masivos Personalizados
              </h2>

              <div className="form-group">
                <label>1. Cargar Destinatarios (Excel, CSV o Pegar Datos)</label>
                
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <input 
                    type="file" 
                    id="excel-file" 
                    style={{ display: 'none' }} 
                    accept=".xlsx, .xls, .csv" 
                    onChange={handleExcelFileClick}
                  />
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    style={{ width: 'auto' }}
                    onClick={() => document.getElementById('excel-file').click()}
                  >
                    <FileSpreadsheet size={16} /> Subir Archivo Excel/CSV
                  </button>

                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    style={{ width: 'auto' }}
                    onClick={() => setShowPasteArea(!showPasteArea)}
                  >
                    {showPasteArea ? 'Ocultar Area de Pegar' : 'Pegar desde Excel (Ctrl+V)'}
                  </button>
                </div>

                {showPasteArea && (
                  <div className="form-group">
                    <textarea 
                      className="input-control" 
                      placeholder="Copia celdas de Excel y pégalas aquí directamente..." 
                      value={pastedText}
                      onChange={(e) => parsePastedExcelText(e.target.value)}
                      style={{ minHeight: '120px' }}
                    />
                  </div>
                )}

                {/* Contacts Preview Table */}
                {contacts.length > 0 && (
                  <div>
                    <h3 style={{ marginTop: '16px' }}>Mapeo de Columnas Inteligente</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      Hemos auto-detectado tus columnas. Por favor, confirma qué columna corresponde a cada campo:
                    </p>

                    <div className="mapping-grid">
                      <div className="mapping-card">
                        <label>📞 Teléfono (Obligatorio)</label>
                        <select 
                          className="input-control" 
                          value={phoneColumn} 
                          onChange={(e) => setPhoneColumn(e.target.value)}
                        >
                          <option value="">-- Seleccionar --</option>
                          {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div className="mapping-card">
                        <label>👤 Nombre (Mapeado como `nombre`)</label>
                        <select 
                          className="input-control" 
                          value={nameColumn} 
                          onChange={(e) => setNameColumn(e.target.value)}
                        >
                          <option value="">-- Ninguno (No mapear) --</option>
                          {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div className="mapping-card">
                        <label>✉️ Correo (Mapeado como `correo`)</label>
                        <select 
                          className="input-control" 
                          value={emailColumn} 
                          onChange={(e) => setEmailColumn(e.target.value)}
                        >
                          <option value="">-- Ninguno (No mapear) --</option>
                          {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div className="mapping-card">
                        <label>🌍 Código de País (Opcional)</label>
                        <input 
                          type="text" 
                          className="input-control" 
                          placeholder="Ej: 52 o 34" 
                          value={countryCode}
                          onChange={(e) => setCountryCode(e.target.value.replace(/[^\d]/g, ''))}
                        />
                      </div>
                    </div>

                    <h3>Destinatarios Cargados ({contacts.length} filas detectadas)</h3>
                    <div className="table-wrapper">
                      <table className="preview-table">
                        <thead>
                          <tr>
                            {headers.map((h, i) => (
                              <th key={i}>
                                {h} 
                                {h === phoneColumn && ' (📞)'}
                                {h === nameColumn && ' (👤)'}
                                {h === emailColumn && ' (✉️)'}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {contacts.slice(0, 5).map((row, rIdx) => (
                            <tr key={rIdx}>
                              {headers.map((h, cIdx) => (
                                <td key={cIdx}>{row[h] !== undefined ? String(row[h]) : ''}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {contacts.length > 5 && (
                      <p style={{ fontSize: '0.75rem', marginTop: '6px', textAlign: 'right' }}>
                        Mostrando solo las primeras 5 filas de vista previa.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Template Editor */}
              <div className="form-group" style={{ marginTop: '24px' }}>
                <label>2. Cuerpo del Mensaje (Soporta variables dinámicas)</label>
                
                {headers.length > 0 && (
                  <div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                      Variables disponibles (haz clic para insertar en el cursor):
                    </p>
                    <div className="variables-container">
                      {nameColumn && (
                        <span className="variable-badge" onClick={() => insertVariable('nombre')}>
                          nombre (👤 Mapeado)
                        </span>
                      )}
                      {emailColumn && (
                        <span className="variable-badge" onClick={() => insertVariable('correo')}>
                          correo (✉️ Mapeado)
                        </span>
                      )}
                      {headers.map(header => (
                        <span key={header} className="variable-badge" onClick={() => insertVariable(header)}>
                          {header}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <textarea 
                  ref={textareaRef}
                  className="input-control" 
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  placeholder="Hola {{nombre}}, un gusto saludarte. Tu saldo es {{Saldo}}..."
                  style={{ minHeight: '120px' }}
                />

                {contacts.length > 0 && previewMessage && (
                  <div style={{ marginTop: '12px' }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                      Vista previa del primer mensaje compilado:
                    </p>
                    <div className="live-preview-box">
                      {previewMessage}
                    </div>
                  </div>
                )}
              </div>

              {/* Media File Upload for Bulk Send */}
              <div className="form-group">
                <label>3. Archivo Multimedia Adjunto (Opcional)</label>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      processMediaFile(e.target.files[0], setBulkMedia);
                    }
                  }}
                  accept="image/*,application/pdf,video/*"
                />
                
                <div 
                  className={`dropzone-container ${dragActive ? 'drag-active' : ''}`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={handleMediaUploadClick}
                >
                  <UploadCloud size={28} className="text-emerald-400" />
                  <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Arrastra o selecciona tu archivo multimedia aquí</p>
                  </div>
                </div>

                {bulkMedia && (
                  <div className="preview-container">
                    {bulkMedia.mimetype.includes('image') ? (
                      <img 
                        src={`data:${bulkMedia.mimetype};base64,${bulkMedia.base64}`} 
                        alt="Preview" 
                        className="preview-thumbnail" 
                      />
                    ) : (
                      <div className="preview-thumbnail" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#222' }}>
                        <FileText size={20} className="text-emerald-400" />
                      </div>
                    )}
                    <div className="preview-info">
                      <div className="preview-name">{bulkMedia.name}</div>
                      <div className="preview-size">{bulkMedia.size}</div>
                    </div>
                    <button 
                      type="button" 
                      className="btn btn-danger-outline btn-small"
                      onClick={() => setBulkMedia(null)}
                    >
                      <X size={14} /> Quitar
                    </button>
                  </div>
                )}
              </div>

              {bulkMedia && (
                <div className="form-group">
                  <div 
                    className={`toggle-container ${isCaption ? 'active' : ''}`}
                    onClick={() => setIsCaption(!isCaption)}
                  >
                    <div>
                      <p style={{ fontWeight: 550, fontSize: '0.85rem' }}>Modo Caption (Leyenda del Archivo)</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {isCaption ? 'El texto se enviará integrado como pie del archivo multimedia.' : 'El archivo se enviará primero y el texto de forma independiente.'}
                      </p>
                    </div>
                    <div className="toggle-switch"></div>
                  </div>
                </div>
              )}

              <button 
                type="button" 
                className="btn btn-primary"
                onClick={handleSendBulkPersonalized}
                disabled={isSending || contacts.length === 0}
                style={{ marginTop: '12px' }}
              >
                <Play size={18} /> {isSending ? 'Enviando...' : `Lanzar Campaña para ${contacts.length} Contactos`}
              </button>
            </div>
          )}

          {/* TAB 2: Triggers Management (Auto-responses CRUD) */}
          {activeTab === 'triggers' && (
            <div className="main-column">
              {/* Form to Add / Edit Trigger */}
              <div className="glass-card">
                <h2>
                  <Plus className="text-emerald-400" /> {triggerId ? 'Editar Disparador' : 'Agregar Nuevo Disparador'}
                </h2>

                <form onSubmit={handleSaveTrigger}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-group">
                      <label>Palabra Clave (Trigger)</label>
                      <input 
                        type="text" 
                        className="input-control" 
                        placeholder="Ej: hola, precio, soporte" 
                        value={triggerKeyword}
                        onChange={(e) => setTriggerKeyword(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Tipo de Coincidencia</label>
                      <select 
                        className="input-control" 
                        value={triggerMatchType} 
                        onChange={(e) => setTriggerMatchType(e.target.value)}
                      >
                        <option value="exact">Exacta (Debe ser idéntica)</option>
                        <option value="contains">Contiene (Cualquier frase con la palabra)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Respuesta de Texto</label>
                    <textarea 
                      className="input-control" 
                      placeholder="Escribe la respuesta automática del bot..." 
                      value={triggerResponse}
                      onChange={(e) => setTriggerResponse(e.target.value)}
                    />
                  </div>

                  {/* Trigger Media Upload */}
                  <div className="form-group">
                    <label>Adjuntar Multimedia de Auto-respuesta (Opcional)</label>
                    <input 
                      type="file" 
                      ref={triggerMediaInputRef} 
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          processMediaFile(e.target.files[0], setTriggerMedia);
                        }
                      }}
                      accept="image/*,application/pdf,video/*"
                    />

                    <div 
                      className="dropzone-container"
                      onClick={handleTriggerMediaUploadClick}
                    >
                      <UploadCloud size={24} className="text-emerald-400" />
                      <p style={{ fontSize: '0.8rem' }}>Subir imagen, PDF o video para auto-respuesta</p>
                    </div>

                    {triggerMedia && (
                      <div className="preview-container">
                        <div className="preview-info">
                          <div className="preview-name">{triggerMedia.name}</div>
                          <div className="preview-size">{triggerMedia.size}</div>
                        </div>
                        <button 
                          type="button" 
                          className="btn btn-danger-outline btn-small"
                          onClick={() => setTriggerMedia(null)}
                        >
                          <X size={14} /> Quitar
                        </button>
                      </div>
                    )}
                  </div>

                  {triggerMedia && (
                    <div className="form-group">
                      <div 
                        className={`toggle-container ${triggerIsCaption ? 'active' : ''}`}
                        onClick={() => setTriggerIsCaption(!triggerIsCaption)}
                      >
                        <div>
                          <p style={{ fontWeight: 550, fontSize: '0.85rem' }}>Enviar Texto como Caption del archivo</p>
                        </div>
                        <div className="toggle-switch"></div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                    <button type="submit" className="btn btn-primary">
                      {triggerId ? 'Guardar Cambios' : 'Crear Disparador'}
                    </button>
                    {triggerId && (
                      <button 
                        type="button" 
                        className="btn btn-secondary"
                        onClick={() => {
                          setTriggerId(null);
                          setTriggerKeyword('');
                          setTriggerMatchType('exact');
                          setTriggerResponse('');
                          setTriggerMedia(null);
                          setTriggerIsCaption(true);
                        }}
                      >
                        Cancelar Edición
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Active Triggers List */}
              <div className="glass-card">
                <h2>
                  <ListPlus className="text-emerald-400" /> Disparadores Guardados en Base de Datos
                </h2>
                
                {triggers.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '24px 0' }}>
                    No hay disparadores personalizados creados aún.
                  </p>
                ) : (
                  <div className="triggers-list-grid">
                    {triggers.map(trig => (
                      <div key={trig.id} className="trigger-card">
                        <div className="trigger-card-header">
                          <span className="trigger-keyword">"{trig.keyword}"</span>
                          <span className={`trigger-badge ${trig.match_type}`}>
                            {trig.match_type === 'exact' ? 'Exacta' : 'Contiene'}
                          </span>
                        </div>

                        <div className="trigger-text-content">
                          {trig.response_text || <span style={{ fontStyle: 'italic', color: '#666' }}>Sólo multimedia</span>}
                        </div>

                        {trig.media_mimetype && (
                          <div style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                            📁 Archivo: {trig.media_filename || 'adjunto'} ({trig.is_caption === 1 ? 'Caption' : 'Separado'})
                          </div>
                        )}

                        <div className="trigger-actions">
                          <button 
                            type="button" 
                            className="btn btn-secondary btn-small"
                            onClick={() => handleEditTrigger(trig)}
                            style={{ padding: '4px 8px' }}
                          >
                            <Edit2 size={12} /> Editar
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-danger-outline btn-small"
                            onClick={() => handleDeleteTrigger(trig.id, trig.keyword)}
                            style={{ padding: '4px 8px' }}
                          >
                            <Trash2 size={12} /> Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
