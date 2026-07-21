const today = new Date().toLocaleDateString('en-CA');
const shuffle = list => [...list].sort(() => Math.random() - .5);
const savedSelection = JSON.parse(localStorage.getItem(`itm-selection-${today}`) || 'null');
const challenges = savedSelection ? savedSelection.map(id => challengeCatalog.find(challenge => challenge.id === id)).filter(Boolean) : shuffle(['Random', 'Beautiful', 'Funny'].map(vibe => { const matches = challengeCatalog.filter(challenge => challenge.vibe === vibe); return matches[Math.floor(Math.random() * matches.length)]; }));
if (!savedSelection) localStorage.setItem(`itm-selection-${today}`, JSON.stringify(challenges.map(challenge => challenge.id)));

let current = 0, completed = [], stream, recorder, chunks = [], startTime, timerId, lastBlob, lastDuration = 0, reelUrls = [], recordingAudioContext, recordingAudioDestination, microphoneSource, reelStyle = 'Minimal', cameraFacing = 'environment', reelPlayback, exportJob;
const $ = selector => document.querySelector(selector);
const clipDatabase = new Promise((resolve, reject) => {
  const request = indexedDB.open('in-the-moment', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('clips', { keyPath: 'challenge' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
function getClips() { return clipDatabase.then(database => new Promise((resolve, reject) => { const request = database.transaction('clips').objectStore('clips').getAll(); request.onsuccess = () => resolve(request.result.filter(clip => clip.day === today)); request.onerror = () => reject(request.error); })); }
function saveClip(clip) { return clipDatabase.then(database => new Promise((resolve, reject) => { const request = database.transaction('clips', 'readwrite').objectStore('clips').put(clip); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); })); }
function show(id) { document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active')); $(id).classList.add('active'); window.scrollTo(0, 0); }
function toast(message) { const notification = $('#toast'); notification.textContent = message; notification.classList.add('show'); setTimeout(() => notification.classList.remove('show'), 2200); }
function formatted(seconds) { return `00:${String(seconds).padStart(2, '0')}`; }

async function refreshCompleted() { completed = (await getClips()).map(clip => clip.challenge); renderChallenges(); }
function renderChallenges() {
  $('#challengeList').innerHTML = challenges.map((challenge, index) => `<button class="challenge-card ${completed.includes(index) ? 'complete' : ''}" data-index="${index}"><span class="challenge-icon">${challenge.icon}</span><span class="challenge-copy"><small>MOMENT 0${index + 1}</small><strong>${challenge.title}</strong><p>${completed.includes(index) ? 'Captured and saved to your reel' : challenge.prompt}</p></span><span class="${completed.includes(index) ? 'check' : 'card-arrow'}">${completed.includes(index) ? '✓' : '→'}</span></button>`).join('');
  $('#completeCount').textContent = completed.length;
  $('#progressFill').style.width = `${completed.length / challenges.length * 100}%`;
  $('#compilationButton').disabled = completed.length !== challenges.length;
  const reelsLink = document.querySelector('.bottom-nav a[href="#reel"]'); reelsLink.classList.toggle('nav-locked', completed.length !== challenges.length); reelsLink.setAttribute('aria-disabled', String(completed.length !== challenges.length));
  document.querySelectorAll('.challenge-card').forEach(button => button.onclick = () => openChallenge(+button.dataset.index));
}
function openChallenge(index) { current = index; const challenge = challenges[index]; $('#orbEmoji').textContent = challenge.icon; $('#soundOrb').style.background = challenge.color; $('#challengeNumber').textContent = `MOMENT 0${index + 1}`; $('#challengeTitle').textContent = challenge.title; $('#challengePrompt').textContent = challenge.prompt; show('#challenge'); }
function prepareRecordingAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  recordingAudioContext = new AudioContext(); recordingAudioContext.resume();
  recordingAudioDestination = recordingAudioContext.createMediaStreamDestination();
  if (stream.getAudioTracks().length) { microphoneSource = recordingAudioContext.createMediaStreamSource(stream); microphoneSource.connect(recordingAudioDestination); }
  return new MediaStream([...stream.getVideoTracks(), ...recordingAudioDestination.stream.getAudioTracks()]);
}
function playSound() {
  if (!recordingAudioContext || !recordingAudioDestination) return;
  const sound = new Audio(challenges[current].soundPath), source = recordingAudioContext.createMediaElementSource(sound);
  source.connect(recordingAudioContext.destination); source.connect(recordingAudioDestination); sound.play().catch(() => toast('The sound could not be played.')); sound.onended = () => source.disconnect();
}

async function connectCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: cameraFacing } }, audio: true });
    const preview = $('#cameraPreview'); preview.srcObject = stream; preview.style.display = 'block'; $('#cameraFallback').style.display = 'none'; await preview.play().catch(() => {});
  } catch (error) { $('#cameraPreview').style.display = 'none'; $('#cameraFallback').style.display = 'grid'; toast('Camera access is needed to save a video clip.'); }
}
async function prepareCamera() {
  show('#record'); $('#recordingTitle').textContent = challenges[current].title.toUpperCase(); $('#recordingGuidance').textContent = challenges[current].prompt; $('#timer').textContent = '00:00'; $('#soundTrigger').disabled = true; $('#soundTrigger span:last-child').textContent = 'Start recording to unlock sound'; await connectCamera();
}
async function flipCamera() { if (startTime) return toast('Finish this clip before flipping the camera.'); cameraFacing = cameraFacing === 'environment' ? 'user' : 'environment'; stream?.getTracks().forEach(track => track.stop()); stream = null; await connectCamera(); }
function startRecording() {
  if (startTime) return;
  if (!stream) return toast('Please allow camera access before recording.');
  chunks = []; startTime = Date.now(); $('#recordButton').classList.add('is-recording'); $('#recordLabel').textContent = 'RECORDING — TAP TO FINISH'; $('#soundTrigger').disabled = false; $('#soundTrigger span:last-child').textContent = 'Play the sound';
  timerId = setInterval(() => $('#timer').textContent = formatted(Math.floor((Date.now() - startTime) / 1000)), 250);
  try { const recordingStream = prepareRecordingAudio(); recorder = new MediaRecorder(recordingStream); recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); }; recorder.onstop = () => { lastBlob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' }); recorder = null; displayReview(); }; recorder.start(); } catch (error) { clearInterval(timerId); startTime = null; toast('This browser cannot save camera recordings.'); }
}
function stopRecording() { if (!startTime) return; clearInterval(timerId); lastDuration = Math.max(1, Math.floor((Date.now() - startTime) / 1000)); $('#clipDuration').textContent = formatted(lastDuration); if (recorder && recorder.state !== 'inactive') recorder.stop(); else displayReview(); }
function displayReview() {
  stream?.getTracks().forEach(track => track.stop()); stream = null; recordingAudioContext?.close(); recordingAudioContext = recordingAudioDestination = microphoneSource = null;
  const video = $('#reviewVideo'); video.style.display = 'none'; $('#reviewPlaceholder').style.display = 'grid';
  if (lastBlob?.size) { video.src = URL.createObjectURL(lastBlob); video.style.display = 'block'; $('#reviewPlaceholder').style.display = 'none'; }
  show('#review'); $('#recordButton').classList.remove('is-recording'); $('#recordLabel').textContent = 'TAP TO RECORD'; $('#soundTrigger').disabled = true; startTime = null;
}
async function saveMoment() { if (!lastBlob?.size) return toast('No video was captured. Try recording again.'); await saveClip({ challenge: current, day: today, blob: lastBlob, duration: lastDuration, capturedAt: new Date().toISOString() }); await refreshCompleted(); toast('Video saved to your reel'); show('#home'); }

async function renderReel() {
  stopReelPlayback();
  const clips = await getClips(); reelUrls.forEach(URL.revokeObjectURL); reelUrls = [];
  $('#reelClips').className = `reel-clips reel-style-${reelStyle.toLowerCase().replace(' ', '-')}`;
  $('#reelClips').innerHTML = challenges.map((challenge, index) => { const clip = clips.find(item => item.challenge === index), url = clip?.blob ? URL.createObjectURL(clip.blob) : '', shortTitle = challenge.short || challenge.title, label = reelStyle === 'Bold' ? shortTitle.toUpperCase() : shortTitle; if (url) reelUrls.push(url); return `<div class="reel-clip" style="--card-color:${challenge.color}">${url ? `<video src="${url}" muted playsinline preload="metadata"></video>` : ''}${reelStyle === 'Off' ? '' : `<span>${clip ? label : '—'}</span>`}</div>`; }).join('');
  $('#reelPlayer').hidden = true;
}
async function playReel() {
  const clips = (await getClips()).sort((a, b) => a.challenge - b.challenge); if (!clips.length) return toast('Record a moment first.');
  const player = $('#reelPlayer'), caption = $('#reelPlayerCaption'); let activeVideo = $('#reelVideo'), waitingVideo = $('#reelVideoNext'), index = 0, currentUrl, waitingUrl;
  player.hidden = false; player.className = `reel-player reel-style-${reelStyle.toLowerCase()}`; activeVideo.style.opacity = '1'; waitingVideo.style.opacity = '0';
  reelPlayback = { clips, index, activeVideo, waitingVideo, total: clips.reduce((total, clip) => total + (clip.duration || 1), 0) }; $('#reelPlayerToggle').textContent = 'Ⅱ';
  const setCaption = clip => { caption.innerHTML = reelStyle === 'Off' ? '' : `<span class="caption-title">${reelStyle === 'Bold' ? challenges[clip.challenge].title.toUpperCase() : challenges[clip.challenge].title}</span><span class="caption-time">${formatTimestamp(clip.capturedAt)}</span>`; };
  const loadVideo = (video, clip) => new Promise((resolve, reject) => { const url = URL.createObjectURL(clip.blob); video.src = url; video.onloadeddata = () => resolve(url); video.onerror = reject; });
  async function playClip(alreadyPlaying = false) {
    const clip = clips[index]; setCaption(clip); if (!alreadyPlaying) { currentUrl = await loadVideo(activeVideo, clip); await activeVideo.play(); }
    let transitionStarted = false, transitionPromise;
    activeVideo.ontimeupdate = () => {
      const elapsed = clips.slice(0, index).reduce((total, item) => total + (item.duration || 1), 0) + activeVideo.currentTime, progress = Math.min(1000, Math.round(elapsed / reelPlayback.total * 1000)); $('#reelScrubber').value = progress; $('#reelScrubber').style.setProperty('--scrub-progress', `${progress / 10}%`);
      if (transitionStarted || index === clips.length - 1 || activeVideo.duration - activeVideo.currentTime > .35) return;
      transitionStarted = true; transitionPromise = (async () => { waitingUrl = await loadVideo(waitingVideo, clips[index + 1]); await waitingVideo.play(); waitingVideo.style.opacity = '1'; activeVideo.style.opacity = '0'; })();
    };
    activeVideo.onended = async () => {
      if (transitionPromise) await transitionPromise;
      URL.revokeObjectURL(currentUrl); if (index === clips.length - 1) { player.hidden = true; reelPlayback = null; return; }
      index += 1; const previousVideo = activeVideo; activeVideo = waitingVideo; waitingVideo = previousVideo; currentUrl = waitingUrl; activeVideo.style.opacity = '1'; waitingVideo.style.opacity = '0'; await playClip(transitionStarted);
      if (reelPlayback) { reelPlayback.index = index; reelPlayback.activeVideo = activeVideo; reelPlayback.waitingVideo = waitingVideo; }
    };
  }
  playClip();
}
function stopReelPlayback() { if (!reelPlayback) return; reelPlayback.activeVideo.pause(); reelPlayback.waitingVideo.pause(); $('#reelPlayer').hidden = true; $('#reelPlayerToggle').textContent = '▶'; reelPlayback = null; }
function toggleReelPlayback() { if (!reelPlayback) return playReel(); const videos = [reelPlayback.activeVideo, reelPlayback.waitingVideo], paused = reelPlayback.activeVideo.paused; videos.forEach(video => paused ? video.play() : video.pause()); $('#reelPlayerToggle').textContent = paused ? 'Ⅱ' : '▶'; }

$('#startMoment').onclick = prepareCamera; $('#backButton').onclick = () => show('#home');
$('#cancelRecord').onclick = () => { stream?.getTracks().forEach(track => track.stop()); stream = null; show('#challenge'); };
$('#recordButton').onclick = () => startTime ? stopRecording() : startRecording(); $('#soundTrigger').onclick = playSound; $('#saveMoment').onclick = saveMoment; $('#redoMoment').onclick = prepareCamera;
$('#flipCamera').onclick = flipCamera;
$('#compilationButton').onclick = async () => { await renderReel(); show('#reel'); }; $('#reelPlay').onclick = playReel;
$('#reelPlayerToggle').onclick = toggleReelPlayback;
$('#reelScrubber').oninput = event => { if (!reelPlayback) return; const currentDuration = reelPlayback.activeVideo.duration || 1; reelPlayback.activeVideo.currentTime = Math.max(0, Math.min(currentDuration, event.target.value / 1000 * currentDuration)); event.target.style.setProperty('--scrub-progress', `${event.target.value / 10}%`); };
$('#cancelExport').onclick = cancelCurrentExport;
function closeExportSheet() { $('#exportSheet').hidden = true; }
async function shareReel() {
  const caption = 'Three sounds. Perfectly timed. #InTheMoment';
  try { if (navigator.share) await navigator.share({ title: 'My In The Moment reel', text: caption }); else { await navigator.clipboard.writeText(caption); toast('Reel caption copied — ready to share.'); } } catch (error) { if (error.name !== 'AbortError') toast('Sharing is not available in this browser.'); }
  closeExportSheet();
}
function formatTimestamp(dateString) { return new Date(dateString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function setExporting(isExporting) { document.querySelectorAll('.style-pill').forEach(button => button.disabled = isExporting); }
function setExportProgress(value) { const percent = Math.round(value); $('#exportProgress').style.width = `${percent}%`; $('#exportPercent').textContent = `${percent}%`; }
function cancelCurrentExport() { if (!exportJob) return; exportJob.cancelled = true; if (exportJob.recorder?.state === 'recording') exportJob.recorder.stop(); $('#exportStatus').textContent = 'Export cancelled.'; setExporting(false); show('#reel'); toast('Export cancelled.'); }
function drawExportFrame(context, canvas, video, clip, opacity = 1, clear = true) {
  const width = canvas.width, height = canvas.height, videoWidth = video.videoWidth || 9, videoHeight = video.videoHeight || 16;
  const scale = Math.max(width / videoWidth, height / videoHeight), drawnWidth = videoWidth * scale, drawnHeight = videoHeight * scale;
  if (clear) { context.fillStyle = '#171716'; context.fillRect(0, 0, width, height); }
  context.save(); context.globalAlpha = opacity; context.drawImage(video, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);
  const gradient = context.createLinearGradient(0, height * .58, 0, height); gradient.addColorStop(0, 'transparent'); gradient.addColorStop(1, 'rgba(0,0,0,.8)'); context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  if (reelStyle !== 'Off') { context.textAlign = 'center'; if (reelStyle === 'Bold') { context.font = '52px "Archivo Black"'; context.lineWidth = 2; context.strokeStyle = '#76283f'; context.strokeText(challenges[clip.challenge].title.toUpperCase(), width / 2, 118); context.fillStyle = '#fff'; context.fillText(challenges[clip.challenge].title.toUpperCase(), width / 2, 118); context.font = 'italic 29px Georgia'; context.fillStyle = '#fff'; context.fillText(formatTimestamp(clip.capturedAt), width / 2, 160); } else { context.fillStyle = '#fff'; context.font = '600 42px Georgia'; context.fillText(challenges[clip.challenge].title, width / 2, 118); context.font = '24px monospace'; context.fillStyle = '#f7cb43'; context.fillText(formatTimestamp(clip.capturedAt).toUpperCase(), width / 2, 158); } context.textAlign = 'start'; }
  context.restore();
}
async function exportVerticalReel() {
  const clips = (await getClips()).sort((a, b) => a.challenge - b.challenge); if (!clips.length) return toast('Record a moment first.');
  closeExportSheet(); exportJob = { cancelled:false }; setExporting(true); setExportProgress(0); show('#export');
  await document.fonts?.load('52px "Archivo Black"');
  const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 1280; const context = canvas.getContext('2d');
  const exportAudioContext = new (window.AudioContext || window.webkitAudioContext)(); const audioDestination = exportAudioContext.createMediaStreamDestination();
  const candidates = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
  const output = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
  const parts = []; let exportRecorder;
  try { exportRecorder = mimeType ? new MediaRecorder(output, { mimeType }) : new MediaRecorder(output); exportJob.recorder = exportRecorder; } catch (error) { $('#exportStatus').textContent = 'Export is not supported in this browser.'; exportJob = null; setExporting(false); show('#reel'); return toast('This browser cannot create a video export.'); }
  const finished = new Promise(resolve => { exportRecorder.onstop = () => resolve(new Blob(parts, { type: exportRecorder.mimeType })); });
  exportRecorder.ondataavailable = event => { if (event.data.size) parts.push(event.data); }; exportRecorder.start();
  const items = await Promise.all(clips.map(async clip => { const video = document.createElement('video'), url = URL.createObjectURL(clip.blob); video.src = url; video.playsInline = true; video.preload = 'auto'; await new Promise((resolve, reject) => { video.oncanplay = resolve; video.onerror = reject; }); const source = exportAudioContext.createMediaElementSource(video), gain = exportAudioContext.createGain(); source.connect(gain).connect(audioDestination); return { clip, video, url, gain }; }));
  const transitionDuration = .35; setExportProgress(5);
  for (let index = 0; index < items.length && !exportJob.cancelled; index += 1) {
    const item = items[index], next = items[index + 1]; let nextStarted = false, frame;
    item.gain.gain.value = 1; if (!item.video.currentTime) await item.video.play();
    await new Promise(resolve => { const render = () => {
      const remaining = Math.max(0, item.video.duration - item.video.currentTime), progress = nextStarted ? Math.min(1, 1 - remaining / transitionDuration) : 0;
      setExportProgress(5 + ((index + item.video.currentTime / Math.max(item.video.duration, 1)) / items.length) * 90);
      if (next && !nextStarted && remaining <= transitionDuration) { nextStarted = true; next.gain.gain.value = 0; next.video.play(); }
      if (nextStarted) { item.gain.gain.value = 1 - progress; next.gain.gain.value = progress; }
      drawExportFrame(context, canvas, item.video, item.clip, nextStarted ? 1 - progress : 1, true);
      if (nextStarted) drawExportFrame(context, canvas, next.video, next.clip, progress, false);
      if (exportJob.cancelled || item.video.ended) { cancelAnimationFrame(frame); resolve(); } else frame = requestAnimationFrame(render);
    }; render(); });
  }
  items.forEach(item => { item.gain.disconnect(); URL.revokeObjectURL(item.url); });
  if (exportJob.cancelled) { if (exportRecorder.state === 'recording') exportRecorder.stop(); await finished; await exportAudioContext.close(); exportJob = null; return; }
  exportRecorder.stop(); const reel = await finished; await exportAudioContext.close();
  const extension = reel.type.includes('mp4') ? 'mp4' : 'webm', link = document.createElement('a'); link.href = URL.createObjectURL(reel); link.download = `in-the-moment-reel.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  setExportProgress(100); $('#exportStatus').textContent = extension === 'mp4' ? 'Your 9:16 MP4 reel is ready.' : 'Your 9:16 reel is ready (this browser exported WebM).'; exportJob = null; setExporting(false); show('#reel'); toast(extension === 'mp4' ? 'MP4 reel downloaded.' : 'Vertical reel downloaded.');
}
async function copyReelCaption() { await navigator.clipboard.writeText('Three sounds. Perfectly timed. #InTheMoment'); closeExportSheet(); toast('Reel caption copied.'); }
$('#exportReel').onclick = () => { $('#exportSheet').hidden = false; };
$('#closeExportSheet').onclick = closeExportSheet; $('#downloadClips').onclick = exportVerticalReel; $('#copyCaption').onclick = copyReelCaption;
document.querySelectorAll('.style-pill').forEach(button => button.onclick = async () => { reelStyle = button.dataset.style; document.querySelectorAll('.style-pill').forEach(item => item.classList.remove('active')); button.classList.add('active'); await renderReel(); toast(`${button.dataset.style} reel style selected`); });
$('#settingsButton').onclick = () => toast('Settings coming soon');
document.querySelectorAll('.bottom-nav a').forEach(link => link.onclick = async event => { event.preventDefault(); if (link.getAttribute('href') === '#reel') { if (completed.length !== challenges.length) return toast('Capture all three moments to unlock your reel.'); await renderReel(); show('#reel'); } else if (link.getAttribute('href') === '#home') show('#home'); else toast('Settings coming soon'); document.querySelectorAll('.bottom-nav a').forEach(item => item.classList.remove('nav-active')); link.classList.add('nav-active'); });
refreshCompleted();
