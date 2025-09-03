const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.static('public'));

// Game state management
const rooms = new Map();
const MAX_PLAYERS_PER_ROOM = 4;

class GameRoom {
    constructor(roomId) {
        this.id = roomId;
        this.players = new Map();
        this.fishSpawns = [];
        this.createdAt = Date.now();
    }

    addPlayer(socket, playerData) {
        this.players.set(socket.id, {
            id: socket.id,
            name: playerData.name,
            x: 200 + (this.players.size * 50), // Offset players horizontally
            y: 100,
            score: 0,
            fishCount: 0,
            gameState: 'ready',
            fishingLine: {
                cast: false,
                bobberY: 400
            },
            socket: socket
        });
    }

    removePlayer(socketId) {
        this.players.delete(socketId);
        // Reposition remaining players
        let index = 0;
        for (let player of this.players.values()) {
            player.x = 200 + (index * 50);
            index++;
        }
    }

    getPlayerData() {
        const players = {};
        for (let [id, player] of this.players) {
            players[id] = {
                id: player.id,
                name: player.name,
                x: player.x,
                y: player.y,
                score: player.score,
                fishCount: player.fishCount,
                gameState: player.gameState,
                fishingLine: player.fishingLine
            };
        }
        return players;
    }

    spawnFish(fishData) {
        // Add fish spawn that all players can see
        const fishSpawn = {
            id: Math.random().toString(36).substr(2, 9),
            ...fishData,
            spawnTime: Date.now()
        };
        this.fishSpawns.push(fishSpawn);
        
        // Broadcast to all players in room
        this.broadcast('fishSpawned', fishSpawn);
        
        // Remove fish spawn after 30 seconds if not caught
        setTimeout(() => {
            this.fishSpawns = this.fishSpawns.filter(f => f.id !== fishSpawn.id);
        }, 30000);
    }

    broadcast(event, data) {
        for (let player of this.players.values()) {
            player.socket.emit(event, data);
        }
    }

    broadcastToOthers(excludeSocketId, event, data) {
        for (let player of this.players.values()) {
            if (player.id !== excludeSocketId) {
                player.socket.emit(event, data);
            }
        }
    }
}

// Socket connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Join or create room
    socket.on('joinRoom', (data) => {
        const { roomId, playerName } = data;
        
        // Create room if it doesn't exist
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new GameRoom(roomId));
        }

        const room = rooms.get(roomId);
        
        // Check if room is full
        if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
            socket.emit('roomFull');
            return;
        }

        // Add player to room
        room.addPlayer(socket, { name: playerName });
        socket.join(roomId);
        socket.currentRoom = roomId;

        // Send current room state to new player
        socket.emit('roomJoined', {
            roomId: roomId,
            players: room.getPlayerData(),
            playerId: socket.id
        });

        // Notify other players
        room.broadcastToOthers(socket.id, 'playerJoined', {
            playerId: socket.id,
            playerName: playerName,
            players: room.getPlayerData()
        });

        console.log(`Player ${playerName} (${socket.id}) joined room ${roomId}`);
    });

    // Handle player state updates
    socket.on('updatePlayerState', (data) => {
        if (!socket.currentRoom) return;
        
        const room = rooms.get(socket.currentRoom);
        if (!room || !room.players.has(socket.id)) return;

        const player = room.players.get(socket.id);
        
        // Update player state
        Object.assign(player, data);

        // Broadcast to other players
        room.broadcastToOthers(socket.id, 'playerStateUpdate', {
            playerId: socket.id,
            ...data
        });
    });

    // Handle fish catch
    socket.on('fishCaught', (data) => {
        if (!socket.currentRoom) return;
        
        const room = rooms.get(socket.currentRoom);
        if (!room || !room.players.has(socket.id)) return;

        const player = room.players.get(socket.id);
        player.score += data.fishValue;
        player.fishCount += 1;

        // Broadcast fish catch to all players
        room.broadcast('playerCaughtFish', {
            playerId: socket.id,
            playerName: player.name,
            fishName: data.fishName,
            fishValue: data.fishValue,
            newScore: player.score,
            newFishCount: player.fishCount
        });
    });

    // Handle chat messages
    socket.on('sendChatMessage', (data) => {
        if (!socket.currentRoom) return;
        
        const room = rooms.get(socket.currentRoom);
        if (!room || !room.players.has(socket.id)) return;

        const player = room.players.get(socket.id);
        
        const chatMessage = {
            playerId: socket.id,
            playerName: player.name,
            message: data.message,
            timestamp: Date.now()
        };

        // Broadcast to all players in room
        room.broadcast('chatMessage', chatMessage);
    });

    // Handle fishing line cast
    socket.on('playerCast', () => {
        if (!socket.currentRoom) return;
        
        const room = rooms.get(socket.currentRoom);
        if (!room || !room.players.has(socket.id)) return;

        // Broadcast cast to other players
        room.broadcastToOthers(socket.id, 'playerCast', {
            playerId: socket.id
        });
    });

    // Handle player disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        
        if (socket.currentRoom) {
            const room = rooms.get(socket.currentRoom);
            if (room) {
                room.removePlayer(socket.id);
                
                // Notify remaining players
                room.broadcast('playerLeft', {
                    playerId: socket.id,
                    players: room.getPlayerData()
                });

                // Clean up empty rooms
                if (room.players.size === 0) {
                    rooms.delete(socket.currentRoom);
                    console.log(`Room ${socket.currentRoom} deleted (empty)`);
                }
            }
        }
    });
});

// Clean up old empty rooms periodically
setInterval(() => {
    for (let [roomId, room] of rooms) {
        if (room.players.size === 0 && Date.now() - room.createdAt > 300000) { // 5 minutes
            rooms.delete(roomId);
            console.log(`Cleaned up old room: ${roomId}`);
        }
    }
}, 60000); // Check every minute

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎣 Fishing Game Server running on port ${PORT}`);
    console.log(`📡 Socket.IO server ready for connections`);
});
