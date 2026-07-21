function getDailyKey(date = new Date()) { const dailyDate = new Date(date); if (dailyDate.getHours() < 9) dailyDate.setDate(dailyDate.getDate() - 1); return dailyDate.toLocaleDateString('en-CA'); }
const today = getDailyKey();
const dateSeed = [...today].reduce((seed, character) => (seed * 31 + character.charCodeAt(0)) >>> 0, 0);
const dailyRandom = (() => { let seed = dateSeed || 1; return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); })();
const dailyShuffle = list => [...list].sort(() => dailyRandom() - .5);
const challenges = dailyShuffle(['Random', 'Beautiful', 'Funny'].map(vibe => { const matches = challengeCatalog.filter(challenge => challenge.vibe === vibe); return matches[Math.floor(dailyRandom() * matches.length)]; }));

let current = 0, completed = [], stream, recorder, chunks = [], micRecorder, micChunks = [], micStopPromise = Promise.resolve(), startTime, timerId, lastBlob, lastMicBlob, lastDuration = 0, reelUrls = [], cachedReelClips = [], recordingAudioContext, recordingAudioDestination, microphoneSource, micGain, reelStyle = 'Minimal', cameraFacing = 'environment', reelPlayback, exportJob, reelControlsTimer, randomSoundTimer, reviewVideoUrl;
let sessionClips = [];
const soundBufferCache = new Map();
let soundSettings = { randomSoundPlay:false, randomSounds:false, fxVolume:'medium', micVolume:'on', ...JSON.parse(localStorage.getItem('itm-sound-settings') || '{}') };
const $ = selector => document.querySelector(selector);
const isMobileSafari = /iP(ad|hone|od)/.test(navigator.userAgent) && /WebKit/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
const now = new Date();
$('#todayDate').textContent = now.toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' }).toUpperCase();
$('#reelDate').textContent = now.toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' }).toUpperCase();
function refreshForNewDay() { window.location.hash = 'home'; window.location.reload(); }
function scheduleDailyRefresh() { const nextDay = new Date(); nextDay.setHours(9, 0, 1, 0); if (nextDay <= new Date()) nextDay.setDate(nextDay.getDate() + 1); setTimeout(refreshForNewDay, nextDay - Date.now()); }
scheduleDailyRefresh();
document.addEventListener('visibilitychange', () => { if (!document.hidden && getDailyKey() !== today) refreshForNewDay(); });
const clipDatabase = new Promise((resolve, reject) => {
  const request = indexedDB.open('in-the-moment', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('clips', { keyPath: 'challenge' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function getClips() { try { const storedClips = await clipDatabase.then(database => new Promise((resolve, reject) => { const request = database.transaction('clips').objectStore('clips').getAll(); request.onsuccess = () => resolve(request.result.filter(clip => clip.day === today)); request.onerror = () => reject(request.error); })); const fallbackClips = sessionClips.filter(clip => clip.day === today && !storedClips.some(item => item.challenge === clip.challenge)); return [...storedClips, ...fallbackClips]; } catch (error) { return sessionClips.filter(clip => clip.day === today); } }
async function saveClip(clip) { try { await clipDatabase.then(database => new Promise((resolve, reject) => { const store = database.transaction('clips', 'readwrite').objectStore('clips'); const remove = store.delete(clip.challenge); remove.onerror = () => reject(remove.error); const save = store.put(clip); save.onsuccess = () => resolve(); save.onerror = () => reject(save.error); })); } catch (error) { sessionClips = [...sessionClips.filter(item => item.challenge !== clip.challenge), clip]; } }
async function deleteAllRecordings() { if (!window.confirm('Delete every saved recording? This cannot be undone.')) return; stopReelPlayback(); sessionClips = []; cachedReelClips = []; completed = []; lastBlob = null; if (reviewVideoUrl) URL.revokeObjectURL(reviewVideoUrl); reelUrls.forEach(URL.revokeObjectURL); reelUrls = []; try { const database = await clipDatabase; await new Promise((resolve, reject) => { const request = database.transaction('clips', 'readwrite').objectStore('clips').clear(); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); database.close(); } catch (_) { /* Session-only clips were already cleared. */ } window.location.hash = 'home'; window.location.reload(); }
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
function persistSoundSettings() { localStorage.setItem('itm-sound-settings', JSON.stringify(soundSettings)); renderSoundSettings(); }
function renderSoundSettings() { $('#randomSoundPlay').classList.toggle('active', soundSettings.randomSoundPlay); $('#randomSoundPlay').setAttribute('aria-pressed', String(soundSettings.randomSoundPlay)); $('#randomSounds').classList.toggle('active', soundSettings.randomSounds); $('#randomSounds').setAttribute('aria-pressed', String(soundSettings.randomSounds)); $('#micOnExport').classList.toggle('active', soundSettings.micVolume === 'on'); $('#micOnExport').setAttribute('aria-pressed', String(soundSettings.micVolume === 'on')); document.querySelectorAll('#fxVolume button').forEach(button => button.classList.toggle('active', button.dataset.value === soundSettings.fxVolume)); }
function soundForPlayback() { if (!soundSettings.randomSounds) return challenges[current]; const key = `itm-used-sounds-${today}`, used = JSON.parse(localStorage.getItem(key) || '[]'), available = challengeCatalog.filter(challenge => !used.includes(challenge.soundPath)), choice = available[Math.floor(Math.random() * available.length)] || challengeCatalog[Math.floor(Math.random() * challengeCatalog.length)]; localStorage.setItem(key, JSON.stringify([...used, choice.soundPath])); return choice; }
function prepareRecordingAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  recordingAudioContext = new AudioContext(); recordingAudioContext.resume();
  recordingAudioDestination = recordingAudioContext.createMediaStreamDestination();
  return new MediaStream([...stream.getVideoTracks(), ...recordingAudioDestination.stream.getAudioTracks()]);
}
function startMicCapture() { lastMicBlob = null; micChunks = []; if (!stream?.getAudioTracks().length) return; try { micRecorder = new MediaRecorder(new MediaStream([stream.getAudioTracks()[0].clone()])); micStopPromise = new Promise(resolve => { micRecorder.ondataavailable = event => { if (event.data.size) micChunks.push(event.data); }; micRecorder.onstop = () => { lastMicBlob = micChunks.length ? new Blob(micChunks, { type: micRecorder.mimeType || 'audio/webm' }) : null; resolve(); }; isMobileSafari ? micRecorder.start() : micRecorder.start(1000); }); } catch (_) { micRecorder = null; micStopPromise = Promise.resolve(); } }
async function loadSoundBuffer(soundPath) { if (!soundBufferCache.has(soundPath)) soundBufferCache.set(soundPath, fetch(encodeURI(soundPath)).then(response => { if (!response.ok) throw new Error('Sound unavailable'); return response.arrayBuffer(); }).then(data => recordingAudioContext.decodeAudioData(data))); return soundBufferCache.get(soundPath); }
async function playSound(isScheduledSound = false) {
  if (!recordingAudioContext || !recordingAudioDestination) return;
  await recordingAudioContext.resume();
  const selectedSound = soundForPlayback(), volume = { low:.35, medium:.7, high:1 }[soundSettings.fxVolume];
  const unlockSoundButton = () => { if (isScheduledSound && startTime) { $('#soundTrigger').disabled = false; $('#soundTrigger span:last-child').textContent = 'Play the sound'; } };
  try { const buffer = await loadSoundBuffer(selectedSound.soundPath), source = recordingAudioContext.createBufferSource(), gain = recordingAudioContext.createGain(); source.buffer = buffer; gain.gain.value = volume; source.connect(gain); gain.connect(recordingAudioContext.destination); gain.connect(recordingAudioDestination); source.start(); if (isScheduledSound) setTimeout(unlockSoundButton, 120); source.onended = () => { source.disconnect(); gain.disconnect(); unlockSoundButton(); }; } catch (error) { const sound = new Audio(selectedSound.soundPath), source = recordingAudioContext.createMediaElementSource(sound), gain = recordingAudioContext.createGain(); gain.gain.value = volume; source.connect(gain); gain.connect(recordingAudioContext.destination); gain.connect(recordingAudioDestination); sound.play().then(() => { if (isScheduledSound) setTimeout(unlockSoundButton, 120); }).catch(() => { toast('The sound could not be played.'); unlockSoundButton(); }); sound.onended = () => { source.disconnect(); gain.disconnect(); unlockSoundButton(); }; }
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
  chunks = []; startTime = Date.now(); $('#recordButton').classList.add('is-recording'); $('#recordLabel').textContent = 'RECORDING — TAP TO FINISH'; $('#soundTrigger').disabled = soundSettings.randomSoundPlay; $('#soundTrigger span:last-child').textContent = soundSettings.randomSoundPlay ? 'Sound incoming…' : 'Play the sound';
  timerId = setInterval(() => $('#timer').textContent = formatted(Math.floor((Date.now() - startTime) / 1000)), 250);
  try { const recordingStream = prepareRecordingAudio(); startMicCapture(); recorder = new MediaRecorder(recordingStream); recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); }; recorder.onstop = async () => { lastBlob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' }); recorder = null; await micStopPromise; displayReview(); }; isMobileSafari ? recorder.start() : recorder.start(1000); if (soundSettings.randomSoundPlay) randomSoundTimer = setTimeout(() => { if (startTime) playSound(true); }, (3 + Math.random() * 4) * 1000); } catch (error) { clearInterval(timerId); startTime = null; toast('This browser cannot save camera recordings.'); }
}
function stopRecording() { if (!startTime) return; clearInterval(timerId); clearTimeout(randomSoundTimer); lastDuration = Math.max(1, Math.floor((Date.now() - startTime) / 1000)); $('#clipDuration').textContent = formatted(lastDuration); if (!isMobileSafari) { try { micRecorder?.requestData(); recorder?.requestData(); } catch (_) { /* Some mobile recorders only flush on stop. */ } } if (micRecorder?.state !== 'inactive') micRecorder.stop(); if (recorder && recorder.state !== 'inactive') recorder.stop(); else displayReview(); }
function displayReview() {
  clearTimeout(randomSoundTimer); stream?.getTracks().forEach(track => track.stop()); stream = null; recordingAudioContext?.close(); recordingAudioContext = recordingAudioDestination = microphoneSource = micGain = null;
  const video = $('#reviewVideo'); video.pause(); if (reviewVideoUrl) URL.revokeObjectURL(reviewVideoUrl); reviewVideoUrl = null; video.removeAttribute('src'); video.load(); video.style.display = 'none'; $('#reviewPlaceholder').style.display = 'grid';
  if (lastBlob?.size) { reviewVideoUrl = URL.createObjectURL(lastBlob); video.src = reviewVideoUrl; video.load(); video.style.display = 'block'; $('#reviewPlaceholder').style.display = 'none'; }
  show('#review'); $('#recordButton').classList.remove('is-recording'); $('#recordLabel').textContent = 'TAP TO RECORD'; $('#soundTrigger').disabled = true; startTime = null;
}
async function saveMoment() { if (!lastBlob?.size) return toast('No video was captured. Try recording again.'); const button = $('#saveMoment'), originalLabel = button.innerHTML; button.disabled = true; button.textContent = 'Adding to your reel…'; try { await micStopPromise; await saveClip({ challenge: current, day: today, blob: lastBlob, micBlob: lastMicBlob, duration: lastDuration, capturedAt: new Date().toISOString() }); cachedReelClips = []; reelUrls.forEach(URL.revokeObjectURL); reelUrls = []; await refreshCompleted(); await renderReel(); toast('Video saved to your reel'); show('#home'); } catch (error) { toast('Could not save this clip. Please try again.'); } finally { button.disabled = false; button.innerHTML = originalLabel; } }

async function renderReel() {
  stopReelPlayback();
  const clips = await getClips(); reelUrls.forEach(URL.revokeObjectURL); reelUrls = [];
  cachedReelClips = clips.sort((a, b) => a.challenge - b.challenge);
  $('#reelClips').className = `reel-clips reel-style-${reelStyle.toLowerCase().replace(' ', '-')}`;
  $('#reelClips').innerHTML = challenges.map((challenge, index) => { const clip = clips.find(item => item.challenge === index), url = clip?.blob ? URL.createObjectURL(clip.blob) : '', shortTitle = challenge.short || challenge.title, label = reelStyle === 'Bold' ? shortTitle.toUpperCase() : shortTitle; if (url) reelUrls.push(url); return `<div class="reel-clip" style="--card-color:${challenge.color}">${url ? `<video src="${url}" muted playsinline preload="metadata"></video>` : ''}${reelStyle === 'Off' ? '' : `<span>${clip ? label : '—'}</span>`}</div>`; }).join('');
  $('#reelPlayer').hidden = true;
}
async function startPreviewVideo(video) { try { await video.play(); } catch (error) { video.muted = true; video.defaultMuted = true; video.setAttribute('muted', ''); await video.play().catch(() => toast('Video playback is unavailable in this browser.')); } }
function playMobileSafariReel(clips, startIndex = 0) {
  const player = $('#reelPlayer'), video = $('#reelVideo'), waitingVideo = $('#reelVideoNext'), caption = $('#reelPlayerCaption'); let index = startIndex, currentUrl, micAudio, micUrl, sourceVersion = 0;
  waitingVideo.pause(); waitingVideo.removeAttribute('src'); waitingVideo.load(); video.muted = false; video.defaultMuted = false; video.removeAttribute('muted'); video.volume = 1; video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
  player.hidden = false; player.className = `reel-player reel-style-${reelStyle.toLowerCase()}`; video.style.opacity = '1'; waitingVideo.style.opacity = '0';
  reelPlayback = { clips, index, activeVideo:video, waitingVideo, total:clips.reduce((total, clip) => total + (clip.duration || 1), 0) }; $('#reelPlayerToggle').textContent = 'Ⅱ'; revealReelControls();
  const stopMic = () => { micAudio?.pause(); if (micUrl) URL.revokeObjectURL(micUrl); micAudio = null; micUrl = null; };
  const playIndex = () => { const clip = clips[index], version = ++sourceVersion; caption.innerHTML = reelStyle === 'Off' ? '' : `<span class="caption-title">${reelStyle === 'Bold' ? challenges[clip.challenge].title.toUpperCase() : challenges[clip.challenge].title}</span><span class="caption-time">${formatTimestamp(clip.capturedAt)}</span>`; stopMic(); video.pause(); video.onended = null; video.style.opacity = '0'; if (currentUrl) URL.revokeObjectURL(currentUrl); currentUrl = URL.createObjectURL(clip.blob); const begin = () => { if (version !== sourceVersion) return; video.currentTime = 0; video.style.opacity = '1'; if (soundSettings.micVolume === 'on' && clip.micBlob) { micUrl = URL.createObjectURL(clip.micBlob); micAudio = new Audio(micUrl); micAudio.play().catch(() => {}); reelPlayback.micAudio = micAudio; } video.play().catch(() => { $('#reelPlayerToggle').textContent = '▶'; toast('Tap play to start the reel with sound.'); }); }; video.onloadeddata = begin; video.src = currentUrl; video.load(); video.onseeked = () => { if (micAudio) micAudio.currentTime = video.currentTime; }; video.onended = () => { if (version !== sourceVersion) return; stopMic(); if (index === clips.length - 1) { player.hidden = true; reelPlayback = null; return; } index += 1; reelPlayback.index = index; playIndex(); }; };
  playIndex();
}
async function playReel(startIndex = 0, startTime = 0, autoPlay = true) {
  const clips = cachedReelClips.length ? cachedReelClips : (await getClips()).sort((a, b) => a.challenge - b.challenge); if (!clips.length) return toast('Record a moment first.');
  return playMobileSafariReel(clips, startIndex);
  const player = $('#reelPlayer'), caption = $('#reelPlayerCaption'); let activeVideo = $('#reelVideo'), waitingVideo = $('#reelVideoNext'), index = startIndex, currentUrl, waitingUrl, initialTime = startTime;
  player.hidden = false; player.className = `reel-player reel-style-${reelStyle.toLowerCase()}`; activeVideo.style.opacity = '1'; waitingVideo.style.opacity = '0';
  reelPlayback = { clips, index, activeVideo, waitingVideo, total: clips.reduce((total, clip) => total + (clip.duration || 1), 0) }; $('#reelPlayerToggle').textContent = 'Ⅱ'; revealReelControls();
  const setCaption = clip => { caption.innerHTML = reelStyle === 'Off' ? '' : `<span class="caption-title">${reelStyle === 'Bold' ? challenges[clip.challenge].title.toUpperCase() : challenges[clip.challenge].title}</span><span class="caption-time">${formatTimestamp(clip.capturedAt)}</span>`; };
  const loadVideo = (video, clip) => new Promise((resolve, reject) => { const url = URL.createObjectURL(clip.blob); video.src = url; video.onloadeddata = () => resolve(url); video.onerror = reject; });
  async function playClip(alreadyPlaying = false) {
    const clip = clips[index]; setCaption(clip); if (!alreadyPlaying) { currentUrl = await loadVideo(activeVideo, clip); activeVideo.currentTime = initialTime; initialTime = 0; if (autoPlay) await startPreviewVideo(activeVideo); else $('#reelPlayerToggle').textContent = '▶'; }
    let transitionStarted = false, transitionPromise;
    activeVideo.ontimeupdate = () => {
      if (isMobileSafari || transitionStarted || index === clips.length - 1 || activeVideo.duration - activeVideo.currentTime > .35) return;
      transitionStarted = true; transitionPromise = (async () => { waitingUrl = await loadVideo(waitingVideo, clips[index + 1]); await startPreviewVideo(waitingVideo); waitingVideo.style.opacity = '1'; activeVideo.style.opacity = '0'; })();
    };
    activeVideo.onended = async () => {
      if (!transitionPromise && index < clips.length - 1) { transitionStarted = true; transitionPromise = (async () => { waitingUrl = await loadVideo(waitingVideo, clips[index + 1]); await startPreviewVideo(waitingVideo); })(); }
      if (transitionPromise) await transitionPromise;
      URL.revokeObjectURL(currentUrl); if (index === clips.length - 1) { player.hidden = true; reelPlayback = null; return; }
      index += 1; const previousVideo = activeVideo; activeVideo = waitingVideo; waitingVideo = previousVideo; currentUrl = waitingUrl; activeVideo.style.opacity = '1'; waitingVideo.style.opacity = '0'; await playClip(transitionStarted);
      if (reelPlayback) { reelPlayback.index = index; reelPlayback.activeVideo = activeVideo; reelPlayback.waitingVideo = waitingVideo; }
    };
  }
  playClip();
}
function revealReelControls() { const player = $('#reelPlayer'); clearTimeout(reelControlsTimer); player.classList.add('show-controls'); reelControlsTimer = setTimeout(() => { if (reelPlayback && !reelPlayback.activeVideo.paused) player.classList.remove('show-controls'); }, 1400); }
function stopReelPlayback() { if (!reelPlayback) return; clearTimeout(reelControlsTimer); reelPlayback.activeVideo.pause(); reelPlayback.waitingVideo.pause(); reelPlayback.micAudio?.pause(); $('#reelPlayer').hidden = true; $('#reelPlayer').classList.remove('show-controls'); $('#reelPlayerToggle').textContent = '▶'; reelPlayback = null; }
function pauseReelPlayback() { if (!reelPlayback) return; reelPlayback.activeVideo.pause(); reelPlayback.waitingVideo.pause(); $('#reelPlayerToggle').textContent = '▶'; revealReelControls(); }
function toggleReelPlayback() { if (!reelPlayback) return playReel(); const activeVideo = reelPlayback.activeVideo, paused = activeVideo.paused, resume = video => isMobileSafari ? video.play() : startPreviewVideo(video); if (paused) { resume(activeVideo).catch(() => toast('Tap play to resume with sound.')); if (reelPlayback.waitingVideo.src && reelPlayback.waitingVideo.style.opacity === '1') resume(reelPlayback.waitingVideo); } else { activeVideo.pause(); reelPlayback.waitingVideo.pause(); } $('#reelPlayerToggle').textContent = paused ? 'Ⅱ' : '▶'; revealReelControls(); }

$('#startMoment').onclick = prepareCamera; $('#backButton').onclick = () => show('#home');
$('#cancelRecord').onclick = () => { clearTimeout(randomSoundTimer); stream?.getTracks().forEach(track => track.stop()); stream = null; recordingAudioContext?.close(); recordingAudioContext = recordingAudioDestination = microphoneSource = micGain = null; show('#challenge'); };
$('#recordButton').onclick = () => startTime ? stopRecording() : startRecording(); $('#soundTrigger').onclick = playSound; $('#saveMoment').onclick = saveMoment; $('#redoMoment').onclick = prepareCamera;
$('#flipCamera').onclick = flipCamera;
$('#compilationButton').onclick = async () => { await renderReel(); show('#reel'); }; $('#reelPlay').onclick = () => playReel();
$('#reelPlayer').onclick = event => { if (event.target === $('#reelRewind')) return; toggleReelPlayback(); };
$('#reelPlayerToggle').onclick = event => { event.stopPropagation(); toggleReelPlayback(); };
$('#reelRewind').onclick = event => { event.stopPropagation(); if (!reelPlayback) return; stopReelPlayback(); playReel(0, 0, true); };
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
  await exportAudioContext.resume();
  const candidates = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
  const output = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
  const parts = []; let exportRecorder;
  try { exportRecorder = mimeType ? new MediaRecorder(output, { mimeType }) : new MediaRecorder(output); exportJob.recorder = exportRecorder; } catch (error) { $('#exportStatus').textContent = 'Export is not supported in this browser.'; exportJob = null; setExporting(false); show('#reel'); return toast('This browser cannot create a video export.'); }
  const finished = new Promise(resolve => { exportRecorder.onstop = () => resolve(new Blob(parts, { type: exportRecorder.mimeType })); });
  exportRecorder.ondataavailable = event => { if (event.data.size) parts.push(event.data); }; exportRecorder.start(1000);
  const finishRecorder = async () => {
    if (exportRecorder.state === 'recording') {
      try { exportRecorder.requestData(); } catch (_) { /* Safari may already be flushing. */ }
      await new Promise(resolve => setTimeout(resolve, 150));
      exportRecorder.stop();
    }
    return Promise.race([finished, new Promise(resolve => setTimeout(() => resolve(new Blob(parts, { type: exportRecorder.mimeType })), 3500))]);
  };
  const startExportVideo = async video => { try { const started = video.play(); await Promise.race([started.catch(() => {}), new Promise(resolve => setTimeout(resolve, 1200))]); } catch (_) { /* Continue with Safari's duration fallback. */ } };
  let mobileExportStage;
  const waitForExportVideo = video => new Promise((resolve, reject) => { let settled = false; const finish = () => { if (!settled) { settled = true; resolve(); } }; video.onloadeddata = finish; video.oncanplay = finish; video.onerror = () => { if (!settled) { settled = true; reject(new Error('Could not load this clip.')); } }; if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish(); setTimeout(finish, 5000); });
  const prepareExportItem = async clip => {
    const url = URL.createObjectURL(clip.blob); let video, source, gain, mic, micUrl, micSource, micGain;
    if (isMobileSafari) {
      if (!mobileExportStage) { video = document.createElement('video'); video.className = 'export-video-stage'; video.playsInline = true; video.preload = 'auto'; video.muted = false; video.volume = 1; document.body.append(video); source = exportAudioContext.createMediaElementSource(video); gain = exportAudioContext.createGain(); source.connect(gain).connect(audioDestination); mobileExportStage = { video, source, gain }; }
      ({ video, source, gain } = mobileExportStage); video.pause(); video.removeAttribute('src'); video.load(); video.src = url; video.load();
    } else { video = document.createElement('video'); video.src = url; video.playsInline = true; video.muted = false; video.volume = 1; video.preload = 'auto'; source = exportAudioContext.createMediaElementSource(video); gain = exportAudioContext.createGain(); source.connect(gain).connect(audioDestination); }
    if (soundSettings.micVolume === 'on' && clip.micBlob) { micUrl = URL.createObjectURL(clip.micBlob); mic = new Audio(micUrl); mic.preload = 'auto'; micSource = exportAudioContext.createMediaElementSource(mic); micGain = exportAudioContext.createGain(); micSource.connect(micGain).connect(audioDestination); }
    await waitForExportVideo(video); return { clip, video, url, gain, mic, micUrl, micSource, micGain, sharedStage:isMobileSafari };
  };
  const items = isMobileSafari ? [] : await Promise.all(clips.map(prepareExportItem));
  const transitionDuration = isMobileSafari ? 0 : .35, mobileFadeDuration = 350; let mobileTransitionFrame = null;
  setExportProgress(5);
  for (let index = 0; index < clips.length && !exportJob.cancelled; index += 1) {
    const item = isMobileSafari ? await prepareExportItem(clips[index]) : items[index], next = isMobileSafari ? undefined : items[index + 1]; if (isMobileSafari) items.push(item); let nextStarted = false, frame, mobileFadeStartedAt = 0, playbackStartedAt = performance.now();
    item.gain.gain.value = 1; if (item.micGain) item.micGain.gain.value = 1; if (!item.video.currentTime) { await startExportVideo(item.video); if (item.mic) await startExportVideo(item.mic); }
    mobileFadeStartedAt = performance.now();
    await new Promise(resolve => { const render = () => {
      const remaining = Math.max(0, item.video.duration - item.video.currentTime), progress = nextStarted ? Math.min(1, 1 - remaining / transitionDuration) : 0;
      const expectedPlaybackMs = Math.max(3000, (Number.isFinite(item.video.duration) ? item.video.duration * 1000 : 0) + 2000), elapsedProgress = Math.min(1, (performance.now() - playbackStartedAt) / expectedPlaybackMs), clipProgress = Math.max(item.video.currentTime / Math.max(item.video.duration, 1), elapsedProgress);
      setExportProgress(5 + ((index + clipProgress) / clips.length) * 90);
      if (next && transitionDuration && !nextStarted && remaining <= transitionDuration) { nextStarted = true; next.gain.gain.value = 0; if (next.micGain) next.micGain.gain.value = 0; next.video.play().catch(() => {}); next.mic?.play().catch(() => {}); }
      if (nextStarted) { item.gain.gain.value = 1 - progress; next.gain.gain.value = progress; if (item.micGain) item.micGain.gain.value = 1 - progress; if (next.micGain) next.micGain.gain.value = progress; }
      const mobileFadeProgress = isMobileSafari && mobileTransitionFrame ? Math.min(1, (performance.now() - mobileFadeStartedAt) / mobileFadeDuration) : 1;
      if (isMobileSafari && mobileTransitionFrame && mobileFadeProgress < 1) { context.drawImage(mobileTransitionFrame, 0, 0); drawExportFrame(context, canvas, item.video, item.clip, mobileFadeProgress, false); } else { mobileTransitionFrame = null; drawExportFrame(context, canvas, item.video, item.clip, nextStarted ? 1 - progress : 1, true); }
      if (nextStarted) drawExportFrame(context, canvas, next.video, next.clip, progress, false);
      const clipFinished = item.video.ended || (Number.isFinite(item.video.duration) && item.video.currentTime >= item.video.duration - .04) || (isMobileSafari && performance.now() - playbackStartedAt >= expectedPlaybackMs);
      if (exportJob.cancelled || clipFinished) { cancelAnimationFrame(frame); resolve(); } else frame = requestAnimationFrame(render);
    }; render(); });
    if (isMobileSafari) { if (index < clips.length - 1) { mobileTransitionFrame = document.createElement('canvas'); mobileTransitionFrame.width = canvas.width; mobileTransitionFrame.height = canvas.height; mobileTransitionFrame.getContext('2d').drawImage(canvas, 0, 0); } item.mic?.pause(); item.micSource?.disconnect(); item.micGain?.disconnect(); if (item.micUrl) URL.revokeObjectURL(item.micUrl); URL.revokeObjectURL(item.url); items.pop(); }
  }
  items.forEach(item => { item.gain.disconnect(); item.video.remove(); item.mic?.pause(); item.micSource?.disconnect(); item.micGain?.disconnect(); if (item.micUrl) URL.revokeObjectURL(item.micUrl); URL.revokeObjectURL(item.url); });
  if (mobileExportStage) { mobileExportStage.gain.disconnect(); mobileExportStage.video.pause(); mobileExportStage.video.remove(); }
  if (exportJob.cancelled) { await finishRecorder(); await exportAudioContext.close(); exportJob = null; return; }
  setExportProgress(96); $('#exportStatus').textContent = 'Finishing your reel…';
  const reel = await finishRecorder(); await exportAudioContext.close();
  const extension = reel.type.includes('mp4') ? 'mp4' : 'webm', link = document.createElement('a'); link.href = URL.createObjectURL(reel); link.download = `in-the-moment-reel.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  setExportProgress(100); $('#exportStatus').textContent = extension === 'mp4' ? 'Your 9:16 MP4 reel is ready.' : 'Your 9:16 reel is ready (this browser exported WebM).'; exportJob = null; setExporting(false); show('#reel'); toast(extension === 'mp4' ? 'MP4 reel downloaded.' : 'Vertical reel downloaded.');
}
async function copyReelCaption() { await navigator.clipboard.writeText('Three sounds. Perfectly timed. #InTheMoment'); closeExportSheet(); toast('Reel caption copied.'); }
$('#exportReel').onclick = () => { pauseReelPlayback(); $('#exportSheet').hidden = false; };
$('#closeExportSheet').onclick = closeExportSheet; $('#downloadClips').onclick = exportVerticalReel; $('#copyCaption').onclick = copyReelCaption;
document.querySelectorAll('.style-pill').forEach(button => button.onclick = async () => { reelStyle = button.dataset.style; document.querySelectorAll('.style-pill').forEach(item => item.classList.remove('active')); button.classList.add('active'); await renderReel(); toast(`${button.dataset.style} reel style selected`); });
$('#settingsButton').onclick = () => { renderSoundSettings(); $('#settingsSheet').hidden = false; };
$('#closeSettings').onclick = () => { $('#settingsSheet').hidden = true; };
$('#randomSoundPlay').onclick = () => { soundSettings.randomSoundPlay = !soundSettings.randomSoundPlay; persistSoundSettings(); };
$('#randomSounds').onclick = () => { soundSettings.randomSounds = !soundSettings.randomSounds; persistSoundSettings(); };
document.querySelectorAll('#fxVolume button').forEach(button => button.onclick = () => { soundSettings.fxVolume = button.dataset.value; persistSoundSettings(); });
$('#micOnExport').onclick = () => { soundSettings.micVolume = soundSettings.micVolume === 'on' ? 'off' : 'on'; persistSoundSettings(); };
$('#deleteRecordings').onclick = deleteAllRecordings;
renderSoundSettings();
document.querySelectorAll('.bottom-nav a').forEach(link => link.onclick = async event => { event.preventDefault(); if (link.getAttribute('href') === '#reel') { if (completed.length !== challenges.length) return toast('Capture all three moments to unlock your reel.'); await renderReel(); show('#reel'); } else if (link.getAttribute('href') === '#home') show('#home'); else toast('Settings coming soon'); document.querySelectorAll('.bottom-nav a').forEach(item => item.classList.remove('nav-active')); link.classList.add('nav-active'); });
refreshCompleted();
