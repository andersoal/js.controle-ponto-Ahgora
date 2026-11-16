// Gere o par antes de rodar (não versionado — veja .gitignore):
//   openssl req -x509 -newkey rsa:2048 -keyout ahgora-key.pem -out ahgora-cert.pem -days 365 -nodes -subj "/CN=localhost"
const https = require('https');
const fs = require('fs');
const path = require('path');
const port = 8443;
const root = process.cwd();

const server = https.createServer({
  key: fs.readFileSync(path.join(root, 'ahgora-key.pem')),
  cert: fs.readFileSync(path.join(root, 'ahgora-cert.pem'))
}, (req, res) => {
  const filePath = path.join(root, req.url.split('?')[0]);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`HTTPS server running at https://localhost:${port}`);
});
