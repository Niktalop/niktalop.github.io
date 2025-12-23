// ASCII Animation - Cursor Trail Effect
const container = document.getElementById('ascii-container');

/* Global Configuration */
const CONFIG = {
    asciiChars: ['.', ':', '-', '~', '+', '=', '^', '*', '#'],
    charSize: 6, // Actual width of monospace character
    charHeight: 10, // Line height
    canvasWidth: 0,
    canvasHeight: 0,
    noiseScale: 0.004,
    octaveNum: 4,
    freqMultiplier: 2.2,
    ampMultiplier: 0.45,
    influenceRadius: 150, // Radius where cursor activates the noise
    densityFalloff: 2.5, // Higher = tighter concentric circles (exponential falloff)
    noiseStrength: 0.3, // How much noise distorts the circular boundary (0-1)
    noiseFrequency: 0.02, // Frequency of the noise pattern
    decayRate: 0.92, // How fast characters decay (0-1, lower = faster decay)
    brightnessThreshold: 0.01 // Minimum activation to show any character
};

// Mouse position
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let prevMouseX = mouseX;
let prevMouseY = mouseY;

// Velocity tracking for radius scaling
let currentVelocity = 0;
let maxVelocity = 20; // Maximum velocity for full radius

// Animation state
let noiseOffsetX = 0;
let noiseOffsetY = 0;

// Activation grid - tracks how "activated" each cell is
let activationGrid = [];
let cols = 0;
let rows = 0;

// Track mouse movement
window.addEventListener('mousemove', (e) => {
    prevMouseX = mouseX;
    prevMouseY = mouseY;
    mouseX = e.clientX;
    mouseY = e.clientY;
});

// Pre-calculated values for noise generation
const frequencies = Array(CONFIG.octaveNum)
    .fill(0)
    .map((_, i) => Math.pow(CONFIG.freqMultiplier, i));
const amplitudes = Array(CONFIG.octaveNum)
    .fill(0)
    .map((_, i) => Math.pow(CONFIG.ampMultiplier, i));
const maxNoiseVal = amplitudes.reduce((sum, amp) => sum + amp, 0);

// Simple Perlin noise implementation
class PerlinNoise {
    constructor() {
        this.permutation = [];
        for (let i = 0; i < 256; i++) {
            this.permutation[i] = i;
        }
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.permutation[i], this.permutation[j]] = [this.permutation[j], this.permutation[i]];
        }
        this.p = [...this.permutation, ...this.permutation];
    }

    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    lerp(t, a, b) {
        return a + t * (b - a);
    }

    grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        
        x -= Math.floor(x);
        y -= Math.floor(y);
        
        const u = this.fade(x);
        const v = this.fade(y);
        
        const a = this.p[X] + Y;
        const aa = this.p[a];
        const ab = this.p[a + 1];
        const b = this.p[X + 1] + Y;
        const ba = this.p[b];
        const bb = this.p[b + 1];
        
        return this.lerp(v,
            this.lerp(u, this.grad(this.p[aa], x, y), this.grad(this.p[ba], x - 1, y)),
            this.lerp(u, this.grad(this.p[ab], x, y - 1), this.grad(this.p[bb], x - 1, y - 1))
        );
    }
}

const perlin = new PerlinNoise();

// Ridged noise function
function getRidgedNoise(x, y) {
    let noiseVal = 0;

    for (let i = 0; i < CONFIG.octaveNum; i++) {
        const frequency = frequencies[i];
        const amplitude = amplitudes[i];
        let n = 1 - Math.abs(
            perlin.noise(
                x * frequency * CONFIG.noiseScale + noiseOffsetX,
                y * frequency * CONFIG.noiseScale + noiseOffsetY
            )
        );
        n = 1 - Math.abs(n * 2 - 1);
        n = n * n * n;
        noiseVal += n * amplitude;
    }

    return noiseVal / maxNoiseVal;
}

// Initialize canvas dimensions
function initCanvas() {
    CONFIG.canvasWidth = window.innerWidth;
    CONFIG.canvasHeight = window.innerHeight;
    
    // Use ceil instead of floor to ensure full coverage
    cols = Math.ceil(CONFIG.canvasWidth / CONFIG.charSize);
    rows = Math.ceil(CONFIG.canvasHeight / CONFIG.charHeight);
    
    // Initialize activation grid (0 = no character, 1 = fully activated)
    activationGrid = Array(rows).fill(0).map(() => Array(cols).fill(0));
}

// Update activation based on cursor position and movement
function updateActivation() {
    // Calculate cursor movement
    const dx = mouseX - prevMouseX;
    const dy = mouseY - prevMouseY;
    const movement = Math.sqrt(dx * dx + dy * dy);
    
    // Smooth velocity tracking with easing
    currentVelocity = currentVelocity * 0.7 + movement * 0.3;
    
    // Scale radius based on velocity (0 to 1)
    const velocityScale = Math.min(1, currentVelocity / maxVelocity);
    const scaledRadius = CONFIG.influenceRadius * velocityScale;
    
    // Decay all activations
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            activationGrid[row][col] *= CONFIG.decayRate;
        }
    }
    
    // Only add activation if cursor is moving
    if (movement > 0.5) { // Minimum movement threshold
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const px = col * CONFIG.charSize;
                const py = row * CONFIG.charHeight;
                const distToCursor = Math.sqrt((px - mouseX) ** 2 + (py - mouseY) ** 2);
                
                // Add noise-based distortion to make edges organic
                const angle = Math.atan2(py - mouseY, px - mouseX);
                const noiseVal = perlin.noise(
                    px * CONFIG.noiseFrequency,
                    py * CONFIG.noiseFrequency
                );
                // Distort the radius based on noise and velocity
                const distortedRadius = scaledRadius * (1 + noiseVal * CONFIG.noiseStrength);
                
                if (distToCursor < distortedRadius) {
                    const normalizedDist = distToCursor / distortedRadius;
                    // Apply exponential falloff for tighter concentric circles
                    const influence = Math.pow(1 - normalizedDist, CONFIG.densityFalloff);
                    // Accumulate activation based on movement speed
                    const buildupAmount = influence * 0.15;
                    activationGrid[row][col] = Math.min(1, activationGrid[row][col] + buildupAmount);
                }
            }
        }
    }
}

// Generate ASCII frame
function generateFrame() {
    const halfCharSize = CONFIG.charSize / 2;
    
    let output = '';
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const activation = activationGrid[row][col];
            
            // If not activated at all, show nothing (space for black background)
            if (activation < CONFIG.brightnessThreshold) {
                output += ' ';
                continue;
            }
            
            // Map activation directly to character weight
            // Higher activation = heavier character
            const charIndex = Math.floor(activation * (CONFIG.asciiChars.length - 1));
            const safeIndex = Math.max(0, Math.min(CONFIG.asciiChars.length - 1, charIndex));
            
            // Map activation to grayscale color (darker for low activation, lighter for high)
            const grayValue = Math.floor(34 + (activation * 187)); // Range from #222222 to #DDDDDD
            const colorHex = grayValue.toString(16).padStart(2, '0');
            const color = `#${colorHex}${colorHex}${colorHex}`;
            
            output += `<span style="color: ${color}">${CONFIG.asciiChars[safeIndex]}</span>`;
        }
        output += '\n';
    }
    
    return output;
}

// Animation loop
function animate() {
    updateActivation();
    container.innerHTML = generateFrame();
    
    // Reset prev position after processing to detect next frame's movement
    prevMouseX = mouseX;
    prevMouseY = mouseY;
    
    requestAnimationFrame(animate);
}

// Handle window resize
window.addEventListener('resize', () => {
    initCanvas();
});

setInterval(function() {
    let div = document.querySelector('.ascii');
    let words = div.innerHTML.split(' ');
    let firstWord = words.shift();
    words.push(firstWord);
    div.innerHTML = words.join(' ');
  }, 50);
  
// Initialize and start
initCanvas();
animate();
