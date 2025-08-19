const express = require('express');
const { PeerServer } = require('peer');
const cors = require('cors');

const app = express();
app.use(cors());

const peerServer = PeerServer({
  port: 9000,
  path: '/peerjs',
  allow_discovery: true
});

app.get('/', (req, res) => {
  res.send('WebRTC Signaling Server');
});


app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    peers: Object.keys(peerServer._clients).length
  });
});

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});