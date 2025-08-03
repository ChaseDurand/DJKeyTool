// Audio context for generating tones
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Oscillator gain (per note)
const OSC_GAIN = 0.15;

// Options state with localStorage persistence
function loadSettings() {
    // Use initial settings if available (loaded in HTML head)
    if (window.initialSettings) {
        return window.initialSettings;
    }
    const saved = localStorage.getItem('djKeyToolSettings');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            return { majorOnTop: false, volume: 0.7, notationType: 'camelot', useFlats: false };
        }
    }
    return { majorOnTop: false, volume: 0.7, notationType: 'camelot', useFlats: false };
}

function saveSettings(settings) {
    localStorage.setItem('djKeyToolSettings', JSON.stringify(settings));
}

const settings = loadSettings();

// Master volume control
let MASTER_GAIN = settings.volume;

// Create master gain node
const masterGainNode = audioContext.createGain();
masterGainNode.gain.value = MASTER_GAIN;

// Create compressor to prevent distortion
const compressor = audioContext.createDynamicsCompressor();
compressor.threshold.value = -10; // Start compression at -20dB
compressor.knee.value = 10; // Smooth transition
compressor.ratio.value = 12; // 12:1 compression ratio
compressor.attack.value = 0.003; // Fast attack
compressor.release.value = 0.25; // Moderate release

// Connect: compressor -> master gain -> destination
compressor.connect(masterGainNode);
masterGainNode.connect(audioContext.destination);

// Master note frequency mapping (single source of truth)
const NOTE_FREQUENCIES = {
    'C': 261.63,
    'C#': 277.18,
    'D': 293.66,
    'D#': 311.13,
    'E': 329.63,
    'F': 349.23,
    'F#': 369.99,
    'G': 392.00,
    'G#': 415.30,
    'A': 440.00,
    'A#': 466.16,
    'B': 493.88
};

// Circle of Fifths order for the wheel (rotated 90 degrees counterclockwise so A is at top)
const circleOfFifthsOrder = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F', 'C', 'G', 'D'];

// Camelot wheel notation (clockwise from 12 o'clock)
const camelotKeys = {
    'C': { minor: '5A', major: '8B' },
    'G': { minor: '6A', major: '9B' },
    'D': { minor: '7A', major: '10B' },
    'A': { minor: '8A', major: '11B' },
    'E': { minor: '9A', major: '12B' },
    'B': { minor: '10A', major: '1B' },
    'F#': { minor: '11A', major: '2B' },
    'C#': { minor: '12A', major: '3B' },
    'G#': { minor: '1A', major: '4B' },
    'D#': { minor: '2A', major: '5B' },
    'A#': { minor: '3A', major: '6B' },
    'F': { minor: '4A', major: '7B' }
};

// Open Key notation (d = major, m = minor)
// Open Key starts with C minor at 10m
const openKeys = {
    'C': { minor: '10m', major: '1d' },
    'G': { minor: '11m', major: '2d' },
    'D': { minor: '12m', major: '3d' },
    'A': { minor: '1m', major: '4d' },
    'E': { minor: '2m', major: '5d' },
    'B': { minor: '3m', major: '6d' },
    'F#': { minor: '4m', major: '7d' },
    'C#': { minor: '5m', major: '8d' },
    'G#': { minor: '6m', major: '9d' },
    'D#': { minor: '7m', major: '10d' },
    'A#': { minor: '8m', major: '11d' },
    'F': { minor: '9m', major: '12d' }
};

// Camelot wheel color scheme (based on reference image)
const keyColors = {
    'B': { minor: 'rgb(201, 214, 250)', major: 'rgb(109, 234, 203	)' },      // 10A/1B
    'F#': { minor: 'rgb(171, 231, 247)', major: 'rgb(121, 235, 142)' },    // 11A/2B
    'C#': { minor: 'rgb(145	241	242)', major: 'rgb(161, 242, 104)' },    // 12A/3B
    'G#': { minor: 'rgb(146, 242, 222)', major: 'rgb(245, 206, 98)' },     // 1A/4B
    'D#': { minor: 'rgb(164, 241, 182)', major: 'rgb(241, 164, 130)' },     // 2A/5B
    'A#': { minor: 'rgb(196, 245, 160)', major: 'rgb(239, 143, 151)' },     // 3A/6B
    'F': { minor: 'rgb(247, 226, 154)', major: 'rgb(239, 135, 179)' },     // 4A/7B
    'C': { minor: 'rgb(245, 201, 182)', major: 'rgb(221, 137, 214)' },     // 5A/8B
    'G': { minor: 'rgb(242, 188, 193)', major: 'rgb(194, 146,248)' },     // 6A/9B
    'D': { minor: 'rgb(242, 183, 208)', major: 'rgb(164, 181, 249)' },     // 7A/10B
    'A': { minor: 'rgb(233,183,228	)', major: 'rgb(125, 213, 244)' },     // 8A/11B
    'E': { minor: 'rgb(220,189,250	)', major: 'rgb(109, 233, 233)' }      // 9A/12B
};

// Note frequencies in Circle of Fifths order
const notes = circleOfFifthsOrder.map(name => ({
    name,
    frequency: NOTE_FREQUENCIES[name],
    isBlack: name.includes('#')
}));

// Track active oscillators
const activeOscillators = {};

// Track mouse state for drag functionality
let isMouseDown = false;
let currentPlayingFrequency = null;

// Track keyboard state
const activeKeys = new Set();

// Track currently held notes (in order they were pressed)
const heldNotes = [];

// Track last played note (for center display)
let lastPlayedNote = null;

// Sharp to flat conversion mapping
const sharpToFlat = {
    'C#': 'Db',
    'D#': 'Eb',
    'F#': 'Gb',
    'G#': 'Ab',
    'A#': 'Bb'
};

// Options state
let majorOnTop = settings.majorOnTop;
let notationType = settings.notationType || 'camelot';
let useFlats = settings.useFlats || false;

// Octave shift state
let octaveShift = 0;
const MAX_OCTAVE_SHIFT = 3;
const MIN_OCTAVE_SHIFT = -3;

// Keyboard to note mapping (piano layout)
const keyboardMap = {
    'a': NOTE_FREQUENCIES['C'],
    'w': NOTE_FREQUENCIES['C#'],
    's': NOTE_FREQUENCIES['D'],
    'e': NOTE_FREQUENCIES['D#'],
    'd': NOTE_FREQUENCIES['E'],
    'f': NOTE_FREQUENCIES['F'],
    't': NOTE_FREQUENCIES['F#'],
    'g': NOTE_FREQUENCIES['G'],
    'y': NOTE_FREQUENCIES['G#'],
    'h': NOTE_FREQUENCIES['A'],
    'u': NOTE_FREQUENCIES['A#'],
    'j': NOTE_FREQUENCIES['B']
};

// Create pie sections
const wheel = document.getElementById('wheel');
const centerX = 400;
const centerY = 400;
const innerRingOuterRadius = 250;
const innerRingInnerRadius = 100;
const outerRingOuterRadius = 370;
const outerRingInnerRadius = innerRingOuterRadius;
const anglePerSection = (2 * Math.PI) / 12;

// Function to create a pie section path
function createPieSection(startAngle, endAngle, outerRadius, innerRadius) {
    const x1 = centerX + outerRadius * Math.cos(startAngle);
    const y1 = centerY + outerRadius * Math.sin(startAngle);
    const x2 = centerX + outerRadius * Math.cos(endAngle);
    const y2 = centerY + outerRadius * Math.sin(endAngle);
    const x3 = centerX + innerRadius * Math.cos(endAngle);
    const y3 = centerY + innerRadius * Math.sin(endAngle);
    const x4 = centerX + innerRadius * Math.cos(startAngle);
    const y4 = centerY + innerRadius * Math.sin(startAngle);
    
    return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 0 0 ${x4} ${y4} Z`;
}

// Function to shift note by semitones
function shiftNoteBySemitones(noteName, semitones) {
    const noteOrder = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const currentIndex = noteOrder.indexOf(noteName);
    const newIndex = ((currentIndex + semitones) % 12 + 12) % 12;
    return noteOrder[newIndex];
}

// Check if a note is the major counterpart of another note (3 semitones up)
function isMajorCounterpart(baseNote, checkNote) {
    return shiftNoteBySemitones(baseNote, 3) === checkNote;
}

// Function to get note name from frequency
function getNoteFromFrequency(frequency) {
    for (const [noteName, noteFreq] of Object.entries(NOTE_FREQUENCIES)) {
        if (Math.abs(noteFreq - frequency) < 0.01) {
            return noteName;
        }
    }
    return null;
}

// Function to convert note name to sharp or flat based on preference
function formatNoteName(noteName) {
    if (useFlats && sharpToFlat[noteName]) {
        return sharpToFlat[noteName];
    }
    return noteName;
}

// Function to update highlighting for all active notes based on majorOnTop setting
function updateActiveNotesHighlighting() {
    // First, remove all primary highlighting
    document.querySelectorAll('.active-primary').forEach(el => {
        el.classList.remove('active-primary');
    });
    document.querySelectorAll('.primary-active').forEach(el => {
        el.classList.remove('primary-active');
    });
    
    // Re-apply highlighting based on current majorOnTop setting
    Object.entries(activeOscillators).forEach(([actualFreq, data]) => {
        const { baseFrequency, chordType } = data;
        const noteName = getNoteFromFrequency(baseFrequency);
        
        if (!noteName) return;
        
        // If this note was played from the wheel, keep its original primary status
        if (chordType) {
            // Wheel click - the clicked chord type should remain primary
            document.querySelectorAll(`[data-frequency="${baseFrequency}"][data-chord-type="${chordType}"]`).forEach(el => {
                el.classList.add('active-primary');
            });
            document.querySelectorAll(`.note-label[data-note="${noteName}"][data-type="${chordType}"]`).forEach(label => {
                label.classList.add('primary-active');
            });
        } else {
            // Piano/keyboard input - update based on majorOnTop setting
            const majorCounterpart = shiftNoteBySemitones(noteName, 3);
            const minorCounterpart = shiftNoteBySemitones(noteName, -3);
            
            let isPrimary = true;
            if (NOTE_FREQUENCIES[majorCounterpart] || NOTE_FREQUENCIES[minorCounterpart]) {
                const isMajorChordCenter = NOTE_FREQUENCIES[minorCounterpart] !== undefined;
                isPrimary = majorOnTop ? isMajorChordCenter : !isMajorChordCenter;
            }
            
            // Update wheel segments
            document.querySelectorAll(`[data-frequency="${baseFrequency}"]`).forEach(el => {
                const elChordType = el.getAttribute('data-chord-type');
                if (elChordType) {
                    const shouldBePrimary = (isPrimary && elChordType === 'major') || (!isPrimary && elChordType === 'minor');
                    if (shouldBePrimary) {
                        el.classList.add('active-primary');
                    }
                } else if (isPrimary) {
                    // Piano keys
                    el.classList.add('active-primary');
                }
            });
            
            // Update wheel labels
            document.querySelectorAll(`.note-label[data-note="${noteName}"]`).forEach(label => {
                const labelType = label.getAttribute('data-type');
                if (labelType) {
                    const shouldBePrimary = (isPrimary && labelType === 'major') || (!isPrimary && labelType === 'minor');
                    if (shouldBePrimary) {
                        label.classList.add('primary-active');
                    }
                }
            });
        }
    });
}

// Function to update center display
function updateCenterDisplay(forceDisplay = null) {
    const mainKeyElement = document.getElementById('center-main-key');
    const altKeyElement = document.getElementById('center-alt-key');
    const displayElement = document.getElementById('center-display');
    
    // Show the most recent held note, or fall back to last played note if none held
    let noteToDisplay = null;
    if (heldNotes.length > 0) {
        noteToDisplay = heldNotes[heldNotes.length - 1];
    } else if (lastPlayedNote) {
        noteToDisplay = lastPlayedNote;
    }
    
    if (noteToDisplay) {
        const baseNoteName = typeof noteToDisplay === 'string' ? noteToDisplay : noteToDisplay.note;
        const displayNoteName = formatNoteName(baseNoteName);
        const keyNotation = notationType === 'camelot' ? camelotKeys : openKeys;
        const majorKey = `${keyNotation[baseNoteName].major} ${displayNoteName}maj`;
        const minorKey = `${keyNotation[baseNoteName].minor} ${displayNoteName}min`;
        
        // If forceDisplay is set (from wheel click), use that to determine order
        // Otherwise use the majorOnTop setting
        let showMajorOnTop = majorOnTop;
        if (forceDisplay === 'major') {
            showMajorOnTop = true;
        } else if (forceDisplay === 'minor') {
            showMajorOnTop = false;
        } else if (typeof noteToDisplay === 'object' && noteToDisplay.source === 'wheel') {
            // For wheel clicks, show the clicked type on top
            showMajorOnTop = noteToDisplay.type === 'major';
        }
        
        // Get the color for the note
        const noteColor = keyColors[baseNoteName];
        if (noteColor) {
            // Use the color of whichever type is shown on top
            const primaryColor = showMajorOnTop ? noteColor.major : noteColor.minor;
            const secondaryColor = showMajorOnTop ? noteColor.minor : noteColor.major;
            
            mainKeyElement.style.color = primaryColor;
            altKeyElement.style.color = secondaryColor;
            
            // Also update text shadows for better visibility
            mainKeyElement.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.8)';
            altKeyElement.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.8)';
        }
        
        if (showMajorOnTop) {
            mainKeyElement.textContent = majorKey;
            altKeyElement.textContent = minorKey;
        } else {
            mainKeyElement.textContent = minorKey;
            altKeyElement.textContent = majorKey;
        }
    } else {
        mainKeyElement.textContent = '--';
        altKeyElement.textContent = '--';
        mainKeyElement.style.color = 'white';
        altKeyElement.style.color = 'white';
    }
}

// Function to calculate volume based on active notes
function calculateVolume() {
    const activeCount = Object.keys(activeOscillators).length;
    if (activeCount === 0) return MASTER_GAIN;
    if (activeCount === 1) return MASTER_GAIN;
    
    // Reduce volume as more notes are played to prevent distortion
    // 1 note: MASTER_GAIN, 2 notes: 70%, 3 notes: 58%, etc.
    return Math.max(0.05, MASTER_GAIN / Math.sqrt(activeCount));
}

// Function to adjust all active volumes
function adjustActiveVolumes() {
    const targetVolume = calculateVolume();
    const now = audioContext.currentTime;
    
    Object.values(activeOscillators).forEach(({ gainNode }) => {
        // Only adjust if the gain node is not already ramping to 0
        const currentValue = gainNode.gain.value;
        if (currentValue > 0.01) {
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.setValueAtTime(currentValue, now);
            gainNode.gain.linearRampToValueAtTime(targetVolume, now + 0.05);
        }
    });
}

// Function to play a note
function playNote(frequency, applyOctaveShift = true, isPrimary = true) {
    // Apply octave shift if requested
    const actualFrequency = applyOctaveShift ? frequency * Math.pow(2, octaveShift) : frequency;
    
    // Always stop any existing instance of this note first
    if (activeOscillators[actualFrequency]) {
        stopNote(actualFrequency);
    }
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(compressor); // Connect to compressor instead of destination
    
    oscillator.frequency.value = actualFrequency;
    oscillator.type = 'sine';
    
    // Start with zero gain to avoid pops
    gainNode.gain.value = 0;
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    // Fixed volume for all notes - let compressor handle limiting
    gainNode.gain.linearRampToValueAtTime(OSC_GAIN, audioContext.currentTime + 0.007);
    
    oscillator.start();
    activeOscillators[actualFrequency] = { oscillator, gainNode, baseFrequency: frequency, isPrimary };
    
    // Update held notes and center display
    const noteName = getNoteFromFrequency(frequency);
    
    // Highlight all elements with this frequency
    document.querySelectorAll(`[data-frequency="${frequency}"]`).forEach(el => {
        el.classList.add('active');
        // For piano/keyboard input, determine primary based on chord type and majorOnTop setting
        const chordType = el.getAttribute('data-chord-type');
        if (chordType) {
            // isPrimary true means this note is a major chord center and majorOnTop is true
            // OR this note is a minor chord center and majorOnTop is false
            // So if isPrimary is true, highlight the major version
            const shouldBePrimary = (isPrimary && chordType === 'major') || (!isPrimary && chordType === 'minor');
            if (shouldBePrimary) {
                el.classList.add('active-primary');
            }
        } else if (isPrimary) {
            // For piano keys (no chord type)
            el.classList.add('active-primary');
        }
    });
    
    // Also highlight wheel labels based on primary status and chord type
    if (noteName) {
        document.querySelectorAll(`.note-label[data-note="${noteName}"]`).forEach(label => {
            const labelType = label.getAttribute('data-type');
            if (labelType) {
                const shouldBePrimary = (isPrimary && labelType === 'major') || (!isPrimary && labelType === 'minor');
                if (shouldBePrimary) {
                    label.classList.add('primary-active');
                }
            }
        });
    }
    if (noteName) {
        // Remove any existing instance of this note
        const existingIndex = heldNotes.findIndex(note => 
            (typeof note === 'string' ? note : note.note) === noteName
        );
        if (existingIndex > -1) {
            heldNotes.splice(existingIndex, 1);
        }
        
        // Add new note (default source is not wheel, so use setting)
        heldNotes.push(noteName);
        lastPlayedNote = noteName;
        updateCenterDisplay();
    }
}

// Function to play a note from the wheel with specific type
function playNoteFromWheel(frequency, noteName, type) {
    const actualFrequency = frequency * Math.pow(2, octaveShift);
    
    // Always stop any existing instance of this note first
    if (activeOscillators[actualFrequency]) {
        stopNote(actualFrequency);
    }
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(compressor);
    
    oscillator.frequency.value = actualFrequency;
    oscillator.type = 'sine';
    
    gainNode.gain.value = 0;
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(OSC_GAIN, audioContext.currentTime + 0.007);
    
    oscillator.start();
    activeOscillators[actualFrequency] = { oscillator, gainNode, baseFrequency: frequency, isPrimary: true, chordType: type };
    
    // Highlight all elements with this frequency
    document.querySelectorAll(`[data-frequency="${frequency}"]`).forEach(el => {
        el.classList.add('active');
        // Only add primary class to the clicked chord type
        if (el.getAttribute('data-chord-type') === type) {
            el.classList.add('active-primary');
        }
    });
    
    // Also highlight wheel labels for the clicked chord type only
    document.querySelectorAll(`.note-label[data-note="${noteName}"][data-type="${type}"]`).forEach(label => {
        label.classList.add('primary-active');
    });
    
    // Update held notes with source information
    const existingIndex = heldNotes.findIndex(note => 
        (typeof note === 'string' ? note : note.note) === noteName
    );
    if (existingIndex > -1) {
        heldNotes.splice(existingIndex, 1);
    }
    
    // Add note with wheel source and type information
    heldNotes.push({ note: noteName, source: 'wheel', type: type });
    lastPlayedNote = { note: noteName, source: 'wheel', type: type };
    updateCenterDisplay();
}

// Function to stop a note
function stopNote(actualFrequency) {
    if (!activeOscillators[actualFrequency]) return;
    
    const { oscillator, gainNode, baseFrequency } = activeOscillators[actualFrequency];
    
    // Immediately remove from active oscillators to prevent conflicts
    delete activeOscillators[actualFrequency];
    
    // Get current time and value
    const now = audioContext.currentTime;
    const currentValue = gainNode.gain.value;
    
    // Cancel any scheduled parameter changes
    gainNode.gain.cancelScheduledValues(now);
    
    // Set current value explicitly
    gainNode.gain.setValueAtTime(currentValue, now);
    
    // Use linear ramp for Firefox compatibility
    // Firefox sometimes has issues with exponentialRampToValueAtTime
    gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
    
    setTimeout(() => {
        try {
            oscillator.stop();
            oscillator.disconnect();
            gainNode.disconnect();
        } catch (e) {
            // Ignore errors if already stopped/disconnected
        }
    }, 200);
    
    // Remove highlight using base frequency
    const frequencyToUnhighlight = baseFrequency || actualFrequency;
    document.querySelectorAll(`[data-frequency="${frequencyToUnhighlight}"]`).forEach(el => {
        el.classList.remove('active');
        el.classList.remove('active-primary');
    });
    
    // Also remove primary-active class from wheel labels
    const noteName = getNoteFromFrequency(frequencyToUnhighlight);
    if (noteName) {
        document.querySelectorAll(`.note-label[data-note="${noteName}"]`).forEach(label => {
            label.classList.remove('primary-active');
        });
    }
    
    // Update held notes and center display
    if (noteName) {
        const index = heldNotes.findIndex(note => 
            (typeof note === 'string' ? note : note.note) === noteName
        );
        if (index > -1) {
            heldNotes.splice(index, 1);
        }
        updateCenterDisplay();
    }
}

// Update wheel labels based on notation type and sharp/flat preference
function updateWheelLabels() {
    const keyNotation = notationType === 'camelot' ? camelotKeys : openKeys;
    document.querySelectorAll('.note-label').forEach(label => {
        const baseNoteName = label.getAttribute('data-note');
        const type = label.getAttribute('data-type');
        if (baseNoteName && type) {
            const displayNoteName = formatNoteName(baseNoteName);
            const suffix = type === 'minor' ? 'min' : 'maj';
            const notation = keyNotation[baseNoteName][type];
            label.innerHTML = `<div class="notation-line">${notation}</div><div class="key-line">${displayNoteName}${suffix}</div>`;
        }
    });
}

// Update piano key labels based on sharp/flat preference
function updatePianoLabels() {
    document.querySelectorAll('.piano-key-label').forEach(label => {
        const baseNoteName = label.getAttribute('data-base-note');
        if (baseNoteName) {
            const displayNoteName = formatNoteName(baseNoteName);
            label.textContent = displayNoteName;
        }
    });
}

// Initialize the application
function initializeApp() {
    createWheel();
    updateWheelLabels();
    setupEventHandlers();
    createPianoKeyboard();
    updatePianoLabels();
    setupOptionsPanel();
    setupOctaveControls();
    
    // Show the page now that everything is loaded
    document.body.classList.add('loaded');
}

// Create wheel sections
function createWheel() {
    notes.forEach((note, index) => {
        // Offset by 15 degrees (Math.PI / 12 radians)
        const rotationOffset = Math.PI / 12;
        const startAngle = index * anglePerSection - Math.PI / 2 + rotationOffset;
        const endAngle = (index + 1) * anglePerSection - Math.PI / 2 + rotationOffset;
        
        // Create inner ring path element
        const innerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        innerPath.setAttribute('d', createPieSection(startAngle, endAngle, innerRingOuterRadius, innerRingInnerRadius));
        innerPath.setAttribute('class', `note-path`);
        innerPath.setAttribute('data-frequency', note.frequency);
        innerPath.setAttribute('data-chord-type', 'minor');
        innerPath.setAttribute('fill', keyColors[note.name].minor);
        
        // Create outer ring path element (3 semitones up)
        const outerNote = shiftNoteBySemitones(note.name, 3);
        const outerFrequency = NOTE_FREQUENCIES[outerNote];
        const outerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        outerPath.setAttribute('d', createPieSection(startAngle, endAngle, outerRingOuterRadius, outerRingInnerRadius));
        outerPath.setAttribute('class', `note-path outer-ring`);
        outerPath.setAttribute('data-frequency', outerFrequency);
        outerPath.setAttribute('data-chord-type', 'major');
        outerPath.setAttribute('fill', keyColors[outerNote].major);
        
        // Add event listeners for inner path (minor)
        setupWheelEventListeners(innerPath, note.frequency, note.name, 'minor');
        
        // Add event listeners for outer path (major)
        setupWheelEventListeners(outerPath, outerFrequency, outerNote, 'major');
        
        wheel.appendChild(innerPath);
        wheel.appendChild(outerPath);
        
        // Create inner ring label (minor chord)
        const labelAngle = startAngle + anglePerSection / 2;
        const innerLabelRadius = (innerRingOuterRadius + innerRingInnerRadius) / 2;
        const innerLabelX = centerX + innerLabelRadius * Math.cos(labelAngle);
        const innerLabelY = centerY + innerLabelRadius * Math.sin(labelAngle);
        
        const innerLabel = document.createElement('div');
        innerLabel.className = 'note-label';
        innerLabel.setAttribute('data-note', note.name);
        innerLabel.setAttribute('data-type', 'minor');
        innerLabel.style.left = `${innerLabelX}px`;
        innerLabel.style.top = `${innerLabelY}px`;
        
        // Create outer ring label (major chord)
        const outerLabelRadius = (outerRingOuterRadius + outerRingInnerRadius) / 2;
        const outerLabelX = centerX + outerLabelRadius * Math.cos(labelAngle);
        const outerLabelY = centerY + outerLabelRadius * Math.sin(labelAngle);
        
        const outerLabel = document.createElement('div');
        outerLabel.className = 'note-label';
        outerLabel.setAttribute('data-note', outerNote);
        outerLabel.setAttribute('data-type', 'major');
        outerLabel.style.left = `${outerLabelX}px`;
        outerLabel.style.top = `${outerLabelY}px`;
        
        document.querySelector('.wheel-container').appendChild(innerLabel);
        document.querySelector('.wheel-container').appendChild(outerLabel);
    });
}

// Setup event listeners for wheel elements
function setupWheelEventListeners(pathElement, frequency, noteName, type) {
    pathElement.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isMouseDown = true;
        if (currentPlayingFrequency && currentPlayingFrequency !== frequency) {
            const actualFrequency = currentPlayingFrequency * Math.pow(2, octaveShift);
            stopNote(actualFrequency);
        }
        currentPlayingFrequency = frequency;
        playNoteFromWheel(frequency, noteName, type);
    });
    
    pathElement.addEventListener('mouseenter', (e) => {
        if (isMouseDown) {
            if (currentPlayingFrequency && currentPlayingFrequency !== frequency) {
                const actualFrequency = currentPlayingFrequency * Math.pow(2, octaveShift);
                stopNote(actualFrequency);
            }
            currentPlayingFrequency = frequency;
            playNoteFromWheel(frequency, noteName, type);
        }
    });
    
    pathElement.addEventListener('touchstart', (e) => {
        e.preventDefault();
        playNoteFromWheel(frequency, noteName, type);
    });
    
    pathElement.addEventListener('touchend', (e) => {
        e.preventDefault();
        const actualFrequency = frequency * Math.pow(2, octaveShift);
        stopNote(actualFrequency);
    });
}

// Setup global event handlers
function setupEventHandlers() {
    // Global mouse event handlers
    document.addEventListener('mouseup', () => {
        isMouseDown = false;
        if (currentPlayingFrequency) {
            const actualFrequency = currentPlayingFrequency * Math.pow(2, octaveShift);
            stopNote(actualFrequency);
            currentPlayingFrequency = null;
        }
    });
    
    // Keyboard event handlers
    document.addEventListener('keydown', (e) => {
        // Ignore if modifier keys are pressed or if typing in an input
        if (e.ctrlKey || e.metaKey || e.altKey || e.target.tagName === 'INPUT') return;
        
        const key = e.key.toLowerCase();
        
        // Handle octave controls
        if (key === 'z' && octaveShift > MIN_OCTAVE_SHIFT) {
            const oldOctaveShift = octaveShift;
            octaveShift--;
            shiftActiveNotes(oldOctaveShift, octaveShift);
            updateOctaveDisplay();
            return;
        }
        if (key === 'x' && octaveShift < MAX_OCTAVE_SHIFT) {
            const oldOctaveShift = octaveShift;
            octaveShift++;
            shiftActiveNotes(oldOctaveShift, octaveShift);
            updateOctaveDisplay();
            return;
        }
        
        const frequency = keyboardMap[key];
        
        if (frequency && !activeKeys.has(key)) {
            activeKeys.add(key);
            
            // Determine if this note should be primary based on majorOnTop setting
            const noteName = getNoteFromFrequency(frequency);
            let isPrimary = true;
            if (noteName) {
                // Check if this note has a counterpart on the wheel
                const majorCounterpart = shiftNoteBySemitones(noteName, 3);
                const minorCounterpart = shiftNoteBySemitones(noteName, -3);
                
                if (NOTE_FREQUENCIES[majorCounterpart] || NOTE_FREQUENCIES[minorCounterpart]) {
                    // If majorOnTop is true, major notes should be primary (white)
                    // If majorOnTop is false, minor notes should be primary (white)
                    const isMajorNote = NOTE_FREQUENCIES[minorCounterpart] !== undefined;
                    isPrimary = majorOnTop ? isMajorNote : !isMajorNote;
                }
            }
            
            playNote(frequency, true, isPrimary);
        }
    });
    
    document.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        const frequency = keyboardMap[key];
        
        if (frequency && activeKeys.has(key)) {
            activeKeys.delete(key);
            const actualFrequency = frequency * Math.pow(2, octaveShift);
            stopNote(actualFrequency);
        }
    });
    
    // Stop all notes when window loses focus
    window.addEventListener('blur', () => {
        isMouseDown = false;
        currentPlayingFrequency = null;
        activeKeys.clear();
        heldNotes.length = 0; // Clear held notes
        Object.keys(activeOscillators).forEach(freq => stopNote(freq));
        document.querySelectorAll('.active').forEach(el => el.classList.remove('active'));
        // Don't clear lastPlayedNote on blur - keep showing the last played note
        updateCenterDisplay();
    });
}

// Create piano keyboard
function createPianoKeyboard() {
    const pianoContainer = document.getElementById('piano-keyboard');
    
    // Piano notes in chromatic order
    const chromaticOrder = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const pianoNotes = chromaticOrder.map(name => ({
        name,
        frequency: NOTE_FREQUENCIES[name],
        isBlack: name.includes('#')
    }));
    
    // Reverse keyboard map for hints
    const frequencyToKey = {};
    Object.entries(keyboardMap).forEach(([key, freq]) => {
        frequencyToKey[freq] = key.toUpperCase();
    });
    
    // Create white keys first
    const whiteKeys = pianoNotes.filter(note => !note.isBlack);
    whiteKeys.forEach(note => {
        const key = document.createElement('div');
        key.className = 'piano-key white-key';
        key.dataset.frequency = note.frequency;
        
        const label = document.createElement('span');
        label.className = 'piano-key-label';
        label.setAttribute('data-base-note', note.name);
        key.appendChild(label);
        
        // Add keyboard hint
        if (frequencyToKey[note.frequency]) {
            const hint = document.createElement('span');
            hint.className = 'key-hint';
            hint.textContent = frequencyToKey[note.frequency];
            key.appendChild(hint);
        }
        
        setupPianoKeyEventListeners(key, note.frequency);
        pianoContainer.appendChild(key);
    });
    
    // Create black keys
    const blackKeyPositions = {
        'C#': 'black-key-cs',
        'D#': 'black-key-ds',
        'F#': 'black-key-fs',
        'G#': 'black-key-gs',
        'A#': 'black-key-as'
    };
    
    const blackKeys = pianoNotes.filter(note => note.isBlack);
    blackKeys.forEach(note => {
        const key = document.createElement('div');
        key.className = `piano-key black-key ${blackKeyPositions[note.name]}`;
        key.dataset.frequency = note.frequency;
        
        const label = document.createElement('span');
        label.className = 'piano-key-label';
        label.setAttribute('data-base-note', note.name);
        key.appendChild(label);
        
        // Add keyboard hint
        if (frequencyToKey[note.frequency]) {
            const hint = document.createElement('span');
            hint.className = 'key-hint';
            hint.textContent = frequencyToKey[note.frequency];
            key.appendChild(hint);
        }
        
        setupPianoKeyEventListeners(key, note.frequency);
        pianoContainer.appendChild(key);
    });
}

// Setup event listeners for piano keys
function setupPianoKeyEventListeners(keyElement, frequency) {
    keyElement.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isMouseDown = true;
        if (currentPlayingFrequency && currentPlayingFrequency !== frequency) {
            const actualFrequency = currentPlayingFrequency * Math.pow(2, octaveShift);
            stopNote(actualFrequency);
        }
        currentPlayingFrequency = frequency;
        
        // Determine if this note should be primary based on majorOnTop setting
        const noteName = getNoteFromFrequency(frequency);
        let isPrimary = true;
        if (noteName) {
            // Check if this note has a counterpart on the wheel
            const majorCounterpart = shiftNoteBySemitones(noteName, 3);
            const minorCounterpart = shiftNoteBySemitones(noteName, -3);
            
            if (NOTE_FREQUENCIES[majorCounterpart] || NOTE_FREQUENCIES[minorCounterpart]) {
                // Determine if the current note represents a major or minor chord center
                // A note is a "major chord center" if it has a minor counterpart 3 semitones down
                const isMajorChordCenter = NOTE_FREQUENCIES[minorCounterpart] !== undefined;
                // Primary highlighting depends on the majorOnTop setting
                isPrimary = majorOnTop ? isMajorChordCenter : !isMajorChordCenter;
            }
        }
        
        playNote(frequency, true, isPrimary);
    });
    
    keyElement.addEventListener('mouseenter', (e) => {
        if (isMouseDown) {
            if (currentPlayingFrequency && currentPlayingFrequency !== frequency) {
                const actualFrequency = currentPlayingFrequency * Math.pow(2, octaveShift);
                stopNote(actualFrequency);
            }
            currentPlayingFrequency = frequency;
            
            // Determine if this note should be primary based on majorOnTop setting
            const noteName = getNoteFromFrequency(frequency);
            let isPrimary = true;
            if (noteName) {
                // Check if this note has a counterpart on the wheel
                const majorCounterpart = shiftNoteBySemitones(noteName, 3);
                const minorCounterpart = shiftNoteBySemitones(noteName, -3);
                
                if (NOTE_FREQUENCIES[majorCounterpart] || NOTE_FREQUENCIES[minorCounterpart]) {
                    // If majorOnTop is true, major notes should be primary (white)
                    // If majorOnTop is false, minor notes should be primary (white)
                    const isMajorNote = NOTE_FREQUENCIES[minorCounterpart] !== undefined;
                    isPrimary = majorOnTop ? isMajorNote : !isMajorNote;
                }
            }
            
            playNote(frequency, true, isPrimary);
        }
    });
    
    keyElement.addEventListener('touchstart', (e) => {
        e.preventDefault();
        
        // Determine if this note should be primary based on majorOnTop setting
        const noteName = getNoteFromFrequency(frequency);
        let isPrimary = true;
        if (noteName) {
            // Check if this note has a counterpart on the wheel
            const majorCounterpart = shiftNoteBySemitones(noteName, 3);
            const minorCounterpart = shiftNoteBySemitones(noteName, -3);
            
            if (NOTE_FREQUENCIES[majorCounterpart] || NOTE_FREQUENCIES[minorCounterpart]) {
                // Determine if the current note represents a major or minor chord center
                // A note is a "major chord center" if it has a minor counterpart 3 semitones down
                const isMajorChordCenter = NOTE_FREQUENCIES[minorCounterpart] !== undefined;
                // Primary highlighting depends on the majorOnTop setting
                isPrimary = majorOnTop ? isMajorChordCenter : !isMajorChordCenter;
            }
        }
        
        playNote(frequency, true, isPrimary);
    });
    
    keyElement.addEventListener('touchend', (e) => {
        e.preventDefault();
        const actualFrequency = frequency * Math.pow(2, octaveShift);
        stopNote(actualFrequency);
    });
}

// Setup options panel
function setupOptionsPanel() {
    const majorOnTopCheckbox = document.getElementById('major-on-top');
    const volumeSlider = document.getElementById('volume-slider');
    const notationToggle = document.getElementById('notation-toggle');
    const flatsToggle = document.getElementById('flats-toggle');
    
    // Restore saved settings to UI elements
    majorOnTopCheckbox.checked = majorOnTop;
    volumeSlider.value = MASTER_GAIN;
    notationToggle.checked = notationType === 'openkey';
    flatsToggle.checked = useFlats;
    
    majorOnTopCheckbox.addEventListener('change', (e) => {
        majorOnTop = e.target.checked;
        updateCenterDisplay(); // Refresh the display with new order
        updateActiveNotesHighlighting(); // Update white/black text for held notes
        saveSettings({ majorOnTop, volume: MASTER_GAIN, notationType, useFlats });
    });
    
    // Prevent checkbox from stealing keyboard focus
    majorOnTopCheckbox.addEventListener('click', () => {
        majorOnTopCheckbox.blur(); // Remove focus immediately after click
    });
    
    // Toggle switch clicks are handled by the label wrapper
    
    // Setup notation toggle
    notationToggle.addEventListener('change', (e) => {
        notationType = e.target.checked ? 'openkey' : 'camelot';
        updateWheelLabels();
        updateCenterDisplay();
        saveSettings({ majorOnTop, volume: MASTER_GAIN, notationType, useFlats });
    });
    
    // Prevent notation toggle from stealing keyboard focus
    notationToggle.addEventListener('click', () => {
        notationToggle.blur();
    });
    
    // Toggle switch clicks are handled by the label wrapper
    
    // Setup flats toggle
    flatsToggle.addEventListener('change', (e) => {
        useFlats = e.target.checked;
        updateWheelLabels();
        updatePianoLabels();
        updateCenterDisplay();
        saveSettings({ majorOnTop, volume: MASTER_GAIN, notationType, useFlats });
    });
    
    // Prevent flats toggle from stealing keyboard focus
    flatsToggle.addEventListener('click', () => {
        flatsToggle.blur();
    });
    
    // Toggle switch clicks are handled by the label wrapper
    
    // Setup volume slider
    volumeSlider.addEventListener('input', (e) => {
        MASTER_GAIN = parseFloat(e.target.value);
        masterGainNode.gain.setValueAtTime(MASTER_GAIN, audioContext.currentTime);
        saveSettings({ majorOnTop, volume: MASTER_GAIN, notationType, useFlats });
    });
    
    // Prevent volume slider from stealing keyboard focus
    volumeSlider.addEventListener('mousedown', () => {
        setTimeout(() => volumeSlider.blur(), 100);
    });
}

// Setup octave controls
function setupOctaveControls() {
    const octaveDownBtn = document.getElementById('octave-down');
    const octaveUpBtn = document.getElementById('octave-up');
    const octaveDisplay = document.getElementById('octave-display');
    
    function updateOctaveDisplay() {
        octaveDisplay.textContent = `Octave: ${octaveShift > 0 ? '+' : ''}${octaveShift}`;
    }
    
    function shiftActiveNotes(oldOctaveShift, newOctaveShift) {
        // Get list of active notes with their base frequencies
        const activeNotes = [];
        Object.entries(activeOscillators).forEach(([actualFreq, data]) => {
            activeNotes.push({
                actualFreq: parseFloat(actualFreq),
                baseFreq: data.baseFrequency,
                data: data
            });
        });
        
        // Stop all current notes
        activeNotes.forEach(note => {
            stopNote(note.actualFreq);
        });
        
        // Restart notes at new octave
        activeNotes.forEach(note => {
            const noteName = getNoteFromFrequency(note.baseFreq);
            if (noteName) {
                // Check if this note was from wheel or regular play
                const isFromWheel = heldNotes.some(heldNote => 
                    typeof heldNote === 'object' && 
                    heldNote.note === noteName && 
                    heldNote.source === 'wheel'
                );
                
                if (isFromWheel) {
                    const heldNote = heldNotes.find(hn => 
                        typeof hn === 'object' && 
                        hn.note === noteName && 
                        hn.source === 'wheel'
                    );
                    playNoteFromWheel(note.baseFreq, noteName, heldNote.type);
                } else {
                    playNote(note.baseFreq);
                }
            }
        });
    }
    
    octaveDownBtn.addEventListener('click', () => {
        if (octaveShift > MIN_OCTAVE_SHIFT) {
            const oldOctaveShift = octaveShift;
            octaveShift--;
            shiftActiveNotes(oldOctaveShift, octaveShift);
            updateOctaveDisplay();
        }
        octaveDownBtn.blur();
    });
    
    octaveDisplay.addEventListener('click', () => {
        const oldOctaveShift = octaveShift;
        octaveShift = 0;
        shiftActiveNotes(oldOctaveShift, octaveShift);
        updateOctaveDisplay();
    });
    
    octaveUpBtn.addEventListener('click', () => {
        if (octaveShift < MAX_OCTAVE_SHIFT) {
            const oldOctaveShift = octaveShift;
            octaveShift++;
            shiftActiveNotes(oldOctaveShift, octaveShift);
            updateOctaveDisplay();
        }
        octaveUpBtn.blur();
    });
    
    // Make shiftActiveNotes available globally for keyboard controls
    window.shiftActiveNotes = shiftActiveNotes;
    window.updateOctaveDisplay = updateOctaveDisplay;
    
    // Initialize octave display
    updateOctaveDisplay();
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);