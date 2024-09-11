const ws = new WebSocket(`wss://${window.location.host}`);
const board = document.getElementById("board");
const statusElement = document.getElementById("status");
const playerInfoElement = document.getElementById("player-info");
const currentTurnElement = document.getElementById("current-turn");
let player;
let currentPlayer = "X";

const playerNameElement = document.getElementById("player-name");

let playerName = getCookie("playerName");
if (!playerName || playerName === "null") {
  playerName = prompt("Введите ваше имя:");
  while (!playerName || playerName.trim() === "") {
    playerName = prompt("Имя не может быть пустым. Введите ваше имя:");
  }
  setCookie("playerName", playerName, 365);
}

playerNameElement.textContent = `Ваше имя: ${playerName}`;

ws.onopen = () => {
  console.log("Connected to server");
  ws.send(JSON.stringify({ type: "join", name: playerName }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "init") {
    player = data.player;
    currentPlayer = "X";
    playerInfoElement.textContent = `Ваш символ: ${player}`;
    statusElement.textContent = `Игра началась! Противник: ${data.opponentName}`;
    updateBoard(data.board);
    currentTurnElement.textContent = `Сейчас ходит: ${currentPlayer}`;
    console.log(`Player initialized as ${player}`);
  } else if (data.type === "update") {
    updateBoard(data.board);
    currentPlayer = data.currentPlayer;
    checkWinner(data.board);
    currentTurnElement.textContent = `Сейчас ходит: ${currentPlayer}`;
    console.log("Board updated");
  } else if (data.type === "reset") {
    resetBoard();
    statusElement.textContent = "Игра началась!";
    console.log("Board reset");
  } else if (data.type === "opponentDisconnected") {
    statusElement.textContent =
      "Противник отключился. Ожидание нового противника...";
    console.log("Opponent disconnected");
  }
};

ws.onclose = () => {
  console.log("Disconnected from server");
};

function updateBoard(boardState) {
  board.innerHTML = "";
  boardState.forEach((cell, index) => {
    const cellElement = document.createElement("div");
    cellElement.className = "cell";
    cellElement.textContent = cell;
    cellElement.addEventListener("click", () => makeMove(index));
    cellElement.addEventListener("touchstart", () => makeMove(index));
    board.appendChild(cellElement);
  });
}

function makeMove(index) {
  if (player === currentPlayer && !board.children[index].textContent) {
    ws.send(JSON.stringify({ type: "move", index, player }));
    console.log(`Player ${player} moved to index ${index}`);
  }
}

function checkWinner(boardState) {
  const winningCombinations = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // горизонтальные
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // вертикальные
    [0, 4, 8],
    [2, 4, 6], // диагональные
  ];

  for (const combination of winningCombinations) {
    const [a, b, c] = combination;
    if (
      boardState[a] &&
      boardState[a] === boardState[b] &&
      boardState[a] === boardState[c]
    ) {
      alert(`Игрок ${boardState[a]} выиграл!`);
      ws.send(JSON.stringify({ type: "reset" }));
      console.log(`Player ${boardState[a]} won`);
      return;
    }
  }

  if (!boardState.includes(null)) {
    alert("Ничья!");
    ws.send(JSON.stringify({ type: "reset" }));
    console.log("Game ended in a draw");
  }
}

function resetBoard() {
  board.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const cellElement = document.createElement("div");
    cellElement.className = "cell";
    cellElement.addEventListener("click", () => makeMove(i));
    cellElement.addEventListener("touchstart", () => makeMove(i));
    board.appendChild(cellElement);
  }
  currentTurnElement.textContent = `Сейчас ходит: ${currentPlayer}`;
  console.log("Board reset");
}

function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = "expires=" + d.toUTCString();
  document.cookie =
    name + "=" + encodeURIComponent(value) + ";" + expires + ";path=/";
}

function getCookie(name) {
  const cname = name + "=";
  const decodedCookie = decodeURIComponent(document.cookie);
  const ca = decodedCookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i].trim();
    if (c.indexOf(cname) === 0) {
      return decodeURIComponent(c.substring(cname.length, c.length));
    }
  }
  return "";
}
