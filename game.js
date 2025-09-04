class MultiplayerFishingGame {
    constructor() {
        this.socket = null;
        this.currentPlayer = null;
        this.otherPlayers = new Map();
        this.roomId = null;
        
        // Game elements
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Single player game state (for current player)
        this.gameState = 'ready';
        this.fishCount = 0;
        this.score = 0;
        this.player = {
            x: 200,
            y: 100,
            width: 40,
            height: 60
        };
        
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
        this.setupEventListeners();
        this.setupSocketConnection();
        this.gameLoop();
    }

    setupEventListeners() {
        // Canvas click for fishing
        this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));
        
        // Login form
        document.getElementById('joinGameBtn').addEventListener('click', this.handleJoinGame.bind(this));
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleJoinGame();
        });
        document.getElementById('roomId').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleJoinGame();
        });

        // Chat system
        document.getElementById('sendChatBtn').addEventListener('click', this.sendChatMessage.bind(this));
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });
    }

    setupSocketConnection() {
        // Connect to server - updated for your deployment
        const serverUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:3000' 
            : 'https://fishing-nnh9.onrender.com';
            
        console.log('Connecting to:', serverUrl);
        
        this.socket = io(serverUrl, {
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: true,
            timeout: 20000,
            forceNew: true
        });

        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to server:', this.socket.id);
            this.updateStatus('Connected');
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection failed:', error);
            this.updateStatus('Connection Failed');
            
            // Show user-friendly error
            if (!document.getElementById('connectionError')) {
                const errorDiv = document.createElement('div');
                errorDiv.id = 'connectionError';
                errorDiv.style.cssText = `
                    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: #ff4444; color: white; padding: 20px; border-radius: 10px;
                    z-index: 2000; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                `;
                errorDiv.innerHTML = `
                    <h3>Connection Error</h3>
                    <p>Unable to connect to game server.</p>
                    <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 10px; background: white; color: #ff4444; border: none; border-radius: 5px; cursor: pointer;">
                        Retry
                    </button>
                `;
                document.body.appendChild(errorDiv);
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
            this.updateStatus('Disconnected');
            
            if (reason === 'io server disconnect') {
                // Server disconnected us, reconnect manually
                this.socket.connect();
            }
        });

        // Room events
        this.socket.on('roomJoined', (data) => {
            console.log('Joined room:', data);
            this.roomId = data.roomId;
            this.currentPlayer = data.playerId;
            this.updatePlayersFromData(data.players);
            this.showGameScreen();
            this.updateRoomInfo();
            this.updateStatus('Ready');
        });

        this.socket.on('roomFull', () => {
            alert('Room is full! Please try a different room.');
        });

        this.socket.on('playerJoined', (data) => {
            console.log('Player joined:', data);
            this.updatePlayersFromData(data.players);
            this.updateRoomInfo();
            this.addChatMessage(`${data.playerName} joined the game`, 'system');
        });

        this.socket.on('playerLeft', (data) => {
            console.log('Player left:', data);
            this.updatePlayersFromData(data.players);
            this.updateRoomInfo();
            this.addChatMessage(`A player left the game`, 'system');
        });

        // Game state events
        this.socket.on('playerStateUpdate', (data) => {
            if (this.otherPlayers.has(data.playerId)) {
                const player = this.otherPlayers.get(data.playerId);
                Object.assign(player, data);
            }
        });

        this.socket.on('playerCast', (data) => {
            // Visual feedback for other players casting
            if (this.otherPlayers.has(data.playerId)) {
                const player = this.otherPlayers.get(data.playerId);
                // Could add casting animation for other players here
            }
        });

        this.socket.on('playerCaughtFish', (data) => {
            this.addChatMessage(
                `${data.playerName} caught a ${data.fishName} for ${data.fishValue} points!`, 
                'system'
            );
            this.updatePlayersList();
        });

        // Chat events
        this.socket.on('chatMessage', (data) => {
            const isCurrentPlayer = data.playerId === this.currentPlayer;
            this.addChatMessage(data.message, isCurrentPlayer ? 'current-player' : 'player', data.playerName);
        });
    }

    handleJoinGame() {
        const playerName = document.getElementById('playerName').value.trim();
        const roomId = document.getElementById('roomId').value.trim() || this.generateRoomId();

        if (!playerName) {
            alert('Please enter your name');
            return;
        }

        this.socket.emit('joinRoom', {
            roomId: roomId,
            playerName: playerName
        });
    }

    generateRoomId() {
        return Math.random().toString(36).substr(2, 6).toUpperCase();
    }

    showGameScreen() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';
    }

    updatePlayersFromData(playersData) {
        this.otherPlayers.clear();
        
        for (let [playerId, playerData] of Object.entries(playersData)) {
            if (playerId !== this.currentPlayer) {
                this.otherPlayers.set(playerId, playerData);
            } else {
                // Update current player position if set by server
                this.player.x = playerData.x;
                this.fishCount = playerData.fishCount;
                this.score = playerData.score;
            }
        }
        
        this.updatePlayersList();
    }

    updateRoomInfo() {
        document.getElementById('currentRoomId').textContent = this.roomId;
        document.getElementById('playerCount').textContent = `${this.otherPlayers.size + 1}/4`;
    }

    updatePlayersList() {
        const playersList = document.getElementById('playersList');
        playersList.innerHTML = '';

        // Add current player first
        const currentPlayerDiv = document.createElement('div');
        currentPlayerDiv.className = 'player-item current-player';
        currentPlayerDiv.innerHTML = `
            <span class="player-name">You</span>
            <span class="player-stats">🐟 ${this.fishCount} | 🏆 ${this.score}</span>
        `;
        playersList.appendChild(currentPlayerDiv);

        // Add other players
        for (let [playerId, player] of this.otherPlayers) {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-item';
            playerDiv.innerHTML = `
                <span class="player-name">${player.name}</span>
                <span class="player-stats">🐟 ${player.fishCount} | 🏆 ${player.score}</span>
            `;
            playersList.appendChild(playerDiv);
        }
    }

    addChatMessage(message, type = 'player', senderName = '') {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}`;
        
        if (type === 'system') {
            messageDiv.textContent = message;
        } else {
            messageDiv.innerHTML = `<span class="chat-sender">${senderName}:</span> ${message}`;
        }
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    sendChatMessage() {
        const chatInput = document.getElementById('chatInput');
        const message = chatInput.value.trim();
        
        if (message && this.socket) {
            this.socket.emit('sendChatMessage', { message: message });
            chatInput.value = '';
        }
    }

    handleCanvasClick() {
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
        
        // Notify other players
        if (this.socket) {
            this.socket.emit('playerCast');
            this.socket.emit('updatePlayerState', {
                gameState: this.gameState,
                fishingLine: { ...this.fishingLine }
            });
        }
        
        // Animate line cast
        const castAnimation = () => {
            if (this.fishingLine.bobberY < this.fishingLine.endY) {
                this.fishingLine.bobberY += 8;
                requestAnimationFrame(castAnimation);
            } else {
                this.gameState = 'waiting';
                this.updateStatus('Waiting...');
                this.startFishTimer();
                
                // Update other players
                if (this.socket) {
                    this.socket.emit('updatePlayerState', {
                        gameState: this.gameState,
                        fishingLine: { ...this.fishingLine }
                    });
                }
            }
        };
        castAnimation();
    }
    
    startFishTimer() {
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
        this.biteWindow = 2000;
        this.biteTimer = 0;
        
        this.updateStatus('BITE!');
        document.getElementById('biteAlert').style.display = 'block';
        this.createRipple(this.fishingLine.x, this.fishingLine.bobberY);
        
        // Update other players
        if (this.socket) {
            this.socket.emit('updatePlayerState', {
                gameState: this.gameState
            });
        }
        
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
        return this.fishTypes[0];
    }
    
    catchFish() {
        if (this.gameState === 'biting' && this.currentFish) {
            this.gameState = 'reeling';
            this.fishCount++;
            this.score += this.currentFish.value;
            
            document.getElementById('biteAlert').style.display = 'none';
            this.updateStatus(`Caught ${this.currentFish.name}!`);
            this.createRipple(this.fishingLine.x, this.fishingLine.bobberY, '#00ff00');
            
            // Notify server and other players
            if (this.socket) {
                this.socket.emit('fishCaught', {
                    fishName: this.currentFish.name,
                    fishValue: this.currentFish.value
                });
                this.socket.emit('updatePlayerState', {
                    gameState: this.gameState,
                    score: this.score,
                    fishCount: this.fishCount
                });
            }
            
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
        
        if (this.socket) {
            this.socket.emit('updatePlayerState', {
                gameState: this.gameState
            });
        }
        
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
        
        if (this.socket) {
            this.socket.emit('updatePlayerState', {
                gameState: this.gameState,
                fishingLine: { ...this.fishingLine }
            });
        }
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
        this.updatePlayersList();
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw water surface
        this.ctx.strokeStyle = '#1e3a5f';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 180);
        this.ctx.lineTo(400, 180);
        this.ctx.stroke();
        
        // Draw dock
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
        
        // Draw current player
        this.drawPlayer(this.player, true);
        
        // Draw other players
        for (let [playerId, player] of this.otherPlayers) {
            this.drawPlayer(player, false);
        }
        
        // Draw current player's fishing line
        if (this.fishingLine.cast) {
            this.drawFishingLine(this.fishingLine);
        }
        
        // Draw other players' fishing lines
        for (let [playerId, player] of this.otherPlayers) {
            if (player.fishingLine && player.fishingLine.cast) {
                this.drawFishingLine(player.fishingLine);
            }
        }
        
        // Draw ripples
        this.drawRipples();
        
        // Draw fish indicator for current player
        if (this.gameState === 'biting') {
            this.drawFishIndicator();
        }
    }
    
    drawPlayer(player, isCurrentPlayer) {
        const { x, y, width, height } = player;
        
        // Body color varies for different players
        this.ctx.fillStyle = isCurrentPlayer ? '#4169E1' : '#FF6347';
        this.ctx.fillRect(x + 10, y + 20, 20, 30);
        
        // Head
        this.ctx.fillStyle = '#FDBCB4';
        this.ctx.beginPath();
        this.ctx.arc(x + 20, y + 15, 10, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Hat
        this.ctx.fillStyle = isCurrentPlayer ? '#8B0000' : '#228B22';
        this.ctx.fillRect(x + 12, y + 5, 16, 8);
        
        // Fishing rod
        this.ctx.strokeStyle = '#8B4513';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(x + 30, y + 25);
        this.ctx.lineTo(x + 45, y - 10);
        this.ctx.stroke();
        
        // Player name tag (for other players)
        if (!isCurrentPlayer && player.name) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(x - 5, y - 15, player.name.length * 6 + 10, 15);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(player.name, x, y - 5);
        }
    }
    
    drawFishingLine(fishingLine) {
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(fishingLine.x + 15, this.player.y - 10);
        this.ctx.lineTo(fishingLine.x, fishingLine.bobberY);
        this.ctx.stroke();
        
        // Bobber
        this.ctx.fillStyle = '#ff0000';
        this.ctx.beginPath();
        this.ctx.arc(fishingLine.x, fishingLine.bobberY, 4, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Bobber highlight
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(fishingLine.x - 1, fishingLine.bobberY - 1, 2, 0, Math.PI * 2);
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
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(this.fishingLine.x, this.fishingLine.bobberY + 15, 15, 8, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
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
    new MultiplayerFishingGame();
});
