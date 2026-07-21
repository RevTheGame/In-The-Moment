function getDailyKey(date = new Date()) { const dailyDate = new Date(date); if (dailyDate.getHours() < 9) dailyDate.setDate(dailyDate.getDate() - 1); return dailyDate.toLocaleDateString('en-CA'); }
const today = getDailyKey();
const dateSeed = [...today].reduce((seed, character) => (seed * 31 + character.charCodeAt(0)) >>> 0, 0);
const dailyRandom = (() => { let seed = dateSeed || 1; return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); })();
const dailyShuffle = list => [...list].sort(() => dailyRandom() - .5);
const challenges = dailyShuffle(['Random', 'Beautiful', 'Funny'].map(vibe => { const matches = challengeCatalog.filter(challenge => challenge.vibe === vibe); return matches[Math.floor(dailyRandom() * matches.length)]; }));

let current = 0, completed = [], stream, recorder, micRecorder, micChunks = [], micStopPromise = Promise.resolve(), micCaptureTrack, finishMicCapture = () => {}, startTime, timerId, lastBlob, lastMicBlob, lastDuration = 0, lastAudioLayout = 'mixed', reelUrls = [], cachedReelClips = [], recordingAudioContext, recordingAudioDestination, microphoneSource, micGain, reelStyle = 'Minimal', cameraFacing = 'environment', reelPlayback, exportJob, reelControlsTimer, randomSoundTimer, reviewVideoUrl, reviewMicAudio, reviewMicUrl, recordButtonLockedUntil = 0, recordingStopping = false, recordingSession = 0;
let sessionClips = [];
const soundBufferCache = new Map();
let soundSettings = { randomSoundPlay:false, randomSounds:false, fxVolume:'medium', micVolume:'on', ...JSON.parse(localStorage.getItem('itm-sound-settings') || '{}') };
const $ = selector => document.querySelector(selector);
const isMobileSafari = /iP(ad|hone|od)/.test(navigator.userAgent) && /WebKit/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
const isSafari = /WebKit/.test(navigator.userAgent) && !/CriOS|FxiOS|Chrome|Chromium|Edg|OPR|Android/.test(navigator.userAgent);
const isAndroid = /Android/i.test(navigator.userAgent);
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
async function deleteAllRecordings() { if (!window.confirm('Delete every saved recording? This cannot be undone.')) return; stopReelPlayback(); clearReviewMicAudio(); sessionClips = []; cachedReelClips = []; completed = []; lastBlob = null; if (reviewVideoUrl) URL.revokeObjectURL(reviewVideoUrl); reelUrls.forEach(URL.revokeObjectURL); reelUrls = []; try { const database = await clipDatabase; await new Promise((resolve, reject) => { const request = database.transaction('clips', 'readwrite').objectStore('clips').clear(); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }); database.close(); } catch (_) { /* Session-only clips were already cleared. */ } window.location.hash = 'home'; window.location.reload(); }
function show(id) { document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active')); $(id).classList.add('active'); window.scrollTo(0, 0); }
function setActiveNav(href) { document.querySelectorAll('.bottom-nav a').forEach(link => link.classList.toggle('nav-active', link.getAttribute('href') === href)); }
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
function connectMicrophoneToRecordingDestination() {
  if (!microphoneSource && recordingAudioContext && recordingAudioDestination && stream?.getAudioTracks().length) {
    microphoneSource = recordingAudioContext.createMediaStreamSource(stream);
    microphoneSource.connect(recordingAudioDestination);
  }
}
function prepareRecordingAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  recordingAudioContext = new AudioContext(); recordingAudioContext.resume();
  recordingAudioDestination = recordingAudioContext.createMediaStreamDestination();
  // Keep the camera recorder on one clock: camera video plus embedded SFX.  The
  // microphone is captured separately below.  Routing Safari's microphone
  // through this Web Audio destination made its video timestamps race ahead.
  lastAudioLayout = 'separate';
  return new MediaStream([...stream.getVideoTracks(), ...recordingAudioDestination.stream.getAudioTracks()]);
}
function startMicCapture(session = recordingSession) {
  lastMicBlob = null; micChunks = []; micStopPromise = Promise.resolve(); micRecorder = null; finishMicCapture = () => {};
  micCaptureTrack?.stop(); micCaptureTrack = null;
  if (!stream?.getAudioTracks().length) return;
  let activeMicRecorder, resolveMicStop, forceSettleTimer;
  try {
    const captureTrack = micCaptureTrack = stream.getAudioTracks()[0].clone();
    const micStream = new MediaStream([captureTrack]);
    const supportedMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    activeMicRecorder = micRecorder = supportedMime ? new MediaRecorder(micStream, { mimeType:supportedMime }) : new MediaRecorder(micStream);
    const recordingMicChunks = []; micChunks = recordingMicChunks;
    let settled = false;
    const saveCapturedAudio = () => {
      if (session === recordingSession && !lastMicBlob) lastMicBlob = recordingMicChunks.length ? new Blob(recordingMicChunks, { type:activeMicRecorder.mimeType || 'audio/webm' }) : null;
    };
    const settle = saveAudio => {
      if (settled) return;
      settled = true;
      clearTimeout(forceSettleTimer);
      if (saveAudio) saveCapturedAudio();
      captureTrack.stop();
      if (micCaptureTrack === captureTrack) micCaptureTrack = null;
      if (micRecorder === activeMicRecorder) micRecorder = null;
      if (finishMicCapture === finish) finishMicCapture = () => {};
      resolveMicStop?.();
    };
    micStopPromise = new Promise(resolve => { resolveMicStop = resolve; });
    activeMicRecorder.ondataavailable = event => { if (event.data.size) recordingMicChunks.push(event.data); };
    activeMicRecorder.onstop = () => {
      saveCapturedAudio();
      settle();
    };
    activeMicRecorder.onerror = () => { if (session === recordingSession) lastMicBlob = null; settle(); };
    const finish = () => {
      if (activeMicRecorder.state === 'inactive') return settle(true);
      // Mobile recorders are most reliable when they create one final chunk on
      // stop.  Do not force a periodic/requestData flush on Safari or Android.
      if (!isSafari && !isAndroid) { try { activeMicRecorder.requestData(); } catch (_) { /* The final stop event still flushes audio. */ } }
      try { activeMicRecorder.stop(); } catch (_) { settle(true); return; }
      forceSettleTimer = setTimeout(() => settle(true), 1800);
    };
    finishMicCapture = finish;
    // A single final chunk prevents Android and Safari timestamp drift caused by
    // periodic MediaRecorder slices. Keep the established desktop chunking path.
    (isSafari || isAndroid) ? activeMicRecorder.start() : activeMicRecorder.start(1000);
  } catch (_) {
    try { if (activeMicRecorder?.state === 'recording') activeMicRecorder.stop(); } catch (_) { /* The companion recorder never started. */ }
    micCaptureTrack?.stop(); micCaptureTrack = null; micRecorder = null;
    // If this browser cannot make a companion recorder, retain microphone audio
    // in the primary clip rather than dropping it.  This is the only mixed path.
    lastAudioLayout = 'mixed'; connectMicrophoneToRecordingDestination();
    resolveMicStop?.();
  }
}
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
  clearReviewMicAudio(); $('#reviewVideo').pause(); show('#record'); $('#recordingTitle').textContent = challenges[current].title.toUpperCase(); $('#recordingGuidance').textContent = challenges[current].prompt; $('#timer').textContent = '00:00'; $('#soundTrigger').disabled = true; $('#soundTrigger span:last-child').textContent = 'Start recording to unlock sound'; await connectCamera();
}
async function flipCamera() { if (startTime) return toast('Finish this clip before flipping the camera.'); cameraFacing = cameraFacing === 'environment' ? 'user' : 'environment'; stream?.getTracks().forEach(track => track.stop()); stream = null; await connectCamera(); }
function startRecording() {
  if (startTime || recordingStopping) return;
  if (!stream) return toast('Please allow camera access before recording.');
  const session = ++recordingSession;
  const recordingChunks = [];
  recordingStopping = false; lastBlob = null; lastMicBlob = null; lastDuration = 0; startTime = Date.now(); recordButtonLockedUntil = startTime + 250; $('#recordButton').classList.add('is-recording'); $('#recordLabel').textContent = 'RECORDING — TAP TO FINISH'; $('#soundTrigger').disabled = soundSettings.randomSoundPlay; $('#soundTrigger span:last-child').textContent = soundSettings.randomSoundPlay ? 'Sound incoming…' : 'Play the sound';
  timerId = setInterval(() => $('#timer').textContent = formatted(Math.floor((Date.now() - startTime) / 1000)), 250);
  try {
    const recordingStream = prepareRecordingAudio();
    startMicCapture(session);
    const activeRecorder = recorder = new MediaRecorder(recordingStream);
    activeRecorder.ondataavailable = event => {
      if (session === recordingSession && event.data.size) recordingChunks.push(event.data);
    };
    activeRecorder.onerror = () => {
      if (session !== recordingSession) return;
      recordingSession += 1; recorder = null; recordingStopping = false; clearInterval(timerId); clearTimeout(randomSoundTimer); finishMicCapture(); startTime = null; lastBlob = lastMicBlob = null;
      $('#recordButton').classList.remove('is-recording'); $('#recordLabel').textContent = 'TAP TO RECORD'; $('#soundTrigger').disabled = true;
      toast('This recording could not be saved. Please try again.');
    };
    activeRecorder.onstop = async () => {
      if (recorder === activeRecorder) recorder = null;
      if (session !== recordingSession) return;
      lastBlob = new Blob(recordingChunks, { type: activeRecorder.mimeType || 'video/webm' });
      await micStopPromise;
      if (session !== recordingSession) return;
      recordingStopping = false;
      displayReview();
    };
    // Safari and Android both produce one well-timed final chunk.  Timeslices on
    // those engines can yield discontinuous timestamps and accelerated playback.
    (isSafari || isAndroid) ? activeRecorder.start() : activeRecorder.start(1000);
    if (soundSettings.randomSoundPlay) randomSoundTimer = setTimeout(() => { if (startTime) playSound(true); }, (3 + Math.random() * 4) * 1000);
  } catch (error) {
    recordingSession += 1; clearInterval(timerId); clearTimeout(randomSoundTimer); finishMicCapture(); recorder = null; recordingStopping = false; startTime = null; lastBlob = lastMicBlob = null;
    $('#recordButton').classList.remove('is-recording'); $('#recordLabel').textContent = 'TAP TO RECORD'; $('#soundTrigger').disabled = true;
    toast('This browser cannot save camera recordings.');
  }
}
function stopRecording() {
  if (!startTime || recordingStopping || Date.now() < recordButtonLockedUntil) return;
  recordingStopping = true; recordButtonLockedUntil = Date.now() + 250; clearInterval(timerId); clearTimeout(randomSoundTimer);
  lastDuration = Math.max(1, Math.floor((Date.now() - startTime) / 1000)); $('#clipDuration').textContent = formatted(lastDuration);
  finishMicCapture();
  const activeRecorder = recorder;
  if (activeRecorder?.state === 'recording') {
    try { activeRecorder.stop(); return; } catch (_) { /* Fall through to a recoverable review state. */ }
  }
  if (!activeRecorder) { recordingStopping = false; displayReview(); }
}
function clearReviewMicAudio() {
  const video = $('#reviewVideo');
  video.onplay = video.onpause = video.onseeking = video.onseeked = video.ontimeupdate = video.onratechange = video.onended = null;
  reviewMicAudio?.pause();
  if (reviewMicAudio) { reviewMicAudio.removeAttribute('src'); reviewMicAudio.load(); }
  if (reviewMicUrl) URL.revokeObjectURL(reviewMicUrl);
  reviewMicAudio = null; reviewMicUrl = null;
}
function refreshReviewMicAudio() {
  const video = $('#reviewVideo');
  clearReviewMicAudio();
  if (!lastMicBlob?.size || soundSettings.micVolume !== 'on' || !reviewVideoUrl) return;
  reviewMicUrl = URL.createObjectURL(lastMicBlob);
  const micAudio = reviewMicAudio = new Audio(reviewMicUrl); micAudio.preload = 'auto';
  const sync = shouldPlay => {
    if (!reviewMicAudio || soundSettings.micVolume !== 'on') return;
    try {
      if (Math.abs((micAudio.currentTime || 0) - (video.currentTime || 0)) > .08) micAudio.currentTime = video.currentTime || 0;
      micAudio.playbackRate = video.playbackRate || 1;
    } catch (_) { /* Wait until the audio metadata is ready. */ }
    if (shouldPlay && !video.paused) micAudio.play().catch(() => {});
  };
  video.onplay = () => sync(true);
  video.onpause = () => micAudio.pause();
  video.onseeking = () => micAudio.pause();
  video.onseeked = () => sync(!video.paused);
  video.ontimeupdate = () => sync(false);
  video.onratechange = () => sync(!video.paused);
  video.onended = () => micAudio.pause();
  sync(!video.paused);
}
function displayReview() {
  clearTimeout(randomSoundTimer); stream?.getTracks().forEach(track => track.stop()); stream = null; recordingAudioContext?.close(); recordingAudioContext = recordingAudioDestination = microphoneSource = micGain = null;
  const video = $('#reviewVideo'); clearReviewMicAudio(); video.pause(); if (reviewVideoUrl) URL.revokeObjectURL(reviewVideoUrl); reviewVideoUrl = null; video.removeAttribute('src'); video.load(); video.style.display = 'none'; $('#reviewPlaceholder').style.display = 'grid';
  if (lastBlob?.size) {
    reviewVideoUrl = URL.createObjectURL(lastBlob);
    const durationAtStop = lastDuration;
    video.playbackRate = video.defaultPlaybackRate = 1;
    video.onloadedmetadata = () => {
      const metadataDuration = Number.isFinite(video.duration) ? Math.max(1, Math.round(video.duration)) : 0;
      // Safari can occasionally report a container duration that is much longer
      // than the stopped capture.  Keep the known wall-clock duration unless the
      // decoded metadata agrees closely enough to be trustworthy.
      const metadataIsSane = metadataDuration && Math.abs(metadataDuration - durationAtStop) <= Math.max(2, durationAtStop * .35);
      if (metadataIsSane) lastDuration = metadataDuration;
      $('#clipDuration').textContent = formatted(lastDuration);
      try { video.currentTime = 0; video.playbackRate = video.defaultPlaybackRate = 1; } catch (_) { /* The first decoded frame is still the start of the clip. */ }
    };
    video.src = reviewVideoUrl; video.load(); video.style.display = 'block'; $('#reviewPlaceholder').style.display = 'none'; refreshReviewMicAudio();
  }
  show('#review'); $('#recordButton').classList.remove('is-recording'); $('#recordLabel').textContent = 'TAP TO RECORD'; $('#soundTrigger').disabled = true; startTime = null;
}
async function saveMoment() { if (!lastBlob?.size) return toast('No video was captured. Try recording again.'); const button = $('#saveMoment'), originalLabel = button.innerHTML; button.disabled = true; button.textContent = 'Adding to your reel…'; try { await micStopPromise; await saveClip({ challenge: current, day: today, blob: lastBlob, micBlob: lastMicBlob, audioLayout:lastAudioLayout, duration: lastDuration, capturedAt: new Date().toISOString() }); cachedReelClips = []; reelUrls.forEach(URL.revokeObjectURL); reelUrls = []; await refreshCompleted(); await renderReel(); clearReviewMicAudio(); $('#reviewVideo').pause(); toast('Video saved to your reel'); show('#home'); } catch (error) { toast('Could not save this clip. Please try again.'); } finally { button.disabled = false; button.innerHTML = originalLabel; } }

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
  if (reelPlayback) stopReelPlayback();
  const player = $('#reelPlayer'), video = $('#reelVideo'), waitingVideo = $('#reelVideoNext'), caption = $('#reelPlayerCaption'), token = Symbol('reel-preview');
  let index = startIndex, currentUrl = null, micAudio = null, micUrl = null, activeClip = null, sourceVersion = 0, cleaned = false;
  const ownsPlayback = () => reelPlayback?.token === token;
  const clearVideo = target => {
    target.pause(); target.onloadeddata = null; target.oncanplay = null; target.onseeked = null; target.onended = null; target.onerror = null;
    target.removeAttribute('src'); target.load();
  };
  const stopMic = () => {
    micAudio?.pause();
    if (micUrl) URL.revokeObjectURL(micUrl);
    micAudio = null; micUrl = null;
    if (ownsPlayback()) reelPlayback.micAudio = null;
  };
  const startMic = () => {
    if (micAudio || soundSettings.micVolume !== 'on' || !activeClip?.micBlob) return;
    micUrl = URL.createObjectURL(activeClip.micBlob); micAudio = new Audio(micUrl); micAudio.preload = 'auto';
    if (ownsPlayback()) reelPlayback.micAudio = micAudio;
  };
  const syncMic = (shouldPlay = false) => {
    if (soundSettings.micVolume !== 'on') { micAudio?.pause(); return; }
    startMic();
    if (!micAudio) return;
    try { micAudio.currentTime = video.currentTime || 0; micAudio.playbackRate = video.playbackRate || 1; } catch (_) { /* The audio metadata may still be loading. */ }
    if (shouldPlay && soundSettings.micVolume === 'on') micAudio.play().catch(() => {});
  };
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true; sourceVersion += 1; stopMic(); clearVideo(video); clearVideo(waitingVideo);
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = null; activeClip = null;
  };
  clearVideo(waitingVideo); clearVideo(video); video.muted = false; video.defaultMuted = false; video.removeAttribute('muted'); video.volume = 1; video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
  player.hidden = false; player.className = `reel-player reel-style-${reelStyle.toLowerCase()}`; video.style.opacity = '1'; waitingVideo.style.opacity = '0';
  reelPlayback = {
    token, clips, index, activeVideo:video, waitingVideo, total:clips.reduce((total, clip) => total + (clip.duration || 1), 0), cleanup,
    pauseMic: () => micAudio?.pause(),
    resumeMic: () => syncMic(true),
    syncMic: () => syncMic(!video.paused)
  };
  $('#reelPlayerToggle').textContent = 'Ⅱ'; revealReelControls();
  const playIndex = () => {
    if (!ownsPlayback()) return;
    const clip = clips[index];
    if (!clip?.blob) return;
    activeClip = clip;
    const version = ++sourceVersion;
    caption.innerHTML = reelStyle === 'Off' ? '' : `<span class="caption-title">${reelStyle === 'Bold' ? challenges[clip.challenge].title.toUpperCase() : challenges[clip.challenge].title}</span><span class="caption-time">${formatTimestamp(clip.capturedAt)}</span>`;
    stopMic(); clearVideo(video); video.style.opacity = '0'; video.playbackRate = video.defaultPlaybackRate = 1;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = URL.createObjectURL(clip.blob);
    let started = false;
    const begin = () => {
      if (started || !ownsPlayback() || version !== sourceVersion) return;
      started = true; video.onloadeddata = null; video.oncanplay = null;
      try { video.currentTime = 0; video.playbackRate = video.defaultPlaybackRate = 1; } catch (_) { /* Start from the browser's first decoded frame. */ }
      video.style.opacity = '1';
      const videoPlayback = video.play(); syncMic(true);
      videoPlayback.catch(() => { if (ownsPlayback() && version === sourceVersion) { $('#reelPlayerToggle').textContent = '▶'; toast('Tap play to start the reel with sound.'); } });
    };
    video.onloadeddata = begin; video.oncanplay = begin;
    video.onseeked = () => { if (ownsPlayback() && version === sourceVersion) syncMic(!video.paused); };
    video.onended = () => {
      if (!ownsPlayback() || version !== sourceVersion) return;
      stopMic();
      if (index === clips.length - 1) {
        cleanup();
        if (ownsPlayback()) { player.hidden = true; reelPlayback = null; }
        return;
      }
      index += 1; reelPlayback.index = index; playIndex();
    };
    video.onerror = () => { if (ownsPlayback() && version === sourceVersion) { $('#reelPlayerToggle').textContent = '▶'; toast('This clip could not be played.'); } };
    video.src = currentUrl; video.load();
  };
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
function stopReelPlayback() { if (!reelPlayback) return; clearTimeout(reelControlsTimer); const playback = reelPlayback; playback.cleanup?.(); playback.activeVideo.pause(); playback.waitingVideo.pause(); playback.micAudio?.pause(); $('#reelPlayer').hidden = true; $('#reelPlayer').classList.remove('show-controls'); $('#reelPlayerToggle').textContent = '▶'; if (reelPlayback === playback) reelPlayback = null; }
function pauseReelPlayback() { if (!reelPlayback) return; reelPlayback.activeVideo.pause(); reelPlayback.waitingVideo.pause(); reelPlayback.pauseMic?.(); $('#reelPlayerToggle').textContent = '▶'; revealReelControls(); }
function toggleReelPlayback() { if (!reelPlayback) return playReel(); const activeVideo = reelPlayback.activeVideo, paused = activeVideo.paused, resume = video => isMobileSafari ? video.play() : startPreviewVideo(video); if (paused) { const resumeActive = resume(activeVideo); reelPlayback.resumeMic?.(); resumeActive.catch(() => toast('Tap play to resume with sound.')); if (reelPlayback.waitingVideo.src && reelPlayback.waitingVideo.style.opacity === '1') resume(reelPlayback.waitingVideo); } else { activeVideo.pause(); reelPlayback.waitingVideo.pause(); reelPlayback.pauseMic?.(); } $('#reelPlayerToggle').textContent = paused ? 'Ⅱ' : '▶'; revealReelControls(); }

$('#startMoment').onclick = prepareCamera; $('#backButton').onclick = () => show('#home');
$('#cancelRecord').onclick = () => { recordingSession += 1; recordingStopping = false; clearInterval(timerId); clearTimeout(randomSoundTimer); finishMicCapture(); if (recorder?.state === 'recording') recorder.stop(); recorder = null; stream?.getTracks().forEach(track => track.stop()); stream = null; recordingAudioContext?.close(); recordingAudioContext = recordingAudioDestination = microphoneSource = micGain = null; startTime = null; show('#challenge'); };
const toggleRecordButton = () => { if (Date.now() < recordButtonLockedUntil) return; startTime ? stopRecording() : startRecording(); };
const recordButton = $('#recordButton');
let suppressNextRecordButtonClick = false;
const activateRecordButton = event => {
  if (event.type === 'click') {
    // A touch/mouse press has already activated on pointerdown. Ignore only its
    // synthetic click; keyboard clicks (detail === 0) remain accessible.
    if (event.detail && suppressNextRecordButtonClick) { suppressNextRecordButtonClick = false; return; }
  } else {
    if (event.button !== undefined && event.button !== 0) return;
    suppressNextRecordButtonClick = true;
  }
  if (event.cancelable) event.preventDefault();
  toggleRecordButton();
};
if (window.PointerEvent) recordButton.addEventListener('pointerdown', activateRecordButton, { passive:false });
else recordButton.addEventListener('touchstart', activateRecordButton, { passive:false });
recordButton.addEventListener('click', activateRecordButton);
$('#soundTrigger').onclick = playSound; $('#saveMoment').onclick = saveMoment; $('#redoMoment').onclick = prepareCamera;
$('#flipCamera').onclick = flipCamera;
$('#compilationButton').onclick = async () => { await renderReel(); show('#reel'); setActiveNav('#reel'); }; $('#reelPlay').onclick = () => playReel();
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
  const usesMobileExportProfile = isMobileSafari || isAndroid;
  const ExportAudioContext = window.AudioContext || window.webkitAudioContext;
  const exportAudioContext = new ExportAudioContext();
  const resumeExportAudio = exportAudioContext.resume().catch(() => {});
  const clips = (cachedReelClips.length ? [...cachedReelClips] : await getClips()).sort((a, b) => a.challenge - b.challenge); if (!clips.length) { await exportAudioContext.close(); return toast('Record a moment first.'); }
  closeExportSheet(); exportJob = { cancelled:false, audioContext:exportAudioContext }; setExporting(true); setExportProgress(0); show('#export');
  const canvas = document.createElement('canvas'); canvas.width = usesMobileExportProfile ? 540 : 720; canvas.height = usesMobileExportProfile ? 960 : 1280; const context = canvas.getContext('2d');
  const audioDestination = exportAudioContext.createMediaStreamDestination();
  await document.fonts?.load('52px "Archivo Black"');
  await resumeExportAudio;
  const candidates = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
  const output = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
  const parts = []; let exportRecorder;
  try { exportRecorder = mimeType ? new MediaRecorder(output, { mimeType }) : new MediaRecorder(output); exportJob.recorder = exportRecorder; } catch (error) { $('#exportStatus').textContent = 'Export is not supported in this browser.'; exportJob = null; setExporting(false); show('#reel'); return toast('This browser cannot create a video export.'); }
  const finished = new Promise(resolve => { exportRecorder.onstop = () => resolve(new Blob(parts, { type: exportRecorder.mimeType })); });
  exportRecorder.ondataavailable = event => { if (event.data.size) parts.push(event.data); }; usesMobileExportProfile ? exportRecorder.start() : exportRecorder.start(1000);
  const finishRecorder = async () => {
    if (exportRecorder.state === 'recording') {
      if (!usesMobileExportProfile) { try { exportRecorder.requestData(); } catch (_) { /* Some recorders only flush on stop. */ } await new Promise(resolve => setTimeout(resolve, 150)); }
      exportRecorder.stop();
    }
    return Promise.race([finished, new Promise(resolve => setTimeout(() => resolve(new Blob(parts, { type: exportRecorder.mimeType })), 3500))]);
  };
  const startExportVideo = async media => {
    const wasMuted = media.muted, wasDefaultMuted = media.defaultMuted, hadMutedAttribute = media.hasAttribute('muted');
    media.muted = true; media.defaultMuted = true; media.setAttribute('muted', '');
    try {
      const started = await Promise.race([Promise.resolve(media.play()).then(() => true, () => false), new Promise(resolve => setTimeout(() => resolve(false), 1200))]);
      media.muted = wasMuted; media.defaultMuted = wasDefaultMuted; if (!hadMutedAttribute) media.removeAttribute('muted');
      return started || !media.paused;
    } catch (_) {
      media.muted = wasMuted; media.defaultMuted = wasDefaultMuted; if (!hadMutedAttribute) media.removeAttribute('muted');
      return false;
    }
  };
  const useStagedExport = usesMobileExportProfile;
  let stagedExport;
  const waitForExportVideo = video => new Promise((resolve, reject) => { let settled = false; const finish = () => { if (!settled) { settled = true; resolve(); } }; video.onloadeddata = finish; video.oncanplay = finish; video.onerror = () => { if (!settled) { settled = true; reject(new Error('Could not load this clip.')); } }; if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish(); setTimeout(finish, 5000); });
  const prepareExportItem = async clip => {
    const url = URL.createObjectURL(clip.blob); let video, source, gain, mic, micUrl, micSource, micGain;
    if (useStagedExport) {
      if (!stagedExport) { video = document.createElement('video'); video.className = 'export-video-stage'; video.playsInline = true; video.preload = 'auto'; video.muted = false; video.volume = 1; document.body.append(video); source = exportAudioContext.createMediaElementSource(video); gain = exportAudioContext.createGain(); source.connect(gain).connect(audioDestination); stagedExport = { video, source, gain }; }
      ({ video, source, gain } = stagedExport); video.pause(); video.removeAttribute('src'); video.load(); video.src = url; video.load();
    } else { video = document.createElement('video'); video.src = url; video.playsInline = true; video.muted = false; video.volume = 1; video.preload = 'auto'; source = exportAudioContext.createMediaElementSource(video); gain = exportAudioContext.createGain(); source.connect(gain).connect(audioDestination); }
    if (soundSettings.micVolume === 'on' && clip.micBlob) { micUrl = URL.createObjectURL(clip.micBlob); mic = new Audio(micUrl); mic.preload = 'auto'; micSource = exportAudioContext.createMediaElementSource(mic); micGain = exportAudioContext.createGain(); micSource.connect(micGain).connect(audioDestination); }
    await waitForExportVideo(video); return { clip, video, url, gain, mic, micUrl, micSource, micGain, sharedStage:useStagedExport };
  };
  const items = useStagedExport ? [] : await Promise.all(clips.map(prepareExportItem));
  const transitionDuration = useStagedExport ? 0 : .35, mobileFadeDuration = 350; let mobileTransitionFrame = null;
  setExportProgress(5);
  for (let index = 0; index < clips.length && !exportJob.cancelled; index += 1) {
    const item = useStagedExport ? await prepareExportItem(clips[index]) : items[index], next = useStagedExport ? undefined : items[index + 1]; if (useStagedExport) items.push(item); let nextStarted = false, frame, mobileFadeStartedAt = 0, playbackStartedAt = performance.now();
    item.gain.gain.value = 1; item.video.playbackRate = item.video.defaultPlaybackRate = 1; if (item.micGain) item.micGain.gain.value = 1; try { item.video.currentTime = 0; } catch (_) { /* A fresh source already begins at zero. */ } const videoStarted = await startExportVideo(item.video); if (item.mic) { try { item.mic.currentTime = 0; } catch (_) { /* A fresh source already begins at zero. */ } await startExportVideo(item.mic); } if (!videoStarted) $('#exportProgressText').textContent = 'Recovering this clip…';
    mobileFadeStartedAt = performance.now();
    await new Promise(resolve => { const render = () => {
      const remaining = Math.max(0, item.video.duration - item.video.currentTime), progress = nextStarted ? Math.min(1, 1 - remaining / transitionDuration) : 0;
      const expectedPlaybackMs = videoStarted ? Math.max(3000, (Number.isFinite(item.video.duration) ? item.video.duration * 1000 : 0) + 2000) : 1000, elapsedProgress = Math.min(1, (performance.now() - playbackStartedAt) / expectedPlaybackMs), clipProgress = Math.max(item.video.currentTime / Math.max(item.video.duration, 1), elapsedProgress);
      setExportProgress(5 + ((index + clipProgress) / clips.length) * 90);
      if (next && transitionDuration && !nextStarted && remaining <= transitionDuration) { nextStarted = true; next.gain.gain.value = 0; if (next.micGain) next.micGain.gain.value = 0; void startExportVideo(next.video); if (next.mic) void startExportVideo(next.mic); }
      if (nextStarted) { item.gain.gain.value = 1 - progress; next.gain.gain.value = progress; if (item.micGain) item.micGain.gain.value = 1 - progress; if (next.micGain) next.micGain.gain.value = progress; }
      const mobileFadeProgress = useStagedExport && mobileTransitionFrame ? Math.min(1, (performance.now() - mobileFadeStartedAt) / mobileFadeDuration) : 1;
      if (useStagedExport && mobileTransitionFrame && mobileFadeProgress < 1) { context.drawImage(mobileTransitionFrame, 0, 0); drawExportFrame(context, canvas, item.video, item.clip, mobileFadeProgress, false); } else { mobileTransitionFrame = null; drawExportFrame(context, canvas, item.video, item.clip, nextStarted ? 1 - progress : 1, true); }
      if (nextStarted) drawExportFrame(context, canvas, next.video, next.clip, progress, false);
      const clipFinished = item.video.ended || (Number.isFinite(item.video.duration) && item.video.currentTime >= item.video.duration - .04) || (useStagedExport && performance.now() - playbackStartedAt >= expectedPlaybackMs);
      if (exportJob.cancelled || clipFinished) { cancelAnimationFrame(frame); resolve(); } else frame = requestAnimationFrame(render);
    }; render(); });
    if (useStagedExport) { if (index < clips.length - 1) { mobileTransitionFrame = document.createElement('canvas'); mobileTransitionFrame.width = canvas.width; mobileTransitionFrame.height = canvas.height; mobileTransitionFrame.getContext('2d').drawImage(canvas, 0, 0); } item.mic?.pause(); item.micSource?.disconnect(); item.micGain?.disconnect(); if (item.micUrl) URL.revokeObjectURL(item.micUrl); URL.revokeObjectURL(item.url); items.pop(); }
  }
  items.forEach(item => { item.gain.disconnect(); item.video.remove(); item.mic?.pause(); item.micSource?.disconnect(); item.micGain?.disconnect(); if (item.micUrl) URL.revokeObjectURL(item.micUrl); URL.revokeObjectURL(item.url); });
  if (stagedExport) { stagedExport.gain.disconnect(); stagedExport.video.pause(); stagedExport.video.remove(); }
  if (exportJob.cancelled) { await finishRecorder(); await exportAudioContext.close(); exportJob = null; return; }
  setExportProgress(96); $('#exportStatus').textContent = 'Finishing your reel…';
  const reel = await finishRecorder(); await exportAudioContext.close();
  const extension = reel.type.includes('mp4') ? 'mp4' : 'webm', link = document.createElement('a'); link.href = URL.createObjectURL(reel); link.download = `in-the-moment-reel.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  setExportProgress(100); $('#exportStatus').textContent = extension === 'mp4' ? 'Your 9:16 MP4 reel is ready.' : 'Your 9:16 reel is ready (this browser exported WebM).'; exportJob = null; setExporting(false); show('#reel'); toast(extension === 'mp4' ? 'MP4 reel downloaded.' : 'Vertical reel downloaded.');
}
async function copyReelCaption() { await navigator.clipboard.writeText('Three sounds. Perfectly timed. #InTheMoment'); closeExportSheet(); toast('Reel caption copied.'); }
async function recoverFromExportError() {
  const job = exportJob;
  try { if (job?.recorder?.state === 'recording') job.recorder.stop(); } catch (_) { /* The recorder may already be finalizing. */ }
  document.querySelectorAll('.export-video-stage').forEach(video => { video.pause(); video.remove(); });
  try { await job?.audioContext?.close(); } catch (_) { /* The browser already released the export context. */ }
  if (exportJob === job) exportJob = null;
  setExporting(false); $('#exportStatus').textContent = 'Export could not finish.'; show('#reel'); toast('Could not export this reel. Please try again.');
}
$('#exportReel').onclick = () => { pauseReelPlayback(); $('#exportSheet').hidden = false; };
$('#closeExportSheet').onclick = closeExportSheet; $('#downloadClips').onclick = () => { void exportVerticalReel().catch(recoverFromExportError); }; $('#copyCaption').onclick = copyReelCaption;
document.querySelectorAll('.style-pill').forEach(button => button.onclick = async () => { reelStyle = button.dataset.style; document.querySelectorAll('.style-pill').forEach(item => item.classList.remove('active')); button.classList.add('active'); await renderReel(); toast(`${button.dataset.style} reel style selected`); });
$('#settingsButton').onclick = () => { renderSoundSettings(); $('#settingsSheet').hidden = false; };
$('#closeSettings').onclick = () => { $('#settingsSheet').hidden = true; };
$('#randomSoundPlay').onclick = () => { soundSettings.randomSoundPlay = !soundSettings.randomSoundPlay; persistSoundSettings(); };
$('#randomSounds').onclick = () => { soundSettings.randomSounds = !soundSettings.randomSounds; persistSoundSettings(); };
document.querySelectorAll('#fxVolume button').forEach(button => button.onclick = () => { soundSettings.fxVolume = button.dataset.value; persistSoundSettings(); });
$('#micOnExport').onclick = () => { soundSettings.micVolume = soundSettings.micVolume === 'on' ? 'off' : 'on'; persistSoundSettings(); if ($('#review').classList.contains('active')) refreshReviewMicAudio(); reelPlayback?.syncMic?.(); };
$('#deleteRecordings').onclick = deleteAllRecordings;
renderSoundSettings();
document.querySelectorAll('.bottom-nav a').forEach(link => link.onclick = async event => { event.preventDefault(); if (link.getAttribute('href') === '#reel') { if (completed.length !== challenges.length) return toast('Capture all three moments to unlock your reel.'); await renderReel(); show('#reel'); } else if (link.getAttribute('href') === '#home') show('#home'); else toast('Settings coming soon'); document.querySelectorAll('.bottom-nav a').forEach(item => item.classList.remove('nav-active')); link.classList.add('nav-active'); });
$('.brand').onclick = event => { event.preventDefault(); stopReelPlayback(); show('#home'); setActiveNav('#home'); };
refreshCompleted();
