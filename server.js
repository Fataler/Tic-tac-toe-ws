const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let waitingPlayers = [];
let activeGames = {};
let onlinePlayers = [];

// Инициализация базы данных
const dbPath = path.resolve(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS players (name TEXT PRIMARY KEY, wins INTEGER)"
  );
});

function broadcastLeaderboard() {
  db.all(
    "SELECT name, wins FROM players ORDER BY wins DESC LIMIT 10",
    [],
    (err, rows) => {
      if (err) {
        console.error("Error querying database:", err.message);
      } else {
        const leaderboardData = rows.map((row) => ({
          name: row.name,
          wins: row.wins,
        }));
        onlinePlayers.forEach((player) =>
          player.ws.send(
            JSON.stringify({
              type: "leaderboard",
              leaderboard: leaderboardData,
            })
          )
        );
      }
    }
  );
}

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    const data = JSON.parse(message);
    if (data.type === "joinLobby") {
      if (
        data.name &&
        !onlinePlayers.some((player) => player.name === data.name)
      ) {
        onlinePlayers.push({ ws, name: data.name });
        console.log(`Player ${data.name} joined the lobby`);
        broadcastOnlinePlayers();
        broadcastLeaderboard(); // Отправляем топ-10 игроков при подключении к лобби
      }
    } else if (data.type === "startGame") {
      if (
        data.name &&
        !waitingPlayers.some((player) => player.name === data.name)
      ) {
        waitingPlayers.push({ ws, name: data.name });
        console.log(`Player ${data.name} is waiting for an opponent`);

        if (waitingPlayers.length >= 2) {
          const player1 = waitingPlayers.shift();
          const player2 = waitingPlayers.shift();
          const gameId = `${player1.name}-${player2.name}`;
          activeGames[gameId] = {
            players: [
              { ...player1, symbol: "X" },
              { ...player2, symbol: "O" },
            ],
            board: Array(9).fill(null),
          };

          player1.ws.send(
            JSON.stringify({
              type: "init",
              player: "X",
              board: activeGames[gameId].board,
              opponentName: player2.name,
            })
          );
          player2.ws.send(
            JSON.stringify({
              type: "init",
              player: "O",
              board: activeGames[gameId].board,
              opponentName: player1.name,
            })
          );
          console.log(
            `Game started between ${player1.name} and ${player2.name}`
          );
        }
      } else {
        ws.send(JSON.stringify({ type: "full" }));
        ws.close();
        console.log(
          "Connection refused: name is missing or name is already taken"
        );
      }
    } else if (data.type === "move") {
      const game = Object.values(activeGames).find((game) =>
        game.players.some((player) => player.ws === ws)
      );
      if (game && game.board[data.index] === null) {
        game.board[data.index] = data.player;
        const nextPlayer = data.player === "X" ? "O" : "X";
        console.log(`Player ${data.player} moved to index ${data.index}`);
        game.players.forEach((player) =>
          player.ws.send(
            JSON.stringify({
              type: "update",
              board: game.board,
              currentPlayer: nextPlayer,
            })
          )
        );
      }
    } else if (data.type === "reset") {
      const game = Object.values(activeGames).find((game) =>
        game.players.some((player) => player.ws === ws)
      );
      if (game) {
        game.board = Array(9).fill(null);
        console.log("Game reset");
        game.players.forEach((player) =>
          player.ws.send(JSON.stringify({ type: "reset", board: game.board }))
        );
      }
    } else if (data.type === "win") {
      const game = Object.values(activeGames).find((game) =>
        game.players.some((player) => player.ws === ws)
      );
      if (game) {
        const winner = game.players.find(
          (player) => player.symbol === data.player
        );
        console.log(`Player ${winner.name} won the game`);
        db.run(
          "INSERT INTO players (name, wins) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET wins = wins + 1",
          [winner.name],
          (err) => {
            if (err) {
              console.error("Error updating database:", err.message);
            } else {
              console.log(`Player ${winner.name} wins updated in database`);
              broadcastLeaderboard(); // Обновляем топ-10 игроков после победы
            }
          }
        );
      }
    } else if (data.type === "leave") {
      const playerIndex = waitingPlayers.findIndex(
        (player) => player.ws === ws
      );
      if (playerIndex !== -1) {
        const leavingPlayer = waitingPlayers.splice(playerIndex, 1)[0];
        console.log(`Player ${leavingPlayer.name} left the queue`);
      }
    }
  });

  ws.on("close", () => {
    const playerIndex = waitingPlayers.findIndex((player) => player.ws === ws);
    if (playerIndex !== -1) {
      const disconnectedPlayer = waitingPlayers.splice(playerIndex, 1)[0];
      console.log(`Player ${disconnectedPlayer.name} disconnected`);
    } else {
      const gameId = Object.keys(activeGames).find((id) =>
        activeGames[id].players.some((player) => player.ws === ws)
      );
      if (gameId) {
        const game = activeGames[gameId];
        const disconnectedPlayer = game.players.find(
          (player) => player.ws === ws
        );
        console.log(`Player ${disconnectedPlayer.name} disconnected`);
        game.players.forEach((player) =>
          player.ws.send(JSON.stringify({ type: "opponentDisconnected" }))
        );
        delete activeGames[gameId];
      }
    }
    onlinePlayers = onlinePlayers.filter((player) => player.ws !== ws);
    broadcastOnlinePlayers();
  });
});

function broadcastOnlinePlayers() {
  const onlinePlayersData = onlinePlayers.map((player) => ({
    name: player.name,
  }));
  onlinePlayers.forEach((player) =>
    player.ws.send(
      JSON.stringify({
        type: "onlinePlayers",
        onlinePlayers: onlinePlayersData,
      })
    )
  );
}

app.use(express.static("public"));

server.listen(process.env.PORT || 3000, () => {
  console.log(`Server started on port ${server.address().port}`);
});
