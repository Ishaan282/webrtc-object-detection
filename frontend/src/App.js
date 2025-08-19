import React, { useRef, useEffect, useState } from 'react';
import Peer from 'peerjs';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-wasm';
import * as cocossd from '@tensorflow-models/coco-ssd';
import { QRCodeSVG as QRCode } from 'qrcode.react';

// Configuration
const config = {
  NGROK_URL: process.env.REACT_APP_NGROK_URL || 'https://your-ngrok-url.ngrok.io',
  USE_NGROK: process.env.REACT_APP_USE_NGROK === 'true',
  LOCAL_IP: process.env.REACT_APP_LOCAL_IP || '192.168.1.100',
  DETECTION_INTERVAL: 1000 / 15, // Target 15 FPS
  MAX_QUEUE_SIZE: 3, // Maximum frames to queue
};

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [peerId, setPeerId] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [isMobile, setIsMobile] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const [metrics, setMetrics] = useState({
    fps: 0,
    latency: 0,
    p95Latency: 0,
    inferenceTime: 0,
  });
  
  const peerRef = useRef(null);
  const cleanupRef = useRef({});
  const metricsRef = useRef({
    frameCount: 0,
    latencies: [],
    lastFrameTime: 0,
    processedFrames: 0,
    startTime: Date.now(),
  });
  const frameQueueRef = useRef([]);

  const updateMetrics = (frameData) => {
    const now = Date.now();
    const latency = now - frameData.capture_ts;
    metricsRef.current.latencies.push(latency);
    
    // Calculate FPS
    metricsRef.current.processedFrames++;
    const elapsed = (now - metricsRef.current.startTime) / 1000;
    const currentFps = metricsRef.current.processedFrames / elapsed;

    // Calculate P95 latency
    const sortedLatencies = [...metricsRef.current.latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p95Latency = sortedLatencies[p95Index];

    setMetrics({
      fps: Math.round(currentFps * 10) / 10,
      latency: Math.round(latency),
      p95Latency: Math.round(p95Latency),
      inferenceTime: Math.round(frameData.inference_ts - frameData.recv_ts),
    });

    // Keep only last 300 samples (20 seconds at 15fps)
    if (metricsRef.current.latencies.length > 300) {
      metricsRef.current.latencies.shift();
    }
  };

  const processFrame = async (model, video) => {
    if (!video || video.paused) return null;
    
    const frameData = {
      frame_id: Date.now().toString(),
      capture_ts: Date.now(),
      recv_ts: Date.now(),
    };

    try {
      const predictions = await model.detect(video);
      frameData.inference_ts = Date.now();
      frameData.detections = predictions.map(pred => ({
        label: pred.class,
        score: pred.score,
        xmin: pred.bbox[0] / video.videoWidth,
        ymin: pred.bbox[1] / video.videoHeight,
        xmax: (pred.bbox[0] + pred.bbox[2]) / video.videoWidth,
        ymax: (pred.bbox[1] + pred.bbox[3]) / video.videoHeight,
      }));
      
      return frameData;
    } catch (error) {
      console.error('Detection error:', error);
      return null;
    }
  };

  const drawDetections = (frameData) => {
    if (!canvasRef.current || !videoRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    const video = videoRef.current;

    // Match canvas size to video
    canvasRef.current.width = video.videoWidth;
    canvasRef.current.height = video.videoHeight;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    frameData.detections.forEach(detection => {
      const x = detection.xmin * video.videoWidth;
      const y = detection.ymin * video.videoHeight;
      const width = (detection.xmax - detection.xmin) * video.videoWidth;
      const height = (detection.ymax - detection.ymin) * video.videoHeight;

      // Draw bounding box
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, width, height);
      
      // Draw label
      ctx.fillStyle = '#00FF00';
      ctx.font = '16px Arial';
      ctx.fillText(
        `${detection.label} (${Math.round(detection.score * 100)}%)`,
        x,
        y > 10 ? y - 5 : 10
      );
    });

    updateMetrics(frameData);
  };

  const startDetection = async () => {
    const model = await cocossd.load();
    let lastProcessTime = 0;

    const detectFrame = async () => {
      if (!videoRef.current || videoRef.current.paused) {
        requestAnimationFrame(detectFrame);
        return;
      }

      const now = Date.now();
      if (now - lastProcessTime >= config.DETECTION_INTERVAL) {
        const frameData = await processFrame(model, videoRef.current);
        if (frameData) {
          drawDetections(frameData);
          lastProcessTime = now;
        }
      }

      requestAnimationFrame(detectFrame);
    };

    detectFrame();
  };

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
          if (videoRef.current) {
            videoRef.current.srcObject = remoteStream;
          }
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
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        document.addEventListener('click', handleFirstUserInteraction);
        setConnectionStatus('Tap screen to start camera');
      } else {
        handleMobileConnection();
      }
    } else {
      // Desktop setup
      tf.setBackend('wasm').then(async () => {
        setConnectionStatus('Loading detection model...');
        
        peer.on('call', (call) => {
          setConnectionStatus('Incoming stream from phone...');
          call.answer(null);
          
          call.on('stream', (remoteStream) => {
            if (videoRef.current) {
              videoRef.current.srcObject = remoteStream;
              setConnectionStatus('Connected to phone');
              startDetection();
            }
          });

          call.on('close', () => {
            setConnectionStatus('Phone disconnected');
          });
          
          cleanupRef.current.call = call;
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
        {!isMobile && (
          <div>
            <p><strong>FPS:</strong> {metrics.fps}</p>
            <p><strong>Latency:</strong> {metrics.latency}ms (P95: {metrics.p95Latency}ms)</p>
            <p><strong>Inference Time:</strong> {metrics.inferenceTime}ms</p>
          </div>
        )}
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