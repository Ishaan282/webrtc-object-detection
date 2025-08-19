import React, { useRef, useEffect, useState } from 'react';
import Peer from 'peerjs';
import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
import { QRCodeSVG as QRCode } from 'qrcode.react';

// Configuration
const config = {
  NGROK_URL: process.env.REACT_APP_NGROK_URL || 'https://3bd7f6987830.ngrok-free.app',
  USE_NGROK: process.env.REACT_APP_USE_NGROK === 'true',
  LOCAL_IP: process.env.REACT_APP_LOCAL_IP || '192.168.1.100'
};


const TARGET_FPS = 12;
const TARGET_WIDTH = 320;
const TARGET_HEIGHT = 240;
const MAX_PROCESSING_TIME = 1000 / TARGET_FPS;

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectionCanvasRef = useRef(null);
  const [peerId, setPeerId] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [isMobile, setIsMobile] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const [detectedObjects, setDetectedObjects] = useState([]);
  const [processingFps, setProcessingFps] = useState(0);
  
  const peerRef = useRef(null);
  const cleanupRef = useRef({});
  const detectionIntervalRef = useRef(null);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(0);
  const lastProcessingTimeRef = useRef(0);
  const modelRef = useRef(null);

  // Initialize the application
  useEffect(() => {
    const mobileCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(mobileCheck);

    const getPublicUrl = () => {
      if (config.USE_NGROK) return config.NGROK_URL;
      return window.location.hostname === 'localhost' 
        ? `http://${config.LOCAL_IP}:3000` 
        : window.location.href;
    };
    setPublicUrl(getPublicUrl());

    // Initialize PeerJS
    const peer = new Peer(mobileCheck ? 'phone-' + Math.random().toString(36).slice(2) : 'desktop');
    peerRef.current = peer;

    const handleMobileConnection = async () => {
      try {
        // Mobile: Capture camera and stream to desktop
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15 }
          },
          audio: false
        });
        
        // Call desktop peer to establish video stream
        const call = peer.call('desktop', stream);
        call.on('stream', (remoteStream) => {
          // For two-way communication (optional)
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
      // Mobile device - stream camera to desktop
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        document.addEventListener('click', handleFirstUserInteraction);
        setConnectionStatus('Tap screen to start camera');
      } else {
        handleMobileConnection();
      }
    } else {
      // Desktop device - receive stream from mobile and run detection
      peer.on('call', (call) => {
        setConnectionStatus('Incoming stream from phone...');
        call.answer(null); // No need to send stream back to phone
        
        call.on('stream', (remoteStream) => {
          // Display the mobile camera stream
          videoRef.current.srcObject = remoteStream;
          setConnectionStatus('Connected to phone');
          
          // Start detection when video begins playing
          videoRef.current.onplaying = () => {
            initializeDetection();
          };
        });

        call.on('close', () => {
          setConnectionStatus('Phone disconnected');
          stopDetection();
        });
        cleanupRef.current.call = call;
      });
    }

    // Load TensorFlow.js model (desktop only)
    if (!mobileCheck) {
      loadModel();
    }

    return () => {
      stopDetection();
      if (peerRef.current) peerRef.current.destroy();
      if (cleanupRef.current.handleFirstUserInteraction) {
        document.removeEventListener('click', cleanupRef.current.handleFirstUserInteraction);
      }
      if (cleanupRef.current.call) {
        cleanupRef.current.call.close();
      }
    };
  }, []);

  const loadModel = async () => {
    try {
      await tf.setBackend('wasm');
      const model = await cocossd.load();
      modelRef.current = model;
      setConnectionStatus('Model loaded - Ready for detection');
    } catch (err) {
      console.error('Model loading error:', err);
      setConnectionStatus('Error loading model');
    }
  };

  const initializeDetection = () => {
    // Create downscaled canvas for TensorFlow processing
    detectionCanvasRef.current = document.createElement('canvas');
    detectionCanvasRef.current.width = TARGET_WIDTH;
    detectionCanvasRef.current.height = TARGET_HEIGHT;
    
    // Set display canvas to match video dimensions
    if (videoRef.current && canvasRef.current) {
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
    }
    
    startAdaptiveDetection();
  };

  const startAdaptiveDetection = () => {
    stopDetection();
    
    let lastFrameTime = 0;
    let adaptiveDelay = MAX_PROCESSING_TIME;
    
    const processFrame = async () => {
      const now = Date.now();
      const elapsed = now - lastFrameTime;
      
      if (elapsed < adaptiveDelay) {
        detectionIntervalRef.current = setTimeout(processFrame, adaptiveDelay - elapsed);
        return;
      }
      
      lastFrameTime = now;
      const startTime = performance.now();
      
      if (!modelRef.current || !videoRef.current || videoRef.current.paused || videoRef.current.readyState < 2) {
        detectionIntervalRef.current = setTimeout(processFrame, adaptiveDelay);
        return;
      }
      
      try {
        // Downscale frame for efficient TensorFlow processing
        const detectionCtx = detectionCanvasRef.current.getContext('2d');
        detectionCtx.drawImage(
          videoRef.current,
          0, 0, TARGET_WIDTH, TARGET_HEIGHT
        );
        
        // Run object detection on downscaled frame
        const predictions = await modelRef.current.detect(detectionCanvasRef.current);
        setDetectedObjects(predictions);
        drawDetections(predictions);
        
        // Update FPS counter
        frameCountRef.current++;
        const currentTime = Date.now();
        if (currentTime - lastFpsUpdateRef.current > 1000) {
          setProcessingFps(frameCountRef.current);
          frameCountRef.current = 0;
          lastFpsUpdateRef.current = currentTime;
        }
        
        // Adaptive sampling based on processing time
        const processingTime = performance.now() - startTime;
        lastProcessingTimeRef.current = processingTime;
        
        // Adjust delay dynamically for target FPS
        adaptiveDelay = Math.max(30, Math.min(200, processingTime * 1.2));
        
      } catch (error) {
        console.error('Detection error:', error);
        adaptiveDelay = 100;
      }
      
      detectionIntervalRef.current = setTimeout(processFrame, adaptiveDelay);
    };
    
    processFrame();
  };

  const stopDetection = () => {
    if (detectionIntervalRef.current) {
      clearTimeout(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  };

  const drawDetections = (predictions) => {
    if (!canvasRef.current || !videoRef.current) return;
    
    const ctx = canvasRef.current.getContext('2d');
    const video = videoRef.current;
    
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // Scale detections from 320x240 back to original video size
    const scaleX = video.videoWidth / TARGET_WIDTH;
    const scaleY = video.videoHeight / TARGET_HEIGHT;
    
    predictions.forEach(prediction => {
      const [x, y, width, height] = prediction.bbox;
      
      // Scale coordinates to original video size
      const scaledX = x * scaleX;
      const scaledY = y * scaleY;
      const scaledWidth = width * scaleX;
      const scaledHeight = height * scaleY;
      
      // Draw bounding box
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 4;
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
      
      // Draw label
      ctx.fillStyle = '#00FF00';
      ctx.font = '14px Arial';
      ctx.fillText(
        `${prediction.class} (${Math.round(prediction.score * 100)}%)`,
        scaledX,
        scaledY > 15 ? scaledY - 5 : 15
      );
    });
  };

  return (
    <div style={{ padding: '20px', maxWidth: '100vw', overflow: 'hidden' }}>
      <h1>WebRTC Object Detection</h1>
      <div style={{ marginBottom: '10px' }}>
        <p><strong>Status:</strong> {connectionStatus}</p>
        <p><strong>Device:</strong> {isMobile ? 'Phone' : 'Desktop'}</p>
        {!isMobile && (
          <>
            <p><strong>Processing:</strong> {processingFps} FPS ({lastProcessingTimeRef.current.toFixed(1)}ms)</p>
            <p><strong>Resolution:</strong> {TARGET_WIDTH}x{TARGET_HEIGHT} (optimized)</p>
          </>
        )}
        {peerId && <p><strong>Peer ID:</strong> {peerId}</p>}
      </div>
      
      {!isMobile && (
        <div style={{ margin: '20px 0', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <QRCode value={publicUrl} size={200} level="H" includeMargin={true} />
          <p style={{ marginTop: '10px' }}>Scan with your phone camera</p>
          <p style={{ fontSize: '0.8em', color: '#666', marginTop: '5px' }}>
            {publicUrl}
          </p>
        </div>
      )}
      
      {!isMobile && detectedObjects.length > 0 && (
        <div style={{ 
          margin: '10px 0',
          padding: '10px',
          backgroundColor: '#e8f5e8',
          borderRadius: '5px',
          border: '1px solid #4caf50'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#2e7d32' }}>Detected Objects:</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {detectedObjects.map((obj, index) => (
              <span key={index} style={{
                padding: '4px 8px',
                backgroundColor: '#4caf50',
                color: 'white',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                {obj.class} ({(obj.score * 100).toFixed(0)}%)
              </span>
            ))}
          </div>
        </div>
      )}
      
      <div style={{ position: 'relative', margin: '0 auto', width: isMobile ? '100%' : '640px' }}>
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
              height: '100%',
              pointerEvents: 'none'
            }}
          />
        )}
      </div>
      
      {isMobile && connectionStatus.includes('Error') && (
        <button onClick={() => window.location.reload()} style={{ 
          marginTop: '20px',
          padding: '10px 20px',
          backgroundColor: '#4285f4',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          Retry Camera
        </button>
      )}
    </div>
  );
}

export default App;