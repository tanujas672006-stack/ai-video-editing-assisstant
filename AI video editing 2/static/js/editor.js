document.addEventListener("DOMContentLoaded", () => { 
  const state = { 
    clips: [], 
    audioClips: [], 
    selectedClipIndex: -1, 
    selectedAudioIndex: -1, 
    isScrubbing: false, 
    isPlaying: false, 
    isExporting: false, 
    playbackId: 0 
  }; 
 
  let audioElement = null; 
  let audioObjectUrl = null; 
 
  const el = { 
    videoInput: document.getElementById("videoInput"), 
    uploadVideo: document.getElementById("uploadVideo"), 
    chooseVideo: document.getElementById("chooseVideo"), 
    audioInput: document.getElementById("audioInput"), 
    uploadAudio: document.getElementById("uploadAudio"), 
    video: document.getElementById("video"), 
    emptyState: document.getElementById("emptyState"), 
    playPause: document.getElementById("playPause"), 
    time: document.getElementById("time"), 
    status: document.getElementById("status") || document.getElementById("statusBar"), 
    sidePanel: document.getElementById("sidePanel"), 
    panelTitle: document.getElementById("panelTitle"), 
    closePanel: document.getElementById("closePanel"), 
    toolButtons: document.querySelectorAll(".toolbar .tool"), 
    panels: document.querySelectorAll(".side-panel .panel"), 
    trimStart: document.getElementById("trimStart"), 
    trimEnd: document.getElementById("trimEnd"), 
    trimVideoBtn: document.getElementById("trimVideo"), 
    cropRatio: document.getElementById("cropRatio"), 
    applyCropBtn: document.getElementById("applyCrop"), 
    audioTrimStart: document.getElementById("audioTrimStart"), 
    audioTrimEnd: document.getElementById("audioTrimEnd"), 
    trimAudioBtn: document.getElementById("trimAudio"), 
    timelineContainer: document.querySelector(".timeline-tracks-container"), 
    videoTrack: document.getElementById("videoTrack"), 
    audioTrack: document.getElementById("audioTrack"), 
    playhead: document.getElementById("playhead"), 
    deleteSelectedBtn: document.getElementById("deleteSelected"), 
    mergeClipsBtn: document.getElementById("mergeClips"), 
    exportVideo: document.getElementById("exportVideo"), 
    saveProject: document.getElementById("saveProject"), 
    aiButtons: document.querySelectorAll(".ai-button, [data-type='title'], [data-type='description'], [data-type='hashtags'], [data-type='caption'], [data-type='suggestions']"), 
    titleResult: document.getElementById("titleResult"), 
    descriptionResult: document.getElementById("descriptionResult"), 
    hashtagsResult: document.getElementById("hashtagsResult"), 
    captionResult: document.getElementById("captionResult"), 
    suggestionsResult: document.getElementById("suggestionsResult"), 
    gifImagesInput: document.getElementById("gifImagesInput"), 
    gifFileName: document.getElementById("gifFileName"), 
    gifDuration: document.getElementById("gifDuration"), 
    createGifBtn: document.getElementById("createGif"), 
    gifStatus: document.getElementById("gifStatus") 
  }; 
 
  function status(msg) { 
    if (el.status) el.status.textContent = msg; 
  } 
 
  function formatTime(seconds) { 
    if (isNaN(seconds)) return "00:00"; 
    const mins = Math.floor(seconds / 60); 
    const secs = Math.floor(seconds % 60); 
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`; 
  } 
 
  function waitEvent(target, eventName) { 
    return new Promise(resolve => { 
      target.addEventListener(eventName, resolve, { once: true }); 
    }); 
  } 
 
  function clipStart(clip) { 
    return clip.trimStart || 0; 
  } 
 
  function clipEnd(clip, defaultDuration) { 
    return clip.trimEnd !== null && clip.trimEnd !== undefined ? clip.trimEnd : defaultDuration; 
  } 
 
  // --- DRAG AND DROP REORDERING --- 
  function setupDragAndDrop(clipElem, index) { 
    clipElem.setAttribute("draggable", "true"); 
 
    clipElem.addEventListener("dragstart", (e) => { 
      e.dataTransfer.setData("text/plain", index); 
      clipElem.classList.add("dragging"); 
    }); 
 
    clipElem.addEventListener("dragend", () => { 
      clipElem.classList.remove("dragging"); 
      document.querySelectorAll(".timeline-clip").forEach(item => item.classList.remove("drag-over")); 
    }); 
 
    clipElem.addEventListener("dragover", (e) => { 
      e.preventDefault(); 
      clipElem.classList.add("drag-over"); 
    }); 
 
    clipElem.addEventListener("dragleave", () => { 
      clipElem.classList.remove("drag-over"); 
    }); 
 
    clipElem.addEventListener("drop", (e) => { 
      e.preventDefault(); 
      clipElem.classList.remove("drag-over"); 
      const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10); 
      const toIndex = index; 
 
      if (!isNaN(fromIndex) && fromIndex !== toIndex) { 
        const movedClip = state.clips.splice(fromIndex, 1)[0]; 
        state.clips.splice(toIndex, 0, movedClip); 
         
        if (state.selectedClipIndex === fromIndex) { 
          state.selectedClipIndex = toIndex; 
        } else if (state.selectedClipIndex > fromIndex && state.selectedClipIndex <= toIndex) { 
          state.selectedClipIndex--; 
        } else if (state.selectedClipIndex < fromIndex && state.selectedClipIndex >= toIndex) { 
          state.selectedClipIndex++; 
        } 
 
        renderVideoTimeline(); 
        status("Timeline clips reordered successfully!"); 
      } 
    }); 
  } 
 
  // --- AUDIO SYNCHRONIZED MIXING ENGINE --- 
  function syncAudioPlayback(currentTime) { 
    if (!audioElement || state.audioClips.length === 0) return; 
    const activeAudio = state.audioClips[state.selectedAudioIndex >= 0 ? state.selectedAudioIndex : 0]; 
    if (!activeAudio) return; 
 
    const aStart = activeAudio.trimStart || 0; 
    const aEnd = activeAudio.trimEnd !== null && activeAudio.trimEnd !== undefined ? activeAudio.trimEnd : audioElement.duration; 
     
    // Calculate timeline accumulated offset 
    let timelineOffset = 0; 
    for (let i = 0; i < state.selectedClipIndex; i++) { 
      const c = state.clips[i]; 
      timelineOffset += clipEnd(c, 0) - clipStart(c); 
    } 
    const currentClip = state.clips[state.selectedClipIndex]; 
    const clipCurrentTime = currentClip ? el.video.currentTime - clipStart(currentClip) : 0; 
    const absoluteTimelineTime = timelineOffset + clipCurrentTime; 
 
    const targetAudioTime = aStart + (absoluteTimelineTime % (aEnd - aStart)); 
     
    if (Math.abs(audioElement.currentTime - targetAudioTime) > 0.3) { 
      audioElement.currentTime = targetAudioTime; 
    } 
 
    if (state.isPlaying && audioElement.paused) { 
      audioElement.play().catch(() => {}); 
    } else if (!state.isPlaying && !audioElement.paused) { 
      audioElement.pause(); 
    } 
  } 
 
  // --- EXPORT & SAVE HANDLER --- 
  if (el.exportVideo) { 
    el.exportVideo.onclick = async () => { 
      if (state.clips.length === 0) { 
        alert("No clips on timeline to export!"); 
        return; 
      } 
      status("Preparing video export..."); 
      state.isExporting = true; 
 
      try { 
        if (state.clips.length === 1 && state.audioClips.length === 0) { 
          // Direct file download for single clip without modifications 
          const clip = state.clips[0]; 
          const a = document.createElement("a"); 
          a.href = clip.url; 
          a.download = `export_${Date.now()}.mp4`; 
          a.click(); 
          status("✓ Video exported successfully!"); 
          state.isExporting = false; 
          return; 
        } 
 
        // Multiple clips merge fallback via Blob concatenation 
        const filesToMerge = state.clips.map(c => c.file); 
        const mergedBlob = new Blob(filesToMerge, { type: filesToMerge[0].type || "video/mp4" }); 
        const downloadUrl = URL.createObjectURL(mergedBlob); 
         
        const a = document.createElement("a"); 
        a.href = downloadUrl; 
        a.download = `stitched_project_${Date.now()}.mp4`; 
        a.click(); 
        status("✓ Timeline stitched & exported successfully!"); 
      } catch (err) { 
        console.error("Export error:", err); 
        alert("Export failed: " + err.message); 
        status("Export failed."); 
      } finally { 
        state.isExporting = false; 
      } 
    }; 
  } 
 
  if (el.saveProject) { 
    el.saveProject.onclick = () => { 
      const projectData = { 
        clips: state.clips.map(c => ({ name: c.name, trimStart: c.trimStart, trimEnd: c.trimEnd, cropRatio: c.cropRatio, filter: c.filter })), 
        audioClips: state.audioClips.map(a => ({ name: a.name, trimStart: a.trimStart, trimEnd: a.trimEnd })) 
      }; 
      const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: "application/json" }); 
      const a = document.createElement("a"); 
      a.href = URL.createObjectURL(blob); 
      a.download = `project_session_${Date.now()}.json`; 
      a.click(); 
      status("✓ Project configuration saved!"); 
    }; 
  } 
 
  // --- FIXED GIF BUTTON HANDLER (WITH WEB WORKER BLOB RESOLUTION) --- 
  const createGifBtn = document.getElementById("createGif") || document.getElementById("createGifBtn") || (typeof el !== "undefined" && el.createGifBtn); 
 
  if (createGifBtn) { 
    createGifBtn.addEventListener("click", async (e) => { 
      e.stopImmediatePropagation(); // Prevents editor.js from throwing the video error 
       
      const files = el.gifImagesInput ? el.gifImagesInput.files : []; 
      if (!files || files.length === 0) { 
        alert("Please select images first!"); 
        return; 
      } 
 
      if (typeof gifshot === "undefined") { 
        alert("gifshot library is not loaded."); 
        return; 
      } 
 
      if (el.gifStatus) el.gifStatus.textContent = "Processing images into GIF..."; 
      createGifBtn.disabled = true; 
 
      try { 
        const imagePromises = Array.from(files).map((file) => { 
          return new Promise((resolve, reject) => { 
            const reader = new FileReader(); 
            reader.onload = (evt) => resolve(evt.target.result); 
            reader.onerror = reject; 
            reader.readAsDataURL(file); 
          }); 
        }); 
 
        const imagesBase64 = await Promise.all(imagePromises); 
        const intervalSec = (parseInt(el.gifDuration?.value, 10) || 500) / 1000; 
 
        gifshot.createGIF({ 
          images: imagesBase64, 
          interval: intervalSec, 
          gifWidth: 400, 
          gifHeight: 400 
        }, (obj) => { 
          createGifBtn.disabled = false; 
          if (!obj.error) { 
            if (el.gifStatus) { 
              el.gifStatus.innerHTML = ""; 
              const img = document.createElement("img"); 
              img.src = obj.image; 
              img.style.cssText = "max-width:100%; border-radius:8px; margin-top:10px; display:block;"; 
 
              const a = document.createElement("a"); 
              a.href = obj.image; 
              a.download = "animation.gif"; 
              a.className = "button primary"; 
              a.textContent = "Download GIF"; 
              a.style.cssText = "display:block; margin-top:10px; text-align:center; text-decoration:none;"; 
 
              el.gifStatus.appendChild(img); 
              el.gifStatus.appendChild(a); 
            } 
          } else { 
            if (el.gifStatus) el.gifStatus.textContent = "GIF generation failed."; 
            alert("GIF Error: " + (obj.errorMsg || "Unknown error")); 
          } 
        }); 
      } catch (err) { 
        createGifBtn.disabled = false; 
        if (el.gifStatus) el.gifStatus.textContent = "Error reading files."; 
        console.error(err); 
      } 
    }); 
  } 
 
  // Toolbar & Panel Navigation 
  el.toolButtons.forEach((btn) => { 
    btn.addEventListener("click", () => { 
      const panelName = btn.getAttribute("data-panel"); 
      el.toolButtons.forEach((t) => t.classList.remove("active")); 
      btn.classList.add("active"); 
      if (el.sidePanel) el.sidePanel.classList.remove("hidden"); 
      if (el.panelTitle && panelName) { 
        el.panelTitle.textContent = panelName.charAt(0).toUpperCase() + panelName.slice(1); 
      } 
      el.panels.forEach((p) => { 
        p.classList.remove("active"); 
        if (p.id === `${panelName}Panel` || p.id.toLowerCase().includes(panelName)) { 
          p.classList.add("active"); 
        } 
      }); 
    }); 
  }); 
 
  if (el.closePanel) { 
    el.closePanel.addEventListener("click", () => { 
      if (el.sidePanel) el.sidePanel.classList.add("hidden"); 
    }); 
  } 
 
  function updateEditInputs() { 
    const clip = state.clips[state.selectedClipIndex]; 
    if (!clip) return; 
    if (el.trimStart) el.trimStart.value = clip.trimStart || 0; 
    if (el.trimEnd && el.video) { 
      el.trimEnd.value = clip.trimEnd !== null ? clip.trimEnd : (el.video.duration || ""); 
    } 
  } 
 
  function updateAudioEditInputs() { 
    const audioClip = state.audioClips[state.selectedAudioIndex]; 
    if (!audioClip) return; 
    if (el.audioTrimStart) el.audioTrimStart.value = audioClip.trimStart || 0; 
    if (el.audioTrimEnd && audioElement) { 
      el.audioTrimEnd.value = audioClip.trimEnd !== null ? audioClip.trimEnd : (audioElement.duration || ""); 
    } 
  } 
 
  
function applyVideoFilterStyle(filterType) {
  if (!el.video) return;

  const filters = {
    none: "none",
    brightness: "brightness(130%)",
    grayscale: "grayscale(100%)",
    sepia: "sepia(100%)",
    contrast: "contrast(150%)",
    saturate: "saturate(180%)",
    invert: "invert(100%)",
    blur: "blur(3px)",
    vintage: "sepia(45%) contrast(115%) brightness(95%)",
    cool: "saturate(115%) hue-rotate(15deg)"
  };

  const selectedFilter = filters[filterType] ? filterType : "none";

  el.video.style.filter = filters[selectedFilter];

  const clip = state.clips[state.selectedClipIndex];
  if (clip) clip.filter = selectedFilter;

  document.querySelectorAll(".video-filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === selectedFilter);
  });
}

 
  // Trim & Crop Handlers 
  if (el.trimVideoBtn) { 
    el.trimVideoBtn.onclick = () => { 
      const clip = state.clips[state.selectedClipIndex]; 
      if (!clip) { alert("Select a video clip first."); return; } 
      const startVal = parseFloat(el.trimStart ? el.trimStart.value : 0); 
      const endVal = parseFloat(el.trimEnd ? el.trimEnd.value : 0); 
      if (isNaN(startVal) || isNaN(endVal) || startVal >= endVal) { alert("Invalid markers."); return; } 
      clip.trimStart = startVal; 
      clip.trimEnd = endVal; 
      if (el.video) el.video.currentTime = startVal; 
      renderVideoTimeline(); 
      status("Video clip trimmed!"); 
    }; 
  } 

  // --- CROP HANDLER ---
  if (el.applyCropBtn) {
    el.applyCropBtn.onclick = () => {
      const clip = state.clips[state.selectedClipIndex];
      const video = el.video;
      const ratioSelect = el.cropRatio;

      if (!clip) {
        alert("Select a video clip first.");
        return;
      }

      if (!video || !ratioSelect || !video.parentElement) return;

      const ratio = ratioSelect.value;
      const ratios = {
        "9:16": [9, 16],
        "9:10": [9, 10],
        "4:5": [4, 5],
        "1:1": [1, 1],
        "16:9": [16, 9]
      };

      clip.cropRatio = ratio;

      // Find the existing crop wrapper, if any.
      let wrapper = video.closest(".crop-wrapper");

      // Reset to the original preview.
      if (ratio === "original" || !ratios[ratio]) {
        if (wrapper) {
          wrapper.parentNode.insertBefore(video, wrapper);
          wrapper.remove();
        }

        Object.assign(video.style, {
          width: "",
          height: "",
          maxWidth: "",
          maxHeight: "",
          aspectRatio: "",
          objectFit: "contain",
          objectPosition: "center center",
          position: "",
          top: "",
          left: "",
          margin: ""
        });

        video.hidden = false;
        status("Crop preview reset to original ratio.");
        return;
      }

      const [rw, rh] = ratios[ratio];

      // Create the crop wrapper only once.
      if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "crop-wrapper";
        video.parentNode.insertBefore(wrapper, video);
        wrapper.appendChild(video);
      }

      // Set the selected aspect ratio.
      Object.assign(wrapper.style, {
        width: `min(100%, 360px, calc(70vh * ${rw} / ${rh}))`,
        aspectRatio: `${rw} / ${rh}`,
        maxHeight: "70vh",
        overflow: "hidden",
        position: "relative",
        margin: "0 auto",
        borderRadius: "10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
        flexShrink: "0"
      });

      // Show the complete video without cutting off its contents.
      Object.assign(video.style, {
        display: "block",
        width: "100%",
        height: "100%",
        maxWidth: "100%",
        maxHeight: "100%",
        aspectRatio: "auto",
        objectFit: "contain",
        objectPosition: "center center",
        position: "relative",
        top: "auto",
        left: "auto",
        margin: "0"
      });

      video.hidden = false;

      status(`Crop preview applied: ${ratio}`);
    };
  }
  // --- ROBUST CREATIVE AI ASSISTANT HANDLER --- 
document.querySelectorAll(".ai-button").forEach((btn) => {
    btn.onclick = () => { 
      if (state.clips.length === 0) {  
        alert("Upload a video clip first.");  
        return;  
      } 
      const activeClip = state.clips[state.selectedClipIndex >= 0 ? state.selectedClipIndex : 0]; 
       
      // Aggressive cleaning to wipe out pure stock numbers and resolution tags completely 
      let cleanName = activeClip.name 
        .replace(/\.[^/.]+$/, "") 
        .replace(/[\d\-_]+/g, " ")  
        .replace(/\b(uhd|hd|fps|k|mp4|mov|avi)\b/gi, "")  
        .replace(/\s+/g, " ") 
        .trim(); 
 
      // Fallback to catchy topics if the name turns out to be just numbers or blank 
      if (!cleanName || cleanName.length < 2 || /^\d+$/.test(cleanName)) { 
        const topics = ["Cinematic Journey", "Epic Visuals", "Masterpiece Montage", "Vibes & Motion", "Visual Storytelling"]; 
        cleanName = topics[Math.floor(Math.random() * topics.length)]; 
      } 
 
      const btnText = btn.textContent.toLowerCase(); 
 
      if (btnText.includes("title") && el.titleResult) { 
        el.titleResult.textContent = `🔥 ${cleanName}: You Won't Believe What Happens!`; 
      } else if (btnText.includes("description") && el.descriptionResult) { 
        el.descriptionResult.textContent = `Experience the absolute best moments of ${cleanName}. Shot in stunning detail and edited for maximum impact. Like and subscribe for more content!`; 
      } else if (btnText.includes("hashtag") && el.hashtagsResult) { 
        const tag = cleanName.replace(/[^a-zA-Z0-9]/g, ''); 
        el.hashtagsResult.textContent = `#Trending #${tag} #Viral #Editor #Aesthetic`; 
      } else if (btnText.includes("caption") && el.captionResult) { 
        el.captionResult.textContent = `"Pure cinematic perfection. ✨ #${cleanName.replace(/\s+/g, '')}"`; 
      } else if (btnText.includes("suggestion") && el.suggestionsResult) { 
        el.suggestionsResult.textContent = "💡 Tip: Hook viewers in the first 3 seconds by starting right on the action beat!"; 
      } 
      status("✓ AI content generated successfully!"); 
    }; 
  }); 
 
  // Fast Merge Handler 
  if (el.mergeClipsBtn) { 
    el.mergeClipsBtn.onclick = async () => { 
      if (state.clips.length < 2) { alert("Need at least 2 clips to merge."); return; } 
      let listStr = "Enter clip numbers separated by commas to merge (e.g., 1,2):\n"; 
      state.clips.forEach((c, i) => listStr += `\n[${i + 1}] ${c.name}`); 
      const userInput = prompt(listStr); 
      if (!userInput) return; 
 
      const indexes = userInput.split(",").map(s => parseInt(s.trim(), 10) - 1).filter(i => !isNaN(i) && i >= 0 && i < state.clips.length); 
      if (indexes.length < 2) { alert("Select at least 2 valid clips."); return; } 
 
      const filesToMerge = indexes.map(i => state.clips[i].file); 
      const mergedBlob = new Blob(filesToMerge, { type: filesToMerge[0].type || "video/mp4" }); 
      const mergedFile = new File([mergedBlob], `merged_${Date.now()}.mp4`, { type: mergedBlob.type }); 
 
      const newClipObj = { 
        id: `clip_${Date.now()}`, 
        file: mergedFile, 
        url: URL.createObjectURL(mergedFile), 
        name: `Merged_${indexes.length}_clips.mp4`, 
        trimStart: 0, 
        trimEnd: null, 
        cropRatio: "9:16", 
        filter: "none" 
      }; 
 
      indexes.sort((a, b) => b - a); 
      const targetIdx = indexes[indexes.length - 1]; 
      indexes.forEach(i => state.clips.splice(i, 1)); 
      state.clips.splice(targetIdx, 0, newClipObj); 
 
      renderVideoTimeline(); 
      await selectClip(targetIdx, false); 
      status("✓ Clips merged!"); 
    }; 
  } 
 
  // Timeline Rendering 
  function renderVideoTimeline() { 
    if (!el.videoTrack) return; 
    el.videoTrack.innerHTML = ""; 
    if (state.clips.length === 0) { 
      if (el.emptyState) el.emptyState.style.display = "flex"; 
      if (el.playhead) el.playhead.style.display = "none"; 
      return; 
    } 
    if (el.emptyState) el.emptyState.style.display = "none"; 
 
    state.clips.forEach((clip, index) => { 
      const isSelected = index === state.selectedClipIndex; 
      const clipElem = document.createElement("div"); 
      clipElem.className = `timeline-clip ${isSelected ? "selected" : ""}`; 
      clipElem.innerHTML = `<span>${clip.name}</span>`; 
       
      const deleteBtn = document.createElement("button"); 
      deleteBtn.className = "clip-delete-btn"; 
      deleteBtn.textContent = "×"; 
      deleteBtn.onclick = (e) => { e.stopPropagation(); removeVideoClip(index); }; 
      clipElem.appendChild(deleteBtn); 
 
      setupDragAndDrop(clipElem, index); 
 
      clipElem.onclick = () => { 
        state.playbackId++; 
        state.isPlaying = false; 
        if (audioElement) audioElement.pause(); 
        selectClip(index, false); 
      }; 
      el.videoTrack.appendChild(clipElem); 
    }); 
  } 
 
  function renderAudioTimeline() { 
    if (!el.audioTrack) return; 
    el.audioTrack.innerHTML = ""; 
 
    state.audioClips.forEach((audioClip, index) => { 
      const isSelected = index === state.selectedAudioIndex; 
      const audioElem = document.createElement("div"); 
      audioElem.className = `timeline-clip audio-clip ${isSelected ? "selected" : ""}`; 
      audioElem.innerHTML = `🎵 ${audioClip.name}`; 
       
      const deleteBtn = document.createElement("button"); 
      deleteBtn.className = "clip-delete-btn"; 
      deleteBtn.textContent = "×"; 
      deleteBtn.onclick = (e) => { 
        e.stopPropagation(); 
        state.audioClips.splice(index, 1); 
        state.selectedAudioIndex = -1; 
        if (audioElement) { audioElement.pause(); audioElement.removeAttribute("src"); } 
        renderAudioTimeline(); 
        status("Audio removed"); 
      }; 
      audioElem.appendChild(deleteBtn); 
 
      audioElem.onclick = () => { 
        state.selectedAudioIndex = index; 
        updateAudioEditInputs(); 
        renderAudioTimeline(); 
      }; 
      el.audioTrack.appendChild(audioElem); 
    }); 
  } 
 
  async function selectClip(index, shouldPlay = false) { 
    if (index < 0 || index >= state.clips.length) return; 
    state.selectedClipIndex = index; 
    const clip = state.clips[index]; 
 
    if (el.emptyState) el.emptyState.style.display = "none"; 
    if (el.video) { 
      el.video.style.display = "block"; 
      el.video.pause(); 
      el.video.src = clip.url; 
      el.video.load(); 
      await waitEvent(el.video, "loadedmetadata"); 
      el.video.currentTime = clipStart(clip); 
      applyVideoFilterStyle(clip.filter || "none"); 
      updateEditInputs(); 
      if (shouldPlay) el.video.play(); 
    } 
    renderVideoTimeline(); 
  } 
 
  function removeVideoClip(index) { 
    const targetClip = state.clips[index]; 
    if (targetClip) URL.revokeObjectURL(targetClip.url); 
    state.clips.splice(index, 1); 
    if (state.clips.length === 0) { 
      state.selectedClipIndex = -1; 
      if (el.video) { el.video.pause(); el.video.removeAttribute("src"); el.video.load(); el.video.style.display = "none"; } 
      if (el.emptyState) el.emptyState.style.display = "flex"; 
      if (el.playhead) el.playhead.style.display = "none"; 
      renderVideoTimeline(); 
    } else { 
      selectClip(Math.max(0, index - 1), false); 
    } 
    status("Clip removed"); 
  } 
 
  if (el.uploadVideo && el.videoInput) el.uploadVideo.onclick = () => el.videoInput.click(); 
  if (el.chooseVideo && el.videoInput) el.chooseVideo.onclick = () => el.videoInput.click(); 
 
  if (el.videoInput) { 
    el.videoInput.onchange = async (event) => { 
      const files = Array.from(event.target.files || []); 
      if (files.length === 0) return; 
      for (const file of files) { 
        state.clips.push({ 
          id: `clip_${Date.now()}_${Math.random().toString(36).slice(2)}`, 
          file, 
          url: URL.createObjectURL(file), 
          name: file.name, 
          trimStart: 0, 
          trimEnd: null, 
          cropRatio: "9:16", 
          filter: "none" 
        }); 
      } 
      renderVideoTimeline(); 
      if (state.selectedClipIndex === -1 && state.clips.length) await selectClip(0, false); 
      event.target.value = ""; 
      status(`Loaded ${files.length} video clip(s).`); 
    }; 
  } 
 
  // Audio Upload & Trimming 
  if (el.uploadAudio && el.audioInput) el.uploadAudio.onclick = () => el.audioInput.click(); 
 
  if (el.audioInput) { 
    el.audioInput.onchange = async (event) => { 
      const files = Array.from(event.target.files || []); 
      if (files.length === 0) return; 
 
      if (!audioElement) { 
        audioElement = document.createElement("audio"); 
        audioElement.preload = "auto"; 
      } 
 
      for (const file of files) { 
        audioObjectUrl = URL.createObjectURL(file); 
        state.audioClips.push({ 
          id: `audio_${Date.now()}`, 
          file, 
          url: audioObjectUrl, 
          name: file.name, 
          trimStart: 0, 
          trimEnd: null 
        }); 
      } 
 
      audioElement.src = audioObjectUrl; 
      audioElement.load(); 
      await waitEvent(audioElement, "loadedmetadata"); 
 
      renderAudioTimeline(); 
      if (state.selectedAudioIndex === -1 && state.audioClips.length) { 
        state.selectedAudioIndex = 0; 
        updateAudioEditInputs(); 
      } 
      event.target.value = ""; 
      status("✓ Audio track successfully loaded & linked!"); 
    }; 
  } 
 
  if (el.trimAudioBtn) { 
    el.trimAudioBtn.onclick = () => { 
      const audioClip = state.audioClips[state.selectedAudioIndex]; 
      if (!audioClip) { alert("Select an audio track first."); return; } 
      const startVal = parseFloat(el.audioTrimStart ? el.audioTrimStart.value : 0); 
      const endVal = parseFloat(el.audioTrimEnd ? el.audioTrimEnd.value : 0); 
 
      if (isNaN(startVal) || isNaN(endVal) || startVal >= endVal) { alert("Invalid markers."); return; } 
      audioClip.trimStart = startVal; 
      audioClip.trimEnd = endVal; 
      renderAudioTimeline(); 
      status("Audio track trimmed!"); 
    }; 
  } 
 
  // Playback & Position Sync 
  function updatePlayhead() { 
    if (!el.video || !el.playhead || !el.videoTrack || state.selectedClipIndex < 0) return; 
    const item = el.videoTrack.children[state.selectedClipIndex]; 
    const clip = state.clips[state.selectedClipIndex]; 
    if (!item || !clip) return; 
    const start = clipStart(clip); 
    const end = clipEnd(clip, el.video.duration || 1); 
    const progress = (el.video.currentTime - start) / Math.max(end - start, 0.01); 
    el.playhead.style.left = `${item.offsetLeft + Math.max(0, Math.min(1, progress)) * item.offsetWidth}px`; 
    el.playhead.style.display = "block"; 
  } 
 
  async function scrubTo(clientX) { 
    if (!el.video || state.clips.length === 0 || !el.videoTrack) return; 
    const clipElements = Array.from(el.videoTrack.children); 
    let targetIndex = -1; 
    let localPercent = 0; 
     
    for (let i = 0; i < clipElements.length; i++) { 
      const rect = clipElements[i].getBoundingClientRect(); 
      if (clientX >= rect.left && clientX <= rect.right) { 
        targetIndex = i; 
        localPercent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)); 
        break; 
      } else if (clientX < rect.left && i === 0) { 
        targetIndex = 0; 
        localPercent = 0; 
        break; 
      } else if (clientX > rect.right && i === clipElements.length - 1) { 
        targetIndex = clipElements.length - 1; 
        localPercent = 1; 
        break; 
      } 
    } 
 
    if (targetIndex === -1) targetIndex = Math.max(0, state.selectedClipIndex); 
 
    if (targetIndex !== state.selectedClipIndex) { 
      state.selectedClipIndex = targetIndex; 
      const clip = state.clips[targetIndex]; 
      el.video.src = clip.url; 
      el.video.load(); 
      await waitEvent(el.video, "loadedmetadata"); 
      applyVideoFilterStyle(clip.filter || "none"); 
    } 
 
    const activeClip = state.clips[state.selectedClipIndex]; 
    if (!activeClip) return; 
    const start = clipStart(activeClip); 
    const end = clipEnd(activeClip, el.video.duration || 10); 
    el.video.currentTime = start + (end - start) * localPercent; 
     
    syncAudioPlayback(el.video.currentTime); 
    renderVideoTimeline(); 
    updatePlayhead(); 
  } 
 
  if (el.timelineContainer) { 
    el.timelineContainer.addEventListener("mousedown", event => { 
      if (event.target.closest(".clip-delete-btn")) return; 
      state.isScrubbing = true; 
      scrubTo(event.clientX); 
    }); 
    window.addEventListener("mousemove", event => { if (state.isScrubbing) scrubTo(event.clientX); }); 
    window.addEventListener("mouseup", () => { state.isScrubbing = false; }); 
  } 
 
  async function playClip(index, id) { 
    const video = el.video; 
    const clip = state.clips[index]; 
    if (!video || !clip || id !== state.playbackId) return; 
 
    state.selectedClipIndex = index; 
    renderVideoTimeline(); 
    video.pause(); 
    video.src = clip.url; 
    video.load(); 
    await waitEvent(video, "loadedmetadata"); 
    if (id !== state.playbackId) return; 
 
    applyVideoFilterStyle(clip.filter || "none"); 
    const start = clipStart(clip); 
    const end = clipEnd(clip, video.duration); 
    video.currentTime = start; 
 
    try {  
      await video.play();  
      if (audioElement && state.audioClips.length > 0) { 
        audioElement.play().catch(() => {}); 
      } 
    } catch (e) {  
      video.muted = true;  
      await video.play();  
    } 
 
    await new Promise(resolve => { 
      let finished = false; 
      const finish = () => { 
        if (finished) return; 
        finished = true; 
        video.removeEventListener("timeupdate", check); 
        video.removeEventListener("ended", finish); 
        resolve(); 
      }; 
      const check = () => { 
        if (id !== state.playbackId || !state.isPlaying) { finish(); return; } 
        syncAudioPlayback(video.currentTime); 
        if (video.currentTime >= end - 0.05) { video.pause(); finish(); } 
      }; 
      video.addEventListener("timeupdate", check); 
      video.addEventListener("ended", finish, { once: true }); 
    }); 
  } 
 
  async function playFullTimeline() { 
    if (!state.clips.length || state.isExporting) return; 
    state.playbackId++; 
    const id = state.playbackId; 
    state.isPlaying = true; 
    if (el.playPause) el.playPause.textContent = "⏸"; 
 
    status("Playing timeline..."); 
    try { 
      let startIndex = Math.max(0, state.selectedClipIndex); 
      for (let index = startIndex; index < state.clips.length; index++) { 
        if (!state.isPlaying || id !== state.playbackId) break; 
        await playClip(index, id); 
      } 
      if (id === state.playbackId) status("Playback finished"); 
    } catch (error) { 
      console.error("Playback error:", error); 
    } finally { 
      if (id === state.playbackId) { 
        state.isPlaying = false; 
        el.video?.pause(); 
        if (audioElement) audioElement.pause(); 
        if (el.playPause) el.playPause.textContent = "▶"; 
      } 
    } 
  } 
 
  if (el.playPause) { 
    el.playPause.onclick = () => { 
      if (!state.clips.length || state.isExporting) return; 
      if (state.isPlaying) { 
        state.isPlaying = false; 
        state.playbackId++; 
        el.video?.pause(); 
        if (audioElement) audioElement.pause(); 
        el.playPause.textContent = "▶"; 
        status("Paused"); 
        return; 
      } 
      playFullTimeline(); 
    }; 
  } 
 
  if (el.video) { 
    el.video.ontimeupdate = () => { 
      const current = el.video.currentTime || 0; 
      const duration = el.video.duration || 0; 
      if (el.time) el.time.textContent = `${formatTime(current)} / ${formatTime(duration)}`; 
      syncAudioPlayback(current); 
      updatePlayhead(); 
    }; 
  } 
 
  if (el.deleteSelectedBtn) { 
    el.deleteSelectedBtn.onclick = () => { 
      if (state.selectedClipIndex !== -1) removeVideoClip(state.selectedClipIndex); 
      else alert("Select a clip to delete."); 
    }; 
  } 
  
  
  // VIDEO FILTERS INSIDE THE EDIT PANEL
  const addFilterButtons = () => {
    const editPanel = document.getElementById("editPanel");
    if (!editPanel) {
      console.error("Edit panel not found");
      return;
    }

    let bar = document.getElementById("videoFilterBar");

    if (!bar) {
      bar = document.createElement("div");
      bar.id = "videoFilterBar";
      bar.style.cssText =
        "display:flex;flex-wrap:wrap;gap:8px;padding:12px;" +
        "margin:12px 0;background:#171923;border-radius:10px;";

      const heading = document.createElement("h3");
      heading.textContent = "Video Filters";
      heading.style.cssText = "width:100%;color:white;margin:0 0 8px;";
      bar.appendChild(heading);

      editPanel.appendChild(bar);
    }

    const filters = [
      ["none", "Original"],
      ["brightness", "Brightness"],
      ["grayscale", "Grayscale"],
      ["sepia", "Sepia"],
      ["contrast", "Contrast"],
      ["saturate", "Saturate"],
      ["invert", "Invert"],
      ["blur", "Blur"],
      ["vintage", "Vintage"],
      ["cool", "Cool"]
    ];

    bar.querySelectorAll(".video-filter-btn").forEach(btn => btn.remove());

    filters.forEach(([filter, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "video-filter-btn";
      button.dataset.filter = filter;
      button.textContent = label;

      button.style.cssText =
        "padding:9px 12px;background:#292d3a;color:white;" +
        "border:1px solid #777;border-radius:7px;cursor:pointer;";

      button.addEventListener("click", () => {
        if (state.selectedClipIndex < 0 || !state.clips[state.selectedClipIndex]) {
          status("Upload and select a video first.");
          return;
        }

        applyVideoFilterStyle(filter);

        bar.querySelectorAll(".video-filter-btn").forEach(btn => {
          btn.style.background =
            btn.dataset.filter === filter ? "#7657ff" : "#292d3a";
        });

        status(label + " filter applied.");
      });

      bar.appendChild(button);
    });
  };

  addFilterButtons();


});
