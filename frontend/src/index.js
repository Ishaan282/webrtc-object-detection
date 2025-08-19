// frontend/src/index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@tensorflow/tfjs-backend-wasm';

// Create a root element
const container = document.getElementById('root');
const root = createRoot(container);

// Render your app
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);