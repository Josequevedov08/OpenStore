import { useState, useEffect } from 'react'

function App() {
  const [catalogo, setCatalogo] = useState([]);
  const [instalandoId, setInstalandoId] = useState(null);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/catalogo')
      .then(respuesta => respuesta.json())
      .then(datos => setCatalogo(datos))
      .catch(error => console.error("Error cargando catálogo:", error));
  }, []);

  const instalarHerramienta = async (herramienta) => {
    setInstalandoId(herramienta.id);
    
    try {
      const respuesta = await fetch('http://127.0.0.1:8000/api/instalar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: herramienta.nombre })
      });
      
      const datos = await respuesta.json();
      alert("✅ " + datos.mensaje); 
      
    } catch (error) {
      alert("❌ Hubo un error de conexión con el motor.");
    } finally {
      setInstalandoId(null);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', backgroundColor: '#1a1a1a', color: 'white', minHeight: '100vh' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '40px' }}>⚡ MCP Manager App Store</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        
        {catalogo.map(herramienta => (
          <div key={herramienta.id} style={{ backgroundColor: '#2d2d2d', padding: '20px', borderRadius: '12px', border: '1px solid #404040' }}>
            <h2 style={{ marginTop: '0', color: '#61dafb' }}>{herramienta.nombre}</h2>
            <p style={{ color: '#cccccc', lineHeight: '1.5' }}>{herramienta.descripcion}</p>
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9em', color: '#888' }}>{herramienta.estado}</span>
              
              <button 
                onClick={() => instalarHerramienta(herramienta)}
                disabled={instalandoId === herramienta.id}
                style={{ 
                  backgroundColor: instalandoId === herramienta.id ? '#888' : '#61dafb', 
                  color: 'black', 
                  border: 'none', 
                  padding: '10px 20px', 
                  borderRadius: '6px', 
                  fontWeight: 'bold', 
                  cursor: instalandoId === herramienta.id ? 'wait' : 'pointer' 
                }}
              >
                {instalandoId === herramienta.id ? 'Instalando...' : 'Instalar'}
              </button>
              
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}

export default App