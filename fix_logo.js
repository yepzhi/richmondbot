const fs = require('fs');
const path = require('path');

const b64Data = fs.readFileSync('logo.b64', 'utf8').replace(/\n/g, ''); // Remover saltos de línea del output de openssl
const htmlPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Reemplazar la referencia al logo
html = html.replace('src="logo.png"', `src="data:image/png;base64,${b64Data}"`);

// También buscar referencias en CSS si las hubiera (aunque creo que es img tag)
// html = html.replace('url("logo.png")', `url("data:image/png;base64,${b64Data}")`);

fs.writeFileSync(htmlPath, html);
console.log('✅ Logo embedded into index.html');

// Clean up
try {
    fs.unlinkSync('logo.png');
    fs.unlinkSync('logo.b64');
    console.log('✅ Deleted binary logo files');
} catch (e) { console.error(e); }
