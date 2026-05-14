const url = "https://n8n.averonix.org/webhook/48e4053f-83ac-471e-880e-91f47e39b0ee/chat";

async function checkConnection() {
    console.log("🔍 Comprobando acceso a n8n...");
    try {
        const start = Date.now();
        const res = await fetch(url);
        const duration = Date.now() - start;
        
        if (res.ok || res.status === 405) {
            console.log(`✅ ¡Conexión exitosa! (${res.status})`);
            console.log(`⏱️ Latencia: ${duration}ms`);
        } else {
            console.log(`⚠️ El servidor respondió con error ${res.status}`);
        }
    } catch (e) {
        console.error("❌ Error: No se pudo conectar al webhook. Asegúrate de que n8n esté encendido y el webhook sea público.");
    }
}

checkConnection();