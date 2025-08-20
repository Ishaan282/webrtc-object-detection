# Real-time WebRTC Multi-Object Detection (Phone → Browser → Overlay)

## One-line Goal
Perform real-time multi-object detection on live video streamed from a phone via WebRTC, overlay detections in the browser, and collect FPS/latency metrics.

## Demo Overview

This project allows a phone to stream its camera feed to a desktop browser using WebRTC. The desktop app receives the video, performs object detection using **TensorFlow.js WASM**, and overlays bounding boxes + labels in near real-time.  

### Key Features:
- Real-time multi-object detection (Coco-SSD model)
- FPS, latency, and inference time metrics 
- QR code for easy phone connection
- Low-resource mode: runs on modest laptops (Intel i5, 8GB RAM)

## Getting Started (Windows / Cross-platform)

### Requirements:
- Docker & Docker Compose 
- Phone with a modern browser (Chrome on Android, Safari on iOS)
- Optional: ngrok or port-forwarding if your phone cannot reach the desktop directly

### Steps:
1. Clone the repository:
```bash
git clone <repo-url>
cd <repo-directory>
```

2. Launch the frontend and backend using Docker:
```bash
docker-compose up --build
```

3. Open your desktop browser at `http://localhost:3000`

4. If your phone cannot directly reach your laptop:
    - Start ngrok to expose port 3000:
    ```bash
    ngrok http 3000
    ```

    - Copy the public URL provided by ngrok and open it on your phone.

5. Open the ngrok URL in computer & scan the QR (or open the ngrok URL directly in phone browser). Grant camera permission when prompted.

6. The phone video feed will stream to your desktop `localhost:3000` , and object detections will appear in real-time.

**Note:** Due to WebRTC's nature, if either the phone or desktop page is refreshed, the connection will drop. In this case:
- refresh laptop page 
- Reopen the page on your phone
- Grant camera permission again (or try by resetting the browser history)
    - or restart the ngrok to expose with new link
- The stream will continue normally after reconnection

## Metrics Collection

A sample benchmark script is provided:

```bash
./bench/run_bench.sh --duration 30 --mode wasm
```

This generates `metrics.json` including:
- Median & P95 latency
- Processed FPS
- Uplink/Downlink bandwidth

Metrics are generated using a simulated benchmark for demonstration. Real-time values can be viewed in the app UI.

## Design Choices

### Detection Model:
- Coco-SSD via TensorFlow.js WASM for browser-based inference without GPU.
- Low-resource Mode: Detection throttled to ~15 FPS with optional frame thinning; default input resolution 320×240.

### Peer-to-Peer Streaming:
- Uses PeerJS for WebRTC signaling
- Simple one-to-one phone-to-desktop connection

### Docker over start.sh:
- The original `start.sh` script is intended for Unix-based systems (Linux/macOS)
- On Windows, `.sh` cannot be executed natively, so Docker Compose provides a cross-platform alternative
- Functionality is identical: launches both frontend and backend, exposes localhost, and supports phone connections via QR/ngrok

## Known Limitations
- **WebRTC Connection Drop**: Refreshing either side breaks the connection. Phone must reopen the page and re-grant camera access.
- **Single Phone Connection**: Current implementation supports one phone connecting to one desktop at a time.
- **Metrics**: Benchmarks are simulated; actual real-time performance can vary depending on laptop specs and network.

## Future Improvements

- Support multiple phones streaming simultaneously
- Implement automatic reconnection on WebRTC drop
- Add server-mode detection path (Node/ONNX Runtime) for offloading inference
- Persist real-time metrics to metrics.json