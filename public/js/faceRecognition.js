// ============================================================
// FACE RECOGNITION — face-api.js wrapper
// ============================================================
const MODELS_URL = '/models';
const MATCH_THRESHOLD = 0.5; // Jarak maksimum untuk dianggap cocok

const FaceRec = {
  loaded: false,
  employees: [],  // { id, name, jabatan, descriptors: [Float32Array] }
  video: null,
  canvas: null,
  animFrame: null,

  async loadModels(onProgress) {
    try {
      const models = [
        faceapi.nets.tinyFaceDetector,
        faceapi.nets.faceLandmark68TinyNet,
        faceapi.nets.faceRecognitionNet,
      ];
      for (let i = 0; i < models.length; i++) {
        await models[i].loadFromUri(MODELS_URL);
        if (onProgress) onProgress(Math.round(((i + 1) / models.length) * 100));
      }
      this.loaded = true;
      return true;
    } catch (err) {
      console.error('Gagal load model:', err);
      throw new Error('Gagal memuat model face recognition. Pastikan folder /models tersedia.');
    }
  },

  async loadEmployees() {
    try {
      const data = await Auth.apiCall('GET', '/api/employees/with-descriptors');
      this.employees = data
        .filter(emp => emp.face_descriptors?.length > 0)
        .map(emp => ({
          id: emp.id,
          name: emp.name,
          jabatan: emp.jabatan,
          photo_url: emp.photo_url,
          matchers: emp.face_descriptors.map(fd => {
            const desc = new Float32Array(Object.values(fd.descriptor));
            return new faceapi.LabeledFaceDescriptors(emp.id, [desc]);
          })
        }));
      return this.employees.length;
    } catch (err) {
      console.error('Gagal load employees:', err);
      return 0;
    }
  },

  matchFace(queryDescriptor) {
    if (!this.employees.length) return null;
    let bestMatch = null;
    let bestDist = Infinity;

    for (const emp of this.employees) {
      for (const matcher of emp.matchers) {
        const dist = faceapi.euclideanDistance(queryDescriptor, matcher.descriptors[0]);
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = { ...emp, distance: dist };
        }
      }
    }

    if (bestDist <= MATCH_THRESHOLD) {
      return { ...bestMatch, confidence: Math.round((1 - bestDist) * 100) };
    }
    return null;
  },

  async startVideo(videoEl) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      videoEl.srcObject = stream;
      this.video = videoEl;
      return stream;
    } catch (err) {
      throw new Error('Izin kamera ditolak. Harap izinkan akses kamera di browser Anda.');
    }
  },

  stopVideo() {
    if (this.video?.srcObject) {
      this.video.srcObject.getTracks().forEach(t => t.stop());
      this.video.srcObject = null;
    }
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  },

  async detectLoop(videoEl, canvasEl, onDetected) {
    const displaySize = { width: videoEl.videoWidth, height: videoEl.videoHeight };
    faceapi.matchDimensions(canvasEl, displaySize);

    let lastDetectTime = 0;
    let lastMatch = null;
    let matchFrames = 0; // berapa frame berturut match sama

    const loop = async () => {
      this.animFrame = requestAnimationFrame(loop);
      const now = Date.now();

      // Deteksi setiap 300ms
      if (now - lastDetectTime < 300) return;
      lastDetectTime = now;

      const ctx = canvasEl.getContext('2d');
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

      const detections = await faceapi
        .detectAllFaces(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptors();

      if (!detections.length) {
        lastMatch = null;
        matchFrames = 0;
        return;
      }

      const resized = faceapi.resizeResults(detections, displaySize);

      // Draw detections
      resized.forEach(det => {
        const { x, y, width, height } = det.detection.box;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
      });

      // Match pertama yang terdeteksi
      const match = this.matchFace(resized[0].descriptor);

      if (match) {
        // Draw label
        const { x, y } = resized[0].detection.box;
        ctx.fillStyle = 'rgba(59,130,246,0.8)';
        ctx.fillRect(x, y - 28, match.name.length * 9 + 20, 28);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillText(`${match.name} (${match.confidence}%)`, x + 8, y - 8);

        if (lastMatch?.id === match.id) {
          matchFrames++;
        } else {
          lastMatch = match;
          matchFrames = 1;
        }

        // Konfirmasi setelah 5 frame cocok berturut-turut (~1.5 detik)
        if (matchFrames === 5) {
          matchFrames = 0;
          if (onDetected) onDetected(match);
        }
      } else {
        // Draw "Tidak dikenali"
        ctx.fillStyle = 'rgba(239,68,68,0.7)';
        ctx.fillRect(resized[0].detection.box.x, resized[0].detection.box.y - 28, 140, 28);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 13px Inter, sans-serif';
        ctx.fillText('Tidak Dikenali', resized[0].detection.box.x + 8, resized[0].detection.box.y - 8);
        lastMatch = null;
        matchFrames = 0;
      }
    };

    this.animFrame = requestAnimationFrame(loop);
  }
};

window.FaceRec = FaceRec;
