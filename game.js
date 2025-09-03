class FishingGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.addEventListener('click', this.handleClick.bind(this));
        
        // Game state
        this.gameState = 'ready'; // ready, casting, waiting, biting, reeling
        this.fishCount = 0;
        this.score = 0;
        this.player = {
            x: 200,
            y: 100,
            width: 40,
            height: 60
        };
        
        // Fishing mechanics
        this.fishingLine = {
            cast: false,
            x: this.player.x + this.player.width/2,
            y: this.player.y + this.player.height,
            endY: 400,
            bobberY: 400
        };
        
        this.currentFish = null;
        this.biteTimer = 0;
        this.biteWindow = 0;
        this.ripples = [];
        
        // Fish types with different rarities and values
        this.fishTypes = [
            { name: 'Minnow', rarity: 0.5, value: 10, color: '#C0C0C0' },
            { name: 'Bass', rarity: 0.3, value: 25, color: '#228B22' },
            { name: 'Salmon', rarity: 0.15, value: 50, color: '#FA8072' },
            { name: 'Tuna', rarity: 0.04, value: 100, color: '#4682B4' },
            { name: 'Golden Fish', rarity: 0.01, value: 500, color: '#FFD700' }
        ];
        
        this.init();
    }
    
    init() {
        this.gameLoop();
        this.updateUI();
    }
    
    handleClick() {
        switch(this.gameState) {
            case 'ready':
                this.castLine();
                break;
            case 'biting':
                this.catchFish();
                break;
            case 'waiting':
            case 'casting':
            case 'reeling':
                // Ignore clicks during these states
                break;
        }
    }
    
    castLine() {
        this.gameState = 'casting';
        this.fishingLine.cast = true;
        this.updateStatus('Casting...');
        
        // Animate line cast
        const castAnimation = () => {
            if (this.fishingLine.bobberY < this.fishingLine.endY) {
                this.fishingLine.bobberY += 8;
                requestAnimationFrame(castAnimation);
            } else {
                this.gameState = 'waiting';
                this.updateStatus('Waiting...');
                this.startFishTimer();
            }
        };
        castAnimation();
    }
    
    startFishTimer() {
        // Random wait time between 2-8 seconds
        const waitTime = 2000 + Math.random() * 6000;
        
        setTimeout(() => {
            if (this.gameState === 'waiting') {
                this.startBite();
            }
        }, waitTime);
    }
    
    startBite() {
        this.gameState = 'biting';
        this.currentFish = this.generateRandomFish();
        this.biteWindow = 2000; // 2 second window to catch
        this.biteTimer = 0;
        
        this.updateStatus('BITE!');
        document.getElementById('biteAlert').style.display = 'block';
        
        // Create ripple effect
        this.createRipple(this.fishingLine.x, this.fishingLine.bobberY);
        
        // Bite timeout
        setTimeout(() => {
            if (this.gameState === 'biting') {
                this.missedFish();
            }
        }, this.biteWindow);
    }
    
    generateRandomFish() {
        const rand = Math.random();
        let cumulativeRarity = 0;
        
        for (let fish of this.fishTypes) {
            cumulativeRarity += fish.rarity;
            if (rand <= cumulativeRarity) {
                return fish;
            }
        }
        return this.fishTypes[0]; // fallback
    }
    
    catchFish() {
        if (this.gameState === 'biting' && this.currentFish) {
            this.gameState = 'reeling';
            this.fishCount++;
            this.score += this.currentFish.value;
            
            document.getElementById('biteAlert').style.display = 'none';
            this.updateStatus(`Caught ${this.currentFish.name}!`);
            
            // Create success ripple
            this.createRipple(this.fishingLine.x, this.fishingLine.bobberY, '#00ff00');
            
            setTimeout(() => {
                this.resetLine();
            }, 1500);
            
            this.updateUI();
        }
    }
    
    missedFish() {
        this.gameState = 'reeling';
        document.getElementById('biteAlert').style.display = 'none';
        this.updateStatus('Fish got away!');
        
        setTimeout(() => {
            this.resetLine();
        }, 1000);
    }
    
    resetLine() {
        this.gameState = 'ready';
        this.fishingLine.cast = false;
        this.fishingLine.bobberY = this.fishingLine.y;
        this.currentFish = null;
        this.updateStatus('Ready');
    }
    
    createRipple(x, y, color = '#ffffff') {
        this.ripples.push({
            x: x,
            y: y,
            radius: 5,
            maxRadius: 30,
            color: color,
            alpha: 1,
            growing: true
        });
    }
    
    updateRipples() {
        this.ripples = this.ripples.filter(ripple => {
            ripple.radius += 1;
            ripple.alpha -= 0.02;
            return ripple.alpha > 0 && ripple.radius < ripple.maxRadius;
        });
    }
    
    updateStatus(status) {
        document.getElementById('status').textContent = status;
    }
    
    updateUI() {
        document.getElementById('fishCount').textContent = this.fishCount;
        document.getElementById('score').textContent = this.score;
    }
    
    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw water surface line
        this.ctx.strokeStyle = '#1e3a5f';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 180);
        this.ctx.lineTo(400, 180);
        this.ctx.stroke();
        
        // Draw dock/platform
        this.ctx.fillStyle = '#8B4513';
        this.ctx.fillRect(0, 0, 400, 120);
        
        // Draw dock planks
        this.ctx.strokeStyle = '#654321';
        this.ctx.lineWidth = 2;
        for (let i = 0; i < 400; i += 40) {
            this.ctx.beginPath();
            this.ctx.moveTo(i, 0);
            this.ctx.lineTo(i, 120);
            this.ctx.stroke();
        }
        
        // Draw player
        this.drawPlayer();
        
        // Draw fishing line
        if (this.fishingLine.cast) {
            this.drawFishingLine();
        }
        
        // Draw ripples
        this.drawRipples();
        
        // Draw fish indicator (if fish is present)
        if (this.gameState === 'biting') {
            this.drawFishIndicator();
        }
    }
    
    drawPlayer() {
        const { x, y, width, height } = this.player;
        
        // Body
        this.ctx.fillStyle = '#4169E1';
        this.ctx.fillRect(x + 10, y + 20, 20, 30);
        
        // Head
        this.ctx.fillStyle = '#FDBCB4';
        this.ctx.beginPath();
        this.ctx.arc(x + 20, y + 15, 10, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Hat
        this.ctx.fillStyle = '#8B0000';
        this.ctx.fillRect(x + 12, y + 5, 16, 8);
        
        // Fishing rod
        this.ctx.strokeStyle = '#8B4513';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(x + 30, y + 25);
        this.ctx.lineTo(x + 45, y - 10);
        this.ctx.stroke();
    }
    
    drawFishingLine() {
        // Fishing line
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(this.fishingLine.x + 15, this.player.y - 10);
        this.ctx.lineTo(this.fishingLine.x, this.fishingLine.bobberY);
        this.ctx.stroke();
        
        // Bobber
        this.ctx.fillStyle = '#ff0000';
        this.ctx.beginPath();
        this.ctx.arc(this.fishingLine.x, this.fishingLine.bobberY, 4, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Bobber highlight
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(this.fishingLine.x - 1, this.fishingLine.bobberY - 1, 2, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    drawRipples() {
        this.ripples.forEach(ripple => {
            this.ctx.strokeStyle = ripple.color;
            this.ctx.globalAlpha = ripple.alpha;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
            this.ctx.stroke();
        });
        this.ctx.globalAlpha = 1;
    }
    
    drawFishIndicator() {
        // Subtle fish shadow under bobber
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(this.fishingLine.x, this.fishingLine.bobberY + 15, 15, 8, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Animated bobber movement
        const bobOffset = Math.sin(Date.now() / 100) * 3;
        this.fishingLine.bobberY = this.fishingLine.endY + bobOffset;
    }
    
    gameLoop() {
        this.updateRipples();
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }
}

// Start the game when page loads
window.addEventListener('load', () => {
    new FishingGame();
});
