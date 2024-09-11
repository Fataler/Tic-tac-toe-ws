const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let waitingPlayers = [];
let activeGames = {};

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    const data = JSON.parse(message);
    if (data.type === "join") {
      if (data.name && !waitingPlayers.some((player) => player.name === data.name)) {
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
            id: gameId,
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
          console.log(`Game started between ${player1.name} and ${player2.name}`);
        }
      } else {
        ws.send(JSON.stringify({ type: "full" }));
        ws.close();
        console.log("Connection refused: name is missing or name is already taken");
      }
    } else if (data.type === "move") {
      const game = Object.values(activeGames).find((game) =>
        game.players.some((player) => player.ws === ws)
      );
      if (game && game.board[data.index] === null) {
        game.board[data.index] = data.player;
        const nextPlayer = data.player === "X" ? "O" : "X";
        console.log(`${game.id} | Player ${data.player} moved to index ${data.index}`);
        game.players.forEach((player) =>
          player.ws.send(
            JSON.stringify({ type: "update", board: game.board, currentPlayer: nextPlayer })
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
        const disconnectedPlayer = game.players.find((player) => player.ws === ws);
        console.log(`Player ${disconnectedPlayer.name} disconnected`);
        game.players.forEach((player) =>
          player.ws.send(JSON.stringify({ type: "opponentDisconnected" }))
        );
        delete activeGames[gameId];
      }
    }
  });
});

app.use(express.static("public"));

server.listen(process.env.PORT || 3000, () => {
  console.log(`Server started on port ${server.address().port}`);
});
