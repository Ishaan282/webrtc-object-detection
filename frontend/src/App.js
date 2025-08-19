import React, { useRef, useEffect, useState } from 'react';
import Peer from 'peerjs';
import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
import { QRCodeSVG as QRCode } from 'qrcode.react';

// Configuration - Set these in your .env file
const config = {
  NGROK_URL: process.env.REACT_APP_NGROK_URL || 'https://3bd7f6987830.ngrok-free.app',
  USE_NGROK: process.env.REACT_APP_USE_NGROK === 'true',
  LOCAL_IP: process.env.REACT_APP_LOCAL_IP || '192.168.1.100' // Your local IP
};

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [peerId, setPeerId] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [isMobile, setIsMobile] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const peerRef = useRef(null);
  const cleanupRef = useRef({});

  // Initialize the application
  useEffect(() => {
    // Detect device type
    const mobileCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(mobileCheck);

    // Set the correct public URL
    const getPublicUrl = () => {
      if (config.USE_NGROK) {
        return config.NGROK_URL;
      }
      return window.location.hostname === 'localhost' 
        ? `http://${config.LOCAL_IP}:3000` 
        : window.location.href;
    };
    setPublicUrl(getPublicUrl());

    // Initialize PeerJS with device-specific ID
    const peer = new Peer(mobileCheck ? 'phone-' + Math.random().toString(36).slice(2) : 'desktop');
    peerRef.current = peer;

    const handleMobileConnection = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
        
        const call = peer.call('desktop', stream);
        call.on('stream', (remoteStream) => {
          videoRef.current.srcObject = remoteStream;
        });
        
        setConnectionStatus('Streaming to desktop...');
        cleanupRef.current.call = call;
      } catch (error) {
        console.error('Camera error:', error);
        setConnectionStatus(`Error: ${error.message}`);
      }
    };

    const handleFirstUserInteraction = () => {
      document.removeEventListener('click', handleFirstUserInteraction);
      handleMobileConnection();
    };

    cleanupRef.current.handleFirstUserInteraction = handleFirstUserInteraction;

    peer.on('open', (id) => {
      setPeerId(id);
      setConnectionStatus(mobileCheck ? 'Ready to stream' : 'Waiting for phone connection...');
    });

    if (mobileCheck) {
      // Mobile device logic
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        document.addEventListener('click', handleFirstUserInteraction);
        setConnectionStatus('Tap screen to start camera');
      } else {
        handleMobileConnection();
      }
    } else {
      // Desktop logic
      peer.on('call', (call) => {
        setConnectionStatus('Incoming stream from phone...');
        call.answer(null); // No local stream needed on desktop
        
        call.on('stream', (remoteStream) => {
          videoRef.current.srcObject = remoteStream;
          setConnectionStatus('Connected to phone');
          startDetection();
        });

        call.on('close', () => {
          setConnectionStatus('Phone disconnected');
        });
        cleanupRef.current.call = call;
      });
    }

    // Load TensorFlow.js model (desktop only)
    if (!mobileCheck) {
      tf.setBackend('wasm').then(() => {
        cocossd.load().then(model => {
          window.model = model;
          setConnectionStatus('Model loaded - Ready for detection');
        }).catch(err => {
          console.error('Model loading error:', err);
          setConnectionStatus('Error loading model');
        });
      });
    }

    return () => {
      if (peerRef.current) peerRef.current.destroy();
      if (cleanupRef.current.handleFirstUserInteraction) {
        document.removeEventListener('click', cleanupRef.current.handleFirstUserInteraction);
      }
      if (cleanupRef.current.call) {
        cleanupRef.current.call.close();
      }
    };
  }, []);

  const startDetection = async () => {
    const detect = async () => {
      if (!window.model || !videoRef.current || videoRef.current.paused) return;
      
      try {
        const predictions = await window.model.detect(videoRef.current);
        drawDetections(predictions);
      } catch (error) {
        console.error('Detection error:', error);
      }
      requestAnimationFrame(detect);
    };
    detect();
  };

  const drawDetections = (predictions) => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    predictions.forEach(prediction => {
      const [x, y, width, height] = prediction.bbox;
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, width, height);
      
      ctx.fillStyle = '#00FF00';
      ctx.font = '16px Arial';
      ctx.fillText(
        `${prediction.class} (${Math.round(prediction.score * 100)}%)`,
        x,
        y > 10 ? y - 5 : 10
      );
    });
  };

  return (
    <div style={{ 
      padding: '20px',
      maxWidth: '100vw',
      overflow: 'hidden'
    }}>
      <h1>WebRTC Object Detection</h1>
      <div style={{ marginBottom: '10px' }}>
        <p><strong>Status:</strong> {connectionStatus}</p>
        <p><strong>Device:</strong> {isMobile ? 'Phone' : 'Desktop'}</p>
        {peerId && <p><strong>Peer ID:</strong> {peerId}</p>}
      </div>
      
      {!isMobile && (
        <div style={{ 
          margin: '20px 0',
          padding: '10px',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px'
        }}>
          <QRCode 
            value={publicUrl} 
            size={200}
            level="H"
            includeMargin={true}
          />
          <p style={{ marginTop: '10px' }}>Scan with your phone camera</p>
          <p style={{ 
            fontSize: '0.8em',
            color: '#666',
            marginTop: '5px'
          }}>
            {publicUrl}
          </p>
        </div>
      )}
      
      <div style={{ 
        position: 'relative',
        margin: '0 auto',
        width: isMobile ? '100%' : '640px'
      }}>
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          style={{ 
            width: '100%',
            height: 'auto',
            border: '1px solid #ccc',
            transform: isMobile ? 'scaleX(-1)' : 'none',
            display: 'block'
          }}
        />
        {!isMobile && (
          <canvas
            ref={canvasRef}
            style={{ 
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%'
            }}
          />
        )}
      </div>
      
      {isMobile && connectionStatus.includes('Error') && (
        <button 
          onClick={() => window.location.reload()}
          style={{ 
            marginTop: '20px',
            padding: '10px 20px',
            backgroundColor: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Retry Camera
        </button>
      )}
    </div>
  );
}

export default App;