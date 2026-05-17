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

  // Hentikan loop deteksi tapi tetap biarkan stream kamera hidup (untuk liveness)
  pauseDetection() {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  },

  async detectLoop(videoEl, canvasEl, onDetected) {
    const displaySize = { width: videoEl.videoWidth, height: videoEl.videoHeight };
    faceapi.matchDimensions(canvasEl, displaySize);

    const W = displaySize.width; // lebar canvas untuk mirror X
    // mx(x, w) → posisi X yang sudah di-mirror agar sesuai video unmirrored
    const mx = (x, w) => W - x - w;

    let lastDetectTime = 0;
    let lastMatch = null;
    let matchFrames = 0;

    const loop = async () => {
      this.animFrame = requestAnimationFrame(loop);
      const now = Date.now();
      if (now - lastDetectTime < 300) return;
      lastDetectTime = now;

      const ctx = canvasEl.getContext('2d');
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

      const detections = await faceapi
        .detectAllFaces(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptors();

      if (!detections.length) { lastMatch = null; matchFrames = 0; return; }

      const resized = faceapi.resizeResults(detections, displaySize);

      // Gambar kotak wajah (koordinat X di-mirror)
      resized.forEach(det => {
        const { x, y, width, height } = det.detection.box;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(mx(x, width), y, width, height);
      });

      // Cocokkan wajah pertama
      const match = this.matchFace(resized[0].descriptor);
      const { x, y, width } = resized[0].detection.box;
      const lx = mx(x, width); // posisi X label yang sudah di-mirror

      if (match) {
        const labelW = match.name.length * 9 + 20;
        ctx.fillStyle = 'rgba(59,130,246,0.8)';
        ctx.fillRect(lx, y - 28, labelW, 28);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillText(`${match.name} (${match.confidence}%)`, lx + 8, y - 8);

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
        ctx.fillStyle = 'rgba(239,68,68,0.7)';
        ctx.fillRect(lx, y - 28, 140, 28);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 13px Inter, sans-serif';
        ctx.fillText('Tidak Dikenali', lx + 8, y - 8);
        lastMatch = null;
        matchFrames = 0;
      }
    };

    this.animFrame = requestAnimationFrame(loop);
  }
};

window.FaceRec = FaceRec;

// ============================================================
// LIVENESS DETECTION — Random Challenge Anti-Spoofing
// ============================================================
const Liveness = {
  CHALLENGES: [
    { id: 'blink', icon: '👁️', text: 'Kedipkan mata Anda' },
    { id: 'left',  icon: '⬅️', text: 'Gerakkan kepala ke KIRI' },
    { id: 'right', icon: '➡️', text: 'Gerakkan kepala ke KANAN' },
    { id: 'nod',   icon: '⬇️', text: 'Anggukkan kepala ke bawah' },
  ],

  _dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); },

  // Eye Aspect Ratio — < 0.22 berarti mata tertutup
  _ear(pts) {
    return (this._dist(pts[1], pts[5]) + this._dist(pts[2], pts[4]))
         / (2 * this._dist(pts[0], pts[3]));
  },

  // Rata-rata EAR kedua mata (landmark 36-41 = kiri, 42-47 = kanan)
  _avgEAR(lm) {
    const p = lm.positions;
    return (this._ear(p.slice(36, 42)) + this._ear(p.slice(42, 48))) / 2;
  },

  // Posisi ujung hidung (landmark ke-30)
  _nose(lm) { return lm.positions[30]; },

  // Ambil satu frame landmark dari video
  async _frame(videoEl) {
    try {
      const det = await faceapi
        .detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
        .withFaceLandmarks(true);
      return det ? det.landmarks : null;
    } catch (e) { return null; }
  },

  // Pilih challenge acak
  random() {
    return this.CHALLENGES[Math.floor(Math.random() * this.CHALLENGES.length)];
  },

  // Jalankan satu challenge — return { passed: true/false }
  async runChallenge(videoEl, challengeId, timeoutMs = 6000) {
    const EAR_CLOSED  = 0.22;  // mata tertutup (kedip)
    const EAR_OPEN    = 0.28;  // mata harus mulai dari terbuka
    const MOVE_PX     = 22;    // pixel gerakan kepala
    const INTERVAL_MS = 130;   // cek setiap 130ms

    return new Promise(resolve => {
      const deadline = Date.now() + timeoutMs;
      let baseline   = null;
      let eyeWasOpen = false;
      let resolved   = false;

      const done = (passed) => {
        if (resolved) return;
        resolved = true;
        clearInterval(timer);
        resolve({ passed });
      };

      const timer = setInterval(async () => {
        if (Date.now() > deadline) { done(false); return; }
        const lm = await this._frame(videoEl);
        if (!lm) return;

        if (challengeId === 'blink') {
          const ear = this._avgEAR(lm);
          if (ear > EAR_OPEN)             eyeWasOpen = true;
          if (eyeWasOpen && ear < EAR_CLOSED) done(true);
        } else {
          const nose = this._nose(lm);
          if (!baseline) { baseline = { x: nose.x, y: nose.y }; return; }
          const dx = nose.x - baseline.x;
          const dy = nose.y - baseline.y;
          if (challengeId === 'left'  && dx < -MOVE_PX) done(true);
          if (challengeId === 'right' && dx >  MOVE_PX) done(true);
          if (challengeId === 'nod'   && dy >  MOVE_PX) done(true);
        }
      }, INTERVAL_MS);
    });
  }
};

window.Liveness = Liveness;
