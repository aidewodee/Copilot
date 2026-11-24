import "./style.css";
import type Peer from "peerjs";
import type { DataConnection } from "peerjs";

type Point = { x: number; y: number };

type Enemy = Point & {
  radius: number;
  angle: number;
  health: number;
  maxHealth: number;
  speed: number;
  hitFlash: number;
  fireCooldown: number;
};

type Rocket = Point & {
  z: number;
  vx: number;
  vy: number;
  vz: number;
  angle: number;
  life: number;
  explosive: boolean;
  owner: "player" | "opponent" | "enemy";
};

type RemoteInput = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  shooting: boolean;
  angle: number;
  pitch: number;
};

type PlayerSnapshot = Point & { angle: number };
type MatchSnapshot = {
  type: "snapshot";
  hostPlayer: PlayerSnapshot;
  guestPlayer: PlayerSnapshot;
  hostHealth: number;
  guestHealth: number;
  hostKills: number;
  guestKills: number;
  rockets: Rocket[];
};

type Particle = Point & {
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
};

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("The page is missing its #app main element.");

app.innerHTML = `
  <section class="game-shell" aria-label="Rocket Rally arena">
    <h1 class="sr-only">Rocket Rally</h1>
    <p class="sr-only">Drive a combat car and destroy every rival vehicle with rockets.</p>
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"><span></span></div>
        <strong>ROCKET RALLY</strong>
      </div>
      <div class="scoreboard" aria-label="Match status">
        <div><span class="label">SCORE</span><strong id="score">0000</strong></div>
        <div class="divider"></div>
        <div><span class="label">BEST</span><strong id="best">0000</strong></div>
        <div class="divider"></div>
        <div><span id="levelLabel" class="label">LEVEL</span><strong id="level">1/5</strong></div>
      </div>
      <button id="pauseButton" class="pause-button" type="button" aria-label="Pause game">Ⅱ</button>
    </header>

    <div class="arena-wrap">
      <canvas id="game" width="1280" height="720" aria-label="3D rocket car battle arena"></canvas>
      <div class="crosshair" aria-hidden="true"><span></span><span></span></div>

      <aside class="weapon-panel" aria-label="Weapon status">
        <span class="weapon-icon" aria-hidden="true">
          <i></i><i></i><i></i>
        </span>
        <div>
          <span class="label">ROCKETS</span>
          <strong id="ammo">READY</strong>
        </div>
      </aside>

      <div class="health-panel" aria-label="Vehicle health">
        <span class="label">ARMOR</span>
        <div class="health-track"><div id="healthBar" class="health-bar"></div></div>
        <strong id="healthText">100</strong>
      </div>
      <div id="opponentPanel" class="opponent-panel" aria-label="Opponent health" hidden>
        <span class="label">RIVAL ARMOR</span>
        <div class="health-track"><div id="opponentHealthBar" class="health-bar"></div></div>
        <strong id="opponentHealthText">100</strong>
      </div>

      <div id="message" class="game-message" role="status" aria-live="polite">
        <span id="messageKicker">READY?</span>
        <strong id="messageTitle">ROCKET RALLY</strong>
        <p id="messageText">Choose how you want to play.</p>
        <div id="modeChoices" class="mode-choices" aria-label="Choose a game mode">
          <button id="tutorialModeButton" type="button"><strong>TUTORIAL</strong><span>Learn the five levels</span></button>
          <button id="campaignModeButton" type="button"><strong>SOLO CAMPAIGN</strong><span>Play all five levels</span></button>
          <button id="multiplayerModeButton" type="button"><strong>VERSUS MULTIPLAYER</strong><span>Challenge a friend online</span></button>
        </div>
        <section id="onlinePanel" class="online-panel" aria-label="Online match" hidden>
          <button id="hostRoomButton" type="button">CREATE ROOM</button>
          <label for="roomCodeInput">ROOM CODE</label>
          <div class="room-join">
            <input id="roomCodeInput" type="text" autocomplete="off" spellcheck="false" aria-label="Room code" placeholder="Enter your friend's code">
            <button id="joinRoomButton" type="button">JOIN</button>
          </div>
          <p id="networkStatus" role="status" aria-live="polite">Create a room or enter a friend's code.</p>
          <div id="invitePanel" class="invite-panel" hidden>
            <label for="inviteLinkInput">INVITE LINK</label>
            <div class="room-join">
              <input id="inviteLinkInput" type="text" readonly aria-label="Invite link">
              <button id="copyInviteButton" type="button">COPY</button>
            </div>
          </div>
          <button id="backToModesButton" class="secondary-button" type="button">BACK</button>
        </section>
        <div id="carChoices" class="car-choices" aria-label="Choose a car">
          <button type="button" data-car="double">
            <strong>DOUBLE</strong>
            <span>Two rocket guns</span>
          </button>
          <button type="button" data-car="boom">
            <strong>BOOM</strong>
            <span>Explosive rockets</span>
          </button>
          <button type="button" data-car="circle">
            <strong>FOURWAY</strong>
            <span>Four-way rockets, +50% attack speed</span>
          </button>
        </div>
        <button id="startButton" type="button">START ENGINE</button>
      </div>
    </div>

    <footer class="controls">
      <div><span class="key-grid"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>DRIVE</span></div>
      <div><kbd class="wide-key">SPACE</kbd><span>HOLD TO FIRE</span></div>
      <div><span class="mouse-icon" aria-hidden="true"></span><span>AIM UP/DOWN</span></div>
    </footer>
  </section>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("The page is missing its #game canvas.");
const context = canvas.getContext("2d");
if (!context) throw new Error("Canvas 2D rendering is unavailable.");
const gameCanvas = canvas;
const gameContext = context;

const scoreElement = document.querySelector<HTMLElement>("#score")!;
const bestElement = document.querySelector<HTMLElement>("#best")!;
const ammoElement = document.querySelector<HTMLElement>("#ammo")!;
const healthBar = document.querySelector<HTMLElement>("#healthBar")!;
const healthText = document.querySelector<HTMLElement>("#healthText")!;
const levelElement = document.querySelector<HTMLElement>("#level")!;
const levelLabel = document.querySelector<HTMLElement>("#levelLabel")!;
const opponentPanel = document.querySelector<HTMLElement>("#opponentPanel")!;
const opponentHealthBar = document.querySelector<HTMLElement>("#opponentHealthBar")!;
const opponentHealthText = document.querySelector<HTMLElement>("#opponentHealthText")!;
const message = document.querySelector<HTMLElement>("#message")!;
const messageKicker = document.querySelector<HTMLElement>("#messageKicker")!;
const messageTitle = document.querySelector<HTMLElement>("#messageTitle")!;
const messageText = document.querySelector<HTMLElement>("#messageText")!;
const startButton = document.querySelector<HTMLButtonElement>("#startButton")!;
const pauseButton = document.querySelector<HTMLButtonElement>("#pauseButton")!;
const carChoices = document.querySelector<HTMLElement>("#carChoices")!;
const modeChoices = document.querySelector<HTMLElement>("#modeChoices")!;
const onlinePanel = document.querySelector<HTMLElement>("#onlinePanel")!;
const networkStatus = document.querySelector<HTMLElement>("#networkStatus")!;
const roomCodeInput = document.querySelector<HTMLInputElement>("#roomCodeInput")!;
const invitePanel = document.querySelector<HTMLElement>("#invitePanel")!;
const inviteLinkInput = document.querySelector<HTMLInputElement>("#inviteLinkInput")!;
const hostRoomButton = document.querySelector<HTMLButtonElement>("#hostRoomButton")!;
const joinRoomButton = document.querySelector<HTMLButtonElement>("#joinRoomButton")!;

const keys = new Set<string>();
let state: "menu" | "ready" | "tutorialReady" | "playing" | "paused" | "choosing" | "won" | "lost" =
  "menu";
let gameMode: "campaign" | "tutorial" | "multiplayer" = "campaign";
let score = 0;
let best = Number(localStorage.getItem("rocket-rally-best") ?? 0);
let health = 100;
let rocketCooldown = 0;
let shooting = false;
let lastTime = performance.now();
let shake = 0;
let level = 1;
let opponentHealth = 100;
let hostKills = 0;
let guestKills = 0;
let opponentRocketCooldown = 0;
let remoteInput: RemoteInput = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  shooting: false,
  angle: Math.PI / 2,
  pitch: Math.PI / 9,
};
let peer: Peer | null = null;
let connection: DataConnection | null = null;
let networkRole: "host" | "guest" | null = null;
let networkTimer = 0;
const cameraOrbitDistance = 560;
const cameraTargetHeight = 24;
const cameraLookHeight = cameraTargetHeight + 32;
const cameraCollisionRadius = 18;
const rocketFloorHeight = 8;
const minimumCameraPitch = Math.asin(
  (cameraCollisionRadius - cameraTargetHeight) / cameraOrbitDistance,
);
type CarType =
  | "standard"
  | "double"
  | "boom"
  | "circle"
  | "quadruple"
  | "double-triple"
  | "eight-way"
  | "double-four-way"
  | "double-boom"
  | "sniper";
let carType: CarType = "standard";

const player = { x: 640, y: 560, angle: -Math.PI / 2, radius: 27, speed: 0 };
const camera = { x: player.x, y: player.y };
const remotePlayer = { x: 700, y: 560, angle: Math.PI / 2, radius: 27, speed: 0 };
let cameraAngle = player.angle;
let cameraPitch = Math.PI / 9;
const projection = {
  cameraX: 0,
  cameraY: 0,
  forwardX: 0,
  forwardY: 0,
  sideX: 0,
  sideY: 0,
  pitchCos: 0,
  pitchSin: 0,
  cameraHeight: 0,
};
let enemies: Enemy[] = [
  {
    x: 640,
    y: 150,
    radius: 25,
    angle: 0,
    health: 2,
    maxHealth: 2,
    speed: 67,
    hitFlash: 0,
    fireCooldown: 1,
  },
];
let rockets: Rocket[] = [];
let particles: Particle[] = [];

bestElement.textContent = best.toString().padStart(4, "0");

function createEnemies() {
  const spawnPoints: Array<[number, number]> = [
    [640, 150],
    [350, 150],
    [930, 150],
    [250, 140],
    [640, 110],
    [1030, 140],
    [250, 450],
    [1030, 450],
    [180, 120],
    [500, 120],
    [820, 120],
    [1100, 240],
    [900, 500],
  ];
  const enemyHealth = (2 + level) * 2;
  return spawnPoints.slice(0, level).map(([x, y], index) => ({
    x,
    y,
    radius: 25,
    angle: 0,
    health: enemyHealth,
    maxHealth: enemyHealth,
    speed: 55 + level * 12 + index * 3,
    hitFlash: 0,
    fireCooldown: 0.9 + index * 0.3,
  }));
}

const tutorialLessons = [
  "Lesson 1: Drive with W, A, S, D or the arrow keys. Move around the arena to avoid incoming fire.",
  "Lesson 2: Aim with your mouse. Hold Space or the left mouse button to fire rockets at the crosshair.",
  "Lesson 3: Keep moving while you fight. Your chosen weapon can help control the arena.",
  "Lesson 4: The arena gets tougher. Watch your armor and use your chosen weapon to control distance.",
  "Lesson 5: Face the final wave. Keep aiming, dodging, and firing until the arena is clear.",
];

function showMenu() {
  clearInputs();
  state = "menu";
  connection?.close();
  peer?.destroy();
  connection = null;
  peer = null;
  networkRole = null;
  gameMode = "campaign";
  messageKicker.textContent = "READY?";
  messageTitle.textContent = "ROCKET RALLY";
  messageText.textContent = "Choose how you want to play.";
  modeChoices.hidden = false;
  onlinePanel.hidden = true;
  carChoices.classList.remove("visible");
  startButton.hidden = true;
  pauseButton.hidden = true;
  opponentPanel.hidden = true;
  hostRoomButton.disabled = false;
  joinRoomButton.disabled = false;
  roomCodeInput.value = "";
  inviteLinkInput.value = "";
  networkStatus.textContent = "Create a room or enter a friend's code.";
  invitePanel.hidden = true;
  message.classList.add("visible");
  updateHud();
}

function showTutorialIntro() {
  state = "tutorialReady";
  messageKicker.textContent = `TUTORIAL · LEVEL ${level} OF 5`;
  messageTitle.textContent = "YOUR NEXT LESSON";
  const lesson = tutorialLessons[level - 1];
  if (!lesson) throw new Error(`No tutorial lesson is defined for level ${level}.`);
  messageText.textContent = lesson;
  startButton.hidden = false;
  startButton.textContent = "BEGIN LESSON";
  modeChoices.hidden = true;
  onlinePanel.hidden = true;
  carChoices.classList.remove("visible");
  message.classList.add("visible");
}

function showOnlinePanel() {
  modeChoices.hidden = true;
  onlinePanel.hidden = false;
  messageKicker.textContent = "ONLINE VERSUS";
  messageTitle.textContent = "CHALLENGE A FRIEND";
  messageText.textContent = "Create a room and share its invite link, or join with a room code.";
  startButton.hidden = true;
  carChoices.classList.remove("visible");
  invitePanel.hidden = true;
  message.classList.add("visible");
  roomCodeInput.focus();
}

function setNetworkStatus(text: string) {
  networkStatus.textContent = text;
}

function isRemoteInput(data: unknown): data is RemoteInput {
  if (!data || typeof data !== "object") return false;
  const input = data as Partial<RemoteInput>;
  return (
    typeof input.forward === "boolean" &&
    typeof input.backward === "boolean" &&
    typeof input.left === "boolean" &&
    typeof input.right === "boolean" &&
    typeof input.shooting === "boolean" &&
    typeof input.angle === "number" &&
    Number.isFinite(input.angle) &&
    typeof input.pitch === "number" &&
    Number.isFinite(input.pitch)
  );
}

function isMatchSnapshot(data: unknown): data is MatchSnapshot {
  if (!data || typeof data !== "object") return false;
  const snapshot = data as Partial<MatchSnapshot>;
  const validPlayer = (value: unknown): value is PlayerSnapshot => {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<PlayerSnapshot>;
    return (
      typeof candidate.x === "number" &&
      Number.isFinite(candidate.x) &&
      typeof candidate.y === "number" &&
      Number.isFinite(candidate.y) &&
      typeof candidate.angle === "number" &&
      Number.isFinite(candidate.angle)
    );
  };
  return (
    snapshot.type === "snapshot" &&
    validPlayer(snapshot.hostPlayer) &&
    validPlayer(snapshot.guestPlayer) &&
    typeof snapshot.hostHealth === "number" &&
    Number.isFinite(snapshot.hostHealth) &&
    typeof snapshot.guestHealth === "number" &&
    Number.isFinite(snapshot.guestHealth) &&
    typeof snapshot.hostKills === "number" &&
    Number.isFinite(snapshot.hostKills) &&
    typeof snapshot.guestKills === "number" &&
    Number.isFinite(snapshot.guestKills) &&
    Array.isArray(snapshot.rockets) &&
    snapshot.rockets.length <= 100 &&
    snapshot.rockets.every((rocket) => {
      if (!rocket || typeof rocket !== "object") return false;
      const candidate = rocket as Partial<Rocket>;
      return (
        typeof candidate.x === "number" &&
        Number.isFinite(candidate.x) &&
        typeof candidate.y === "number" &&
        Number.isFinite(candidate.y) &&
        typeof candidate.z === "number" &&
        Number.isFinite(candidate.z) &&
        typeof candidate.vx === "number" &&
        Number.isFinite(candidate.vx) &&
        typeof candidate.vy === "number" &&
        Number.isFinite(candidate.vy) &&
        typeof candidate.vz === "number" &&
        Number.isFinite(candidate.vz) &&
        typeof candidate.angle === "number" &&
        Number.isFinite(candidate.angle) &&
        typeof candidate.life === "number" &&
        Number.isFinite(candidate.life) &&
        typeof candidate.explosive === "boolean" &&
        (candidate.owner === "player" || candidate.owner === "opponent")
      );
    })
  );
}

function receiveNetworkData(data: unknown) {
  if (!data || typeof data !== "object") return;
  const messageData = data as { type?: unknown; winner?: unknown };
  if (networkRole === "host" && isRemoteInput(data)) {
    remoteInput = {
      ...data,
      angle: Math.atan2(Math.sin(data.angle), Math.cos(data.angle)),
      pitch: Math.max(minimumCameraPitch, Math.min(Math.PI / 2, data.pitch)),
    };
  } else if (networkRole === "guest" && isMatchSnapshot(data)) {
    const ownPlayer = data.guestPlayer;
    player.x = ownPlayer.x;
    player.y = ownPlayer.y;
    player.angle = ownPlayer.angle;
    remotePlayer.x = data.hostPlayer.x;
    remotePlayer.y = data.hostPlayer.y;
    remotePlayer.angle = data.hostPlayer.angle;
    health = Math.max(0, Math.min(100, data.guestHealth));
    opponentHealth = Math.max(0, Math.min(100, data.hostHealth));
    hostKills = data.hostKills;
    guestKills = data.guestKills;
    rockets = data.rockets.filter(
      (rocket): rocket is Rocket => rocket.owner === "player" || rocket.owner === "opponent",
    );
    camera.x = player.x;
    camera.y = player.y;
    score = guestKills;
    updateHud();
  } else if (
    networkRole === "guest" &&
    messageData.type === "ended" &&
    (messageData.winner === "host" || messageData.winner === "guest")
  ) {
    showEnd(messageData.winner === networkRole);
  }
}

function listenToConnection(dataConnection: DataConnection) {
  dataConnection.on("data", receiveNetworkData);
  dataConnection.on("close", () => {
    if (state === "menu") return;
    setNetworkStatus("The other player disconnected.");
    if (state === "playing") {
      state = "lost";
      unlockPointer();
      messageKicker.textContent = "CONNECTION LOST";
      messageTitle.textContent = "MATCH ENDED";
      messageText.textContent = "Your opponent left the room.";
      startButton.hidden = false;
      startButton.textContent = "BACK TO MENU";
      message.classList.add("visible");
    }
  });
  dataConnection.on("error", (error) => {
    setNetworkStatus(`Connection error: ${error.message}`);
  });
}

function networkErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function createRoom() {
  connection?.close();
  peer?.destroy();
  networkRole = null;
  setNetworkStatus("Connecting to the PeerJS room service...");
  hostRoomButton.disabled = true;
  try {
    const PeerConstructor = (await import("peerjs")).default;
    if (onlinePanel.hidden || gameMode !== "multiplayer") return;
    const newPeer = new PeerConstructor();
    peer = newPeer;
    newPeer.on("open", (id) => {
      roomCodeInput.value = id;
      const inviteUrl = new URL(window.location.href);
      inviteUrl.searchParams.set("room", id);
      inviteLinkInput.value = inviteUrl.toString();
      invitePanel.hidden = false;
      hostRoomButton.disabled = true;
      setNetworkStatus("Room is ready. Share the link or room code with one friend.");
    });
    newPeer.on("connection", (incoming) => {
      if (connection) {
        incoming.close();
        return;
      }
      connection = incoming;
      networkRole = "host";
      listenToConnection(incoming);
      incoming.on("open", () => startMultiplayerMatch("host"));
    });
    newPeer.on("error", (error) => {
      setNetworkStatus(`Could not create room: ${error.message}`);
      hostRoomButton.disabled = false;
    });
  } catch (error) {
    setNetworkStatus(`Could not create room: ${networkErrorMessage(error)}`);
    hostRoomButton.disabled = false;
  }
}

async function joinRoom() {
  const roomId = roomCodeInput.value.trim();
  if (!roomId) {
    setNetworkStatus("Enter the room code your friend shared.");
    roomCodeInput.focus();
    return;
  }
  connection?.close();
  peer?.destroy();
  networkRole = null;
  setNetworkStatus("Connecting to your friend's room...");
  joinRoomButton.disabled = true;
  try {
    const PeerConstructor = (await import("peerjs")).default;
    if (onlinePanel.hidden || gameMode !== "multiplayer") return;
    const newPeer = new PeerConstructor();
    peer = newPeer;
    newPeer.on("open", () => {
      const outgoing = newPeer.connect(roomId, { reliable: true });
      connection = outgoing;
      listenToConnection(outgoing);
      outgoing.on("open", () => {
        startMultiplayerMatch("guest");
      });
    });
    newPeer.on("error", (error) => {
      setNetworkStatus(`Could not join room: ${error.message}`);
      joinRoomButton.disabled = false;
    });
  } catch (error) {
    setNetworkStatus(`Could not join room: ${networkErrorMessage(error)}`);
    joinRoomButton.disabled = false;
  }
}

function startMultiplayerMatch(role: "host" | "guest") {
  resetGame();
  gameMode = "multiplayer";
  networkRole = role;
  state = "playing";
  enemies = [];
  player.x = role === "host" ? 510 : 770;
  player.y = 560;
  player.angle = role === "host" ? 0 : Math.PI;
  cameraAngle = player.angle;
  remotePlayer.x = role === "host" ? 770 : 510;
  remotePlayer.y = 560;
  remotePlayer.angle = role === "host" ? Math.PI : 0;
  opponentHealth = 100;
  hostKills = 0;
  guestKills = 0;
  networkTimer = 0;
  remoteInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    shooting: false,
    angle: remotePlayer.angle,
    pitch: Math.PI / 9,
  };
  rockets = [];
  opponentPanel.hidden = false;
  pauseButton.hidden = true;
  modeChoices.hidden = true;
  onlinePanel.hidden = true;
  startButton.hidden = true;
  message.classList.remove("visible");
  setNetworkStatus("Connected. Battle your opponent!");
  gameCanvas.focus();
  updateHud();
}

function sendNetworkMessage(data: RemoteInput | MatchSnapshot | { type: "ended"; winner: string }) {
  if (connection?.open) void connection.send(data);
}

function finishMultiplayerMatch(winner: "host" | "guest") {
  if (state !== "playing") return;
  sendNetworkMessage({ type: "ended", winner });
  showEnd(winner === networkRole);
}

function clearInputs() {
  keys.clear();
  shooting = false;
  if (networkRole === "guest") {
    sendNetworkMessage({
      forward: false,
      backward: false,
      left: false,
      right: false,
      shooting: false,
      angle: cameraAngle,
      pitch: cameraPitch,
    });
  }
}

function resetGame() {
  clearInputs();
  score = 0;
  health = 100;
  shake = 0;
  player.x = 640;
  player.y = 560;
  player.angle = -Math.PI / 2;
  player.speed = 0;
  remotePlayer.speed = 0;
  camera.x = player.x;
  camera.y = player.y;
  cameraAngle = player.angle;
  cameraPitch = Math.PI / 9;
  rockets = [];
  particles = [];
  enemies = createEnemies();
  opponentHealth = 100;
  updateHud();
}

function startGame() {
  resetGame();
  modeChoices.hidden = true;
  onlinePanel.hidden = true;
  opponentPanel.hidden = true;
  pauseButton.textContent = "Ⅱ";
  pauseButton.hidden = false;
  if (gameMode === "tutorial") {
    showTutorialIntro();
  } else {
    state = "playing";
    startButton.hidden = true;
    message.classList.remove("visible");
  }
  gameCanvas.focus();
}

function updateHud() {
  scoreElement.textContent =
    gameMode === "multiplayer"
      ? String(networkRole === "guest" ? guestKills : hostKills).padStart(4, "0")
      : score.toString().padStart(4, "0");
  levelLabel.textContent = gameMode === "multiplayer" ? "WINS" : "LEVEL";
  levelElement.textContent =
    gameMode === "multiplayer" ? `${hostKills} - ${guestKills}` : `${level}/5`;
  healthText.textContent = Math.max(0, Math.ceil(health)).toString();
  healthBar.style.width = `${Math.max(0, health)}%`;
  opponentHealthText.textContent = Math.max(0, Math.ceil(opponentHealth)).toString();
  opponentHealthBar.style.width = `${Math.max(0, opponentHealth)}%`;
  ammoElement.textContent = rocketCooldown <= 0 ? "READY" : "RELOAD";
  if (score > best) {
    best = score;
    bestElement.textContent = best.toString().padStart(4, "0");
  }
}

function showCarChoices(
  kicker: string,
  title: string,
  description: string,
  choices: Array<{ id: CarType; name: string; detail: string }>,
) {
  state = "choosing";
  messageKicker.textContent = kicker;
  messageTitle.textContent = title;
  messageText.textContent = description;
  startButton.hidden = true;
  carChoices.innerHTML = choices
    .map(
      ({ id, name, detail }) =>
        `<button type="button" data-car="${id}"><strong>${name}</strong><span>${detail}</span></button>`,
    )
    .join("");
  carChoices.classList.add("visible");
  message.classList.add("visible");
}

function showEnd(won: boolean) {
  clearInputs();
  state = won ? "won" : "lost";
  unlockPointer();
  localStorage.setItem("rocket-rally-best", best.toString());
  carChoices.classList.remove("visible");

  if (gameMode === "multiplayer") {
    messageKicker.textContent = won ? "VICTORY" : "DEFEAT";
    messageTitle.textContent = won ? "YOU WIN" : "YOU LOSE";
    messageText.textContent = "The versus match is over.";
    startButton.hidden = false;
    startButton.textContent = "BACK TO MENU";
    message.classList.add("visible");
    return;
  }

  if (gameMode === "tutorial" && won && level === 5) {
    messageKicker.textContent = "TUTORIAL COMPLETE";
    messageTitle.textContent = "VICTORY";
    messageText.textContent = "You completed all five lessons.";
    startButton.hidden = false;
    startButton.textContent = "BACK TO MENU";
    message.classList.add("visible");
    return;
  }

  if (won && level === 2 && carType === "standard") {
    showCarChoices(
      "LEVEL 2 COMPLETE",
      "CHOOSE A CAR",
      "Pick a weapon system for levels 3, 4, and 5.",
      [
        { id: "double", name: "DOUBLE", detail: "Two forward rocket guns" },
        { id: "boom", name: "BOOM", detail: "Rockets explode on impact" },
        { id: "circle", name: "FOURWAY", detail: "Four-way guns, +50% attack speed" },
      ],
    );
  } else if (won && level === 4) {
    const upgrades: Record<
      "double" | "boom" | "circle",
      Array<{ id: CarType; name: string; detail: string }>
    > = {
      double: [
        { id: "quadruple", name: "QUADRUPLE", detail: "Four forward rockets at once" },
        { id: "double-triple", name: "DOUBLE TRIPLE", detail: "Three forward and three backward" },
      ],
      boom: [
        { id: "double-boom", name: "DOUBLE BOOM", detail: "Two explosive rockets at once" },
        { id: "sniper", name: "SNIPER", detail: "Explosive rockets, +200% speed, faster fire" },
      ],
      circle: [
        { id: "eight-way", name: "EIGHTWAY", detail: "Eight directions, +50% attack speed" },
        {
          id: "double-four-way",
          name: "DOUBLE FOURWAY",
          detail: "Two rockets per direction, +50% attack speed",
        },
      ],
    };
    if (carType === "double" || carType === "boom" || carType === "circle") {
      showCarChoices(
        "LEVEL 4 COMPLETE",
        "CHOOSE AN UPGRADE",
        "Select an upgrade for the level 5 boss.",
        upgrades[carType],
      );
    }
  } else if (won && level < 5) {
    messageKicker.textContent = `LEVEL ${level} COMPLETE`;
    messageTitle.textContent = "VICTORY";
    messageText.textContent = `${score} points — prepare for level ${level + 1}.`;
    startButton.hidden = false;
    startButton.textContent = "NEXT LEVEL";
  } else if (won) {
    messageKicker.textContent =
      gameMode === "tutorial" ? "TUTORIAL COMPLETE" : "ALL 5 LEVELS CLEARED";
    messageTitle.textContent = "VICTORY";
    messageText.textContent =
      gameMode === "tutorial"
        ? "You completed all five lessons."
        : `${score} points — you conquered the arena.`;
    startButton.hidden = false;
    startButton.textContent = gameMode === "tutorial" ? "BACK TO MENU" : "PLAY AGAIN";
  } else {
    messageKicker.textContent = "VEHICLE DISABLED";
    messageTitle.textContent = "WRECKED";
    messageText.textContent = "Your armor gave out. Try this level again.";
    startButton.hidden = false;
    startButton.textContent = "RACE AGAIN";
  }
  message.classList.add("visible");
}

function spawnBurst(x: number, y: number, color: string, count = 14) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 220;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.55,
      size: 3 + Math.random() * 7,
      color,
    });
  }
  if (particles.length > 240) particles.splice(0, particles.length - 240);
}

function fireRocket() {
  if (rocketCooldown > 0 || state !== "playing" || networkRole === "guest") return;
  const angle = cameraAngle;
  const isExplosive = ["boom", "double-boom", "sniper"].includes(carType);
  const rocketSpeed = 520 * (carType === "sniper" ? 3 : 1);
  const aimRange = 450;
  const forwardRange = 34 + aimRange;
  const targetX = player.x + Math.cos(angle) * forwardRange;
  const targetY = player.y + Math.sin(angle) * forwardRange;
  const targetZ = cameraLookHeight - Math.tan(cameraPitch) * forwardRange;
  const addRocket = (direction: number, lateralOffset = 0, explosive = isExplosive) => {
    const sideX = -Math.sin(direction);
    const sideY = Math.cos(direction);
    const x = player.x + Math.cos(direction) * 34 + sideX * lateralOffset;
    const y = player.y + Math.sin(direction) * 34 + sideY * lateralOffset;
    const forwardShot = Math.cos(direction - angle) > 0.999;
    const dx = forwardShot ? targetX - x : Math.cos(direction);
    const dy = forwardShot ? targetY - y : Math.sin(direction);
    const dz = forwardShot ? targetZ - 30 : 0;
    const magnitude = Math.hypot(dx, dy, dz);
    rockets.push({
      x,
      y,
      z: 30,
      vx: (dx / magnitude) * rocketSpeed,
      vy: (dy / magnitude) * rocketSpeed,
      vz: (dz / magnitude) * rocketSpeed,
      angle: direction,
      life: 2.2,
      explosive,
      owner: "player",
    });
  };

  if (carType === "double") {
    addRocket(angle, -12);
    addRocket(angle, 12);
    rocketCooldown = 0.48;
  } else if (carType === "quadruple") {
    for (const offset of [-18, -6, 6, 18]) addRocket(angle, offset);
    rocketCooldown = 0.48;
  } else if (carType === "double-triple") {
    for (const offset of [-12, 0, 12]) {
      addRocket(angle, offset, false);
      addRocket(angle + Math.PI, offset, false);
    }
    rocketCooldown = 0.64;
  } else if (carType === "circle" || carType === "eight-way" || carType === "double-four-way") {
    const directions = carType === "eight-way" ? 8 : 4;
    for (let i = 0; i < directions; i++) {
      const direction = angle + (Math.PI * 2 * i) / directions;
      if (carType === "double-four-way") {
        addRocket(direction, -9, false);
        addRocket(direction, 9, false);
      } else {
        addRocket(direction, 0, false);
      }
    }
    rocketCooldown = 0.72 / 1.5;
  } else if (carType === "double-boom") {
    addRocket(angle, -12, true);
    addRocket(angle, 12, true);
    rocketCooldown = 0.7;
  } else if (carType === "sniper") {
    addRocket(angle, 0, true);
    rocketCooldown = 0.7 * 0.75;
  } else {
    addRocket(angle);
    rocketCooldown = carType === "boom" ? 0.7 : 0.55;
  }
  spawnBurst(player.x + Math.cos(angle) * 32, player.y + Math.sin(angle) * 32, "#f6bd2e", 5);
}

function fireOpponentRocket() {
  if (opponentRocketCooldown > 0 || !connection?.open || state !== "playing") return;
  const angle = remoteInput.angle;
  const aimRange = 450;
  const forwardRange = 34 + aimRange;
  const targetZ = cameraLookHeight - Math.tan(remoteInput.pitch) * forwardRange;
  const x = remotePlayer.x + Math.cos(angle) * 34;
  const y = remotePlayer.y + Math.sin(angle) * 34;
  const dx = remotePlayer.x + Math.cos(angle) * forwardRange - x;
  const dy = remotePlayer.y + Math.sin(angle) * forwardRange - y;
  const dz = targetZ - 30;
  const magnitude = Math.hypot(dx, dy, dz);
  const speed = 520;
  rockets.push({
    x,
    y,
    z: 30,
    vx: (dx / magnitude) * speed,
    vy: (dy / magnitude) * speed,
    vz: (dz / magnitude) * speed,
    angle,
    life: 2.2,
    explosive: false,
    owner: "opponent",
  });
  opponentRocketCooldown = 0.55;
}

function fireEnemyRocket(enemy: Enemy) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const angle = Math.atan2(dy, dx);
  const speed = 300 + level * 24;
  const flightTime = Math.hypot(dx, dy) / speed;
  rockets.push({
    x: enemy.x + Math.cos(angle) * 35,
    y: enemy.y + Math.sin(angle) * 35,
    z: 32,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    vz: (cameraTargetHeight - 32) / flightTime,
    angle,
    life: 2.5,
    explosive: false,
    owner: "enemy",
  });
  spawnBurst(enemy.x + Math.cos(angle) * 30, enemy.y + Math.sin(angle) * 30, "#ff6848", 5);
}

function explodeRocket(rocket: Rocket) {
  spawnBurst(rocket.x, rocket.y, "#ff8a32", 32);
  shake = 10;
  if (gameMode === "multiplayer") {
    if (
      rocket.owner === "player" &&
      Math.hypot(
        rocket.x - remotePlayer.x,
        rocket.y - remotePlayer.y,
        rocket.z - cameraTargetHeight,
      ) < 105
    ) {
      opponentHealth -= 35;
      if (opponentHealth <= 0) {
        if (networkRole === "host") hostKills += 1;
        else guestKills += 1;
        finishMultiplayerMatch(networkRole ?? "host");
      }
    } else if (
      rocket.owner === "opponent" &&
      Math.hypot(rocket.x - player.x, rocket.y - player.y, rocket.z - cameraTargetHeight) < 105
    ) {
      health -= 35;
      if (health <= 0) {
        if (networkRole === "host") guestKills += 1;
        else hostKills += 1;
        finishMultiplayerMatch(networkRole === "host" ? "guest" : "host");
      }
    }
  }
  for (const enemy of [...enemies]) {
    if (Math.hypot(rocket.x - enemy.x, rocket.y - enemy.y, rocket.z - cameraTargetHeight) < 105) {
      enemy.health -= 2;
      enemy.hitFlash = 0.16;
      if (enemy.health <= 0) {
        enemies.splice(enemies.indexOf(enemy), 1);
        score += 500;
        spawnBurst(enemy.x, enemy.y, "#f7bd2d", 28);
      } else {
        score += 100;
      }
    }
  }
}

function moveVehicle(
  vehicle: typeof player,
  angle: number,
  controls: Pick<RemoteInput, "forward" | "backward" | "left" | "right">,
  dt: number,
) {
  const lateral = Number(controls.right) - Number(controls.left);
  const throttle = Number(controls.forward) - Number(controls.backward);
  const forwardX = Math.cos(angle);
  const forwardY = Math.sin(angle);
  const targetSpeed = throttle * (throttle > 0 ? 230 : 150);
  vehicle.speed += (targetSpeed - vehicle.speed) * Math.min(1, dt * (throttle ? 3.6 : 2.4));
  vehicle.x += (forwardX * vehicle.speed - forwardY * lateral * 170) * dt;
  vehicle.y += (forwardY * vehicle.speed + forwardX * lateral * 170) * dt;
  vehicle.angle +=
    Math.atan2(Math.sin(angle - vehicle.angle), Math.cos(angle - vehicle.angle)) *
    Math.min(1, dt * 8);
  const margin = 42;
  vehicle.x = Math.max(margin, Math.min(gameCanvas.width - margin, vehicle.x));
  vehicle.y = Math.max(margin + 16, Math.min(gameCanvas.height - margin - 54, vehicle.y));
}

function update(dt: number) {
  if (state !== "playing") return;
  if (networkRole === "guest") {
    networkTimer += dt;
    if (networkTimer >= 0.05) {
      networkTimer = 0;
      sendNetworkMessage({
        forward: keys.has("w") || keys.has("arrowup"),
        backward: keys.has("s") || keys.has("arrowdown"),
        left: keys.has("a") || keys.has("arrowleft"),
        right: keys.has("d") || keys.has("arrowright"),
        shooting: shooting || keys.has(" "),
        angle: cameraAngle,
        pitch: cameraPitch,
      });
    }
    return;
  }

  rocketCooldown = Math.max(0, rocketCooldown - dt);
  opponentRocketCooldown = Math.max(0, opponentRocketCooldown - dt);
  if (shooting || keys.has(" ")) fireRocket();
  shake = Math.max(0, shake - dt * 20);

  moveVehicle(
    player,
    cameraAngle,
    {
      forward: keys.has("w") || keys.has("arrowup"),
      backward: keys.has("s") || keys.has("arrowdown"),
      left: keys.has("a") || keys.has("arrowleft"),
      right: keys.has("d") || keys.has("arrowright"),
    },
    dt,
  );
  if (networkRole === "host") {
    moveVehicle(remotePlayer, remoteInput.angle, remoteInput, dt);
    if (remoteInput.shooting) fireOpponentRocket();
  }

  camera.x = player.x;
  camera.y = player.y;

  for (const enemy of enemies) {
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    enemy.fireCooldown -= dt;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const enemyDistance = Math.max(1, Math.hypot(dx, dy));
    enemy.angle = Math.atan2(dy, dx);
    if (enemyDistance > 145) {
      enemy.x += (dx / enemyDistance) * enemy.speed * dt;
      enemy.y += (dy / enemyDistance) * enemy.speed * dt;
    } else if (enemyDistance < 105) {
      enemy.x -= (dx / enemyDistance) * enemy.speed * 0.55 * dt;
      enemy.y -= (dy / enemyDistance) * enemy.speed * 0.55 * dt;
    }
    if (enemyDistance < player.radius + enemy.radius + 7) {
      health -= 8 * dt;
      shake = Math.max(shake, 2);
      if (health <= 0) showEnd(false);
    }
    if (enemy.fireCooldown <= 0) {
      fireEnemyRocket(enemy);
      enemy.fireCooldown = Math.max(0.7, 1.8 - level * 0.18);
    }
  }

  for (const rocket of rockets) {
    rocket.x += rocket.vx * dt;
    rocket.y += rocket.vy * dt;
    rocket.z += rocket.vz * dt;
    rocket.life -= dt;
  }

  for (const rocket of [...rockets]) {
    if (rocket.life <= 0) {
      if (rocket.owner !== "enemy" && rocket.explosive) explodeRocket(rocket);
      else spawnBurst(rocket.x, rocket.y, "#9ba6a8", 8);
      rockets.splice(rockets.indexOf(rocket), 1);
      continue;
    }
    rocket.angle = Math.atan2(rocket.vy, rocket.vx);
    const hitFloor = rocket.z <= rocketFloorHeight;
    if (hitFloor) rocket.z = rocketFloorHeight;
    if (rocket.owner === "enemy" || (gameMode === "multiplayer" && rocket.owner === "opponent")) {
      if (
        Math.hypot(rocket.x - player.x, rocket.y - player.y, rocket.z - cameraTargetHeight) <
        rocketRadius(rocket) + player.radius
      ) {
        rockets.splice(rockets.indexOf(rocket), 1);
        if (rocket.explosive) {
          explodeRocket(rocket);
        } else {
          health -= 14;
        }
        shake = 8;
        spawnBurst(rocket.x, rocket.y, "#ff6848", 22);
        if (health <= 0) {
          if (networkRole === "host") guestKills += 1;
          else hostKills += 1;
          if (gameMode === "multiplayer")
            finishMultiplayerMatch(networkRole === "host" ? "guest" : "host");
          else showEnd(false);
        }
      } else if (hitFloor) {
        rockets.splice(rockets.indexOf(rocket), 1);
        spawnBurst(rocket.x, rocket.y, "#9ba6a8", 8);
      }
      continue;
    }

    if (gameMode === "multiplayer" && rocket.owner === "player") {
      if (
        Math.hypot(
          rocket.x - remotePlayer.x,
          rocket.y - remotePlayer.y,
          rocket.z - cameraTargetHeight,
        ) <
        rocketRadius(rocket) + remotePlayer.radius
      ) {
        rockets.splice(rockets.indexOf(rocket), 1);
        if (rocket.explosive) {
          explodeRocket(rocket);
        } else {
          opponentHealth -= 14;
          if (opponentHealth <= 0) {
            if (networkRole === "host") hostKills += 1;
            else guestKills += 1;
            finishMultiplayerMatch(networkRole ?? "host");
          }
        }
        spawnBurst(rocket.x, rocket.y, "#ff6b28", 18);
        continue;
      }
      if (hitFloor) {
        rockets.splice(rockets.indexOf(rocket), 1);
        if (rocket.explosive) explodeRocket(rocket);
        else spawnBurst(rocket.x, rocket.y, "#9ba6a8", 8);
      }
      continue;
    }

    for (const enemy of [...enemies]) {
      if (
        Math.hypot(rocket.x - enemy.x, rocket.y - enemy.y, rocket.z - cameraTargetHeight) <
        rocketRadius(rocket) + enemy.radius
      ) {
        rockets.splice(rockets.indexOf(rocket), 1);
        if (rocket.explosive) {
          explodeRocket(rocket);
        } else {
          enemy.health -= 1;
          enemy.hitFlash = 0.12;
          spawnBurst(rocket.x, rocket.y, "#ff6b28", 18);
          shake = 7;
          if (enemy.health <= 0) {
            enemies.splice(enemies.indexOf(enemy), 1);
            score += 500;
            spawnBurst(enemy.x, enemy.y, "#f7bd2d", 28);
          } else {
            score += 100;
          }
        }
        break;
      }
    }
    if (hitFloor && rockets.includes(rocket)) {
      rockets.splice(rockets.indexOf(rocket), 1);
      if (rocket.explosive) explodeRocket(rocket);
      else spawnBurst(rocket.x, rocket.y, "#9ba6a8", 8);
    }
  }

  for (const particle of particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 1 - dt * 1.8;
    particle.vy *= 1 - dt * 1.8;
    particle.life -= dt;
  }
  particles = particles.filter((particle) => particle.life > 0);

  updateHud();
  if (networkRole === "host" && state === "playing") {
    networkTimer += dt;
    if (networkTimer >= 0.05) {
      networkTimer = 0;
      sendNetworkMessage({
        type: "snapshot",
        hostPlayer: { x: player.x, y: player.y, angle: player.angle },
        guestPlayer: { x: remotePlayer.x, y: remotePlayer.y, angle: remotePlayer.angle },
        hostHealth: health,
        guestHealth: opponentHealth,
        hostKills,
        guestKills,
        rockets: rockets.slice(0, 100),
      });
    }
  }
  if (gameMode !== "multiplayer" && enemies.length === 0) showEnd(true);
}

function rocketRadius(_rocket: Rocket) {
  return 8;
}

function project3d(worldX: number, worldY: number, height = 0) {
  const focalLength = 650;
  const relativeX = worldX - projection.cameraX;
  const relativeY = worldY - projection.cameraY;
  const forward = relativeX * projection.forwardX + relativeY * projection.forwardY;
  const lateral = relativeX * projection.sideX + relativeY * projection.sideY;
  const depth =
    forward * projection.pitchCos + (projection.cameraHeight - height) * projection.pitchSin;
  const cameraUp =
    forward * projection.pitchSin + (height - projection.cameraHeight) * projection.pitchCos;
  const scale = focalLength / Math.max(100, depth);
  return {
    x: gameCanvas.width / 2 + lateral * scale,
    y: gameCanvas.height / 2 - cameraUp * scale,
  };
}

function updateProjection() {
  projection.forwardX = Math.cos(cameraAngle);
  projection.forwardY = Math.sin(cameraAngle);
  projection.sideX = -projection.forwardY;
  projection.sideY = projection.forwardX;
  projection.pitchCos = Math.cos(cameraPitch);
  projection.pitchSin = Math.sin(cameraPitch);
  projection.cameraHeight = cameraLookHeight + cameraOrbitDistance * projection.pitchSin;
  const cameraHorizontalDistance = cameraOrbitDistance * projection.pitchCos;
  projection.cameraX = camera.x - projection.forwardX * cameraHorizontalDistance;
  projection.cameraY = camera.y - projection.forwardY * cameraHorizontalDistance;
}

function drawArena(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#101718";
  ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

  const corners = [
    project3d(25, 20, 0),
    project3d(1255, 20, 0),
    project3d(1255, 700, 0),
    project3d(25, 700, 0),
  ];

  ctx.fillStyle = "#1a2527";
  ctx.beginPath();
  ctx.moveTo(corners[0]!.x, corners[0]!.y);
  for (let i = 1; i < corners.length; i++) {
    const corner = corners[i];
    if (corner) ctx.lineTo(corner.x, corner.y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#4a5651";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(corners[0]!.x, corners[0]!.y);
  for (let i = 1; i < corners.length; i++) {
    const corner = corners[i];
    if (corner) ctx.lineTo(corner.x, corner.y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = "#75804a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(corners[0]!.x, corners[0]!.y);
  for (let i = 1; i < corners.length; i++) {
    const corner = corners[i];
    if (corner) ctx.lineTo(corner.x, corner.y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = "rgba(190,201,193,.055)";
  ctx.lineWidth = 1;
  for (let x = 72; x < 1255; x += 64) {
    ctx.beginPath();
    const start = project3d(x, 20, 0);
    const end = project3d(x, 700, 0);
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  for (let y = 68; y < 700; y += 64) {
    ctx.beginPath();
    const start = project3d(25, y, 0);
    const end = project3d(1255, y, 0);
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  const center = project3d(640, 360, 0);
  ctx.strokeStyle = "#53605d";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(center.x, center.y, 76, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(project3d(640, 20, 0).x, project3d(640, 20, 0).y);
  ctx.lineTo(project3d(640, 700, 0).x, project3d(640, 700, 0).y);
  ctx.moveTo(project3d(25, 360, 0).x, project3d(25, 360, 0).y);
  ctx.lineTo(project3d(1255, 360, 0).x, project3d(1255, 360, 0).y);
  ctx.stroke();

  const hazards: Point[] = [
    { x: 400, y: 300 },
    { x: 880, y: 300 },
  ];
  for (const hazard of hazards) {
    const projected = project3d(hazard.x, hazard.y, 0);
    ctx.fillStyle = "#263133";
    ctx.strokeStyle = "#4c5956";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(projected.x - 42, projected.y);
    ctx.lineTo(projected.x, projected.y - 24);
    ctx.lineTo(projected.x + 42, projected.y);
    ctx.lineTo(projected.x, projected.y + 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  playerCar: boolean,
  hitFlash = 0,
) {
  const forwardX = Math.cos(angle);
  const forwardY = Math.sin(angle);
  const sideX = -forwardY;
  const sideY = forwardX;
  const worldCorner = (length: number, width: number) => ({
    x: x + forwardX * length + sideX * width,
    y: y + forwardY * length + sideY * width,
  });
  const polygon = (
    points: [Point, Point, Point, Point],
    height: number,
  ): [Point, Point, Point, Point] => [
    project3d(points[0].x, points[0].y, height),
    project3d(points[1].x, points[1].y, height),
    project3d(points[2].x, points[2].y, height),
    project3d(points[3].x, points[3].y, height),
  ];

  const shadow = project3d(x, y, 0);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.beginPath();
  ctx.ellipse(shadow.x + 8, shadow.y + 10, 38, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  const drawWheel = (length: number, width: number) => {
    const tire = polygon(
      [
        worldCorner(length + 8, width - 5),
        worldCorner(length + 8, width + 5),
        worldCorner(length - 8, width + 5),
        worldCorner(length - 8, width - 5),
      ],
      8,
    );
    ctx.fillStyle = "#101516";
    ctx.beginPath();
    ctx.moveTo(tire[0].x, tire[0].y);
    ctx.lineTo(tire[1].x, tire[1].y);
    ctx.lineTo(tire[2].x, tire[2].y);
    ctx.lineTo(tire[3].x, tire[3].y);
    ctx.closePath();
    ctx.fill();

    const center = project3d(
      x + Math.cos(angle) * length + sideX * width,
      y + Math.sin(angle) * length + sideY * width,
      9,
    );
    ctx.fillStyle = "#75817e";
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, 3.8, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c0c8bf";
    ctx.beginPath();
    ctx.arc(center.x, center.y, 1.3, 0, Math.PI * 2);
    ctx.fill();
  };
  drawWheel(20, -21);
  drawWheel(20, 21);
  drawWheel(-21, -21);
  drawWheel(-21, 21);

  const basePoints: [Point, Point, Point, Point] = [
    worldCorner(30, -21),
    worldCorner(30, 21),
    worldCorner(-32, 21),
    worldCorner(-32, -21),
  ];
  const base = polygon(basePoints, 7);
  const top = polygon(basePoints, 28);

  ctx.fillStyle = playerCar ? "#586128" : "#652e20";
  ctx.beginPath();
  ctx.moveTo(base[0].x, base[0].y);
  ctx.lineTo(base[1].x, base[1].y);
  ctx.lineTo(top[1].x, top[1].y);
  ctx.lineTo(top[0].x, top[0].y);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(base[1].x, base[1].y);
  ctx.lineTo(base[2].x, base[2].y);
  ctx.lineTo(top[2].x, top[2].y);
  ctx.lineTo(top[1].x, top[1].y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = hitFlash > 0 ? "#fff2a8" : playerCar ? "#a5b84a" : "#c15a38";
  ctx.beginPath();
  ctx.moveTo(top[0].x, top[0].y);
  ctx.lineTo(top[1].x, top[1].y);
  ctx.lineTo(top[2].x, top[2].y);
  ctx.lineTo(top[3].x, top[3].y);
  ctx.closePath();
  ctx.fill();

  const hood = polygon(
    [worldCorner(30, -17), worldCorner(30, 17), worldCorner(4, 17), worldCorner(4, -17)],
    31,
  );
  ctx.fillStyle = hitFlash > 0 ? "#fff4c0" : playerCar ? "#bdcb70" : "#dc8b66";
  ctx.beginPath();
  ctx.moveTo(hood[0].x, hood[0].y);
  ctx.lineTo(hood[1].x, hood[1].y);
  ctx.lineTo(hood[2].x, hood[2].y);
  ctx.lineTo(hood[3].x, hood[3].y);
  ctx.closePath();
  ctx.fill();

  const cabinBase = polygon(
    [worldCorner(4, -16), worldCorner(4, 16), worldCorner(-21, 16), worldCorner(-21, -16)],
    30,
  );
  const roof = polygon(
    [worldCorner(2, -13), worldCorner(2, 13), worldCorner(-19, 13), worldCorner(-19, -13)],
    46,
  );
  ctx.fillStyle = "#263234";
  ctx.beginPath();
  ctx.moveTo(cabinBase[0].x, cabinBase[0].y);
  ctx.lineTo(cabinBase[1].x, cabinBase[1].y);
  ctx.lineTo(roof[1].x, roof[1].y);
  ctx.lineTo(roof[0].x, roof[0].y);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cabinBase[1].x, cabinBase[1].y);
  ctx.lineTo(cabinBase[2].x, cabinBase[2].y);
  ctx.lineTo(roof[2].x, roof[2].y);
  ctx.lineTo(roof[1].x, roof[1].y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = playerCar ? "#84933b" : "#93432b";
  ctx.beginPath();
  ctx.moveTo(roof[0].x, roof[0].y);
  ctx.lineTo(roof[1].x, roof[1].y);
  ctx.lineTo(roof[2].x, roof[2].y);
  ctx.lineTo(roof[3].x, roof[3].y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#9dc4c6";
  const frontGlass = polygon(
    [worldCorner(3, -11), worldCorner(3, 11), worldCorner(-4, 11), worldCorner(-4, -11)],
    43,
  );
  ctx.beginPath();
  ctx.moveTo(frontGlass[0].x, frontGlass[0].y);
  ctx.lineTo(frontGlass[1].x, frontGlass[1].y);
  ctx.lineTo(frontGlass[2].x, frontGlass[2].y);
  ctx.lineTo(frontGlass[3].x, frontGlass[3].y);
  ctx.closePath();
  ctx.fill();

  const rearGlass = polygon(
    [worldCorner(-7, -11), worldCorner(-7, 11), worldCorner(-17, 11), worldCorner(-17, -11)],
    43,
  );
  ctx.fillStyle = "#607f82";
  ctx.beginPath();
  ctx.moveTo(rearGlass[0].x, rearGlass[0].y);
  ctx.lineTo(rearGlass[1].x, rearGlass[1].y);
  ctx.lineTo(rearGlass[2].x, rearGlass[2].y);
  ctx.lineTo(rearGlass[3].x, rearGlass[3].y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#e7edd8";
  ctx.lineWidth = 3;
  for (const width of [-13, 13]) {
    const light = project3d(worldCorner(28, width).x, worldCorner(28, width).y, 29);
    ctx.beginPath();
    ctx.moveTo(light.x - 2, light.y - 1);
    ctx.lineTo(light.x + 2, light.y + 1);
    ctx.stroke();
  }
  ctx.strokeStyle = "#e85e45";
  ctx.lineWidth = 3;
  for (const width of [-13, 13]) {
    const light = project3d(worldCorner(-29, width).x, worldCorner(-29, width).y, 20);
    ctx.beginPath();
    ctx.moveTo(light.x - 2, light.y - 1);
    ctx.lineTo(light.x + 2, light.y + 1);
    ctx.stroke();
  }

  const drawGun = (direction: number, offset = 0, explosive = false, long = false) => {
    const gunSideX = -Math.sin(angle);
    const gunSideY = Math.cos(angle);
    const start = project3d(
      x + Math.cos(direction) * 22 + gunSideX * offset,
      y + Math.sin(direction) * 22 + gunSideY * offset,
      30,
    );
    const end = project3d(
      x + Math.cos(direction) * (long ? 62 : 46) + gunSideX * offset,
      y + Math.sin(direction) * (long ? 62 : 46) + gunSideY * offset,
      30,
    );
    ctx.strokeStyle = "#182224";
    ctx.lineWidth = explosive ? 10 : 7;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.strokeStyle = "#89948b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y - 1);
    ctx.lineTo(end.x, end.y - 1);
    ctx.stroke();
    if (explosive) {
      ctx.fillStyle = "#ef6a2c";
      ctx.beginPath();
      ctx.arc(end.x, end.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const forward = angle;
  const radialGunCount = carType === "eight-way" ? 8 : 4;
  if (!playerCar || carType === "standard") {
    drawGun(forward);
  } else if (carType === "double") {
    drawGun(forward, -12);
    drawGun(forward, 12);
  } else if (carType === "quadruple") {
    for (const offset of [-18, -6, 6, 18]) drawGun(forward, offset);
  } else if (carType === "double-triple") {
    for (const offset of [-12, 0, 12]) {
      drawGun(forward, offset);
      drawGun(forward + Math.PI, offset);
    }
  } else if (carType === "circle" || carType === "eight-way") {
    for (let i = 0; i < radialGunCount; i++) drawGun(forward + (Math.PI * 2 * i) / radialGunCount);
  } else if (carType === "double-four-way") {
    for (let i = 0; i < 4; i++) {
      const direction = forward + (Math.PI * 2 * i) / 4;
      drawGun(direction, -8);
      drawGun(direction, 8);
    }
  } else if (carType === "double-boom") {
    drawGun(forward, -12, true);
    drawGun(forward, 12, true);
  } else if (carType === "sniper") {
    drawGun(forward, 0, true, true);
  } else {
    drawGun(forward, 0, true);
  }
  ctx.restore();
}

function drawRocket(ctx: CanvasRenderingContext2D, rocket: Rocket) {
  const center = project3d(rocket.x, rocket.y, rocket.z);
  const speed = Math.hypot(rocket.vx, rocket.vy, rocket.vz);
  const tip = project3d(
    rocket.x + (rocket.vx / speed) * 18,
    rocket.y + (rocket.vy / speed) * 18,
    rocket.z + (rocket.vz / speed) * 18,
  );
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(Math.atan2(tip.y - center.y, tip.x - center.x));
  ctx.fillStyle = "#e7ece8";
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(3, -5);
  ctx.lineTo(-7, -4);
  ctx.lineTo(-7, 4);
  ctx.lineTo(3, 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ef5a27";
  ctx.fillRect(-10, -3, 5, 6);
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D) {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawArena(ctx);

  for (const enemy of enemies) {
    drawCar(ctx, enemy.x, enemy.y, enemy.angle, false, enemy.hitFlash);
    ctx.save();
    const barPosition = project3d(enemy.x, enemy.y, 72);
    ctx.translate(barPosition.x, barPosition.y);
    ctx.fillStyle = "#111718";
    ctx.fillRect(-20, -3, 40, 5);
    ctx.fillStyle = "#e85b32";
    ctx.fillRect(-20, -3, 40 * (enemy.health / enemy.maxHealth), 5);
    ctx.restore();
  }

  if (gameMode === "multiplayer") {
    drawCar(ctx, remotePlayer.x, remotePlayer.y, remotePlayer.angle, false);
    ctx.save();
    const rivalBar = project3d(remotePlayer.x, remotePlayer.y, 72);
    ctx.translate(rivalBar.x, rivalBar.y);
    ctx.fillStyle = "#111718";
    ctx.fillRect(-20, -3, 40, 5);
    ctx.fillStyle = "#e85b32";
    ctx.fillRect(-20, -3, 40 * (opponentHealth / 100), 5);
    ctx.restore();
  }
  drawCar(ctx, player.x, player.y, player.angle, true);
  for (const rocket of rockets) drawRocket(ctx, rocket);

  for (const particle of particles) {
    ctx.globalAlpha = Math.min(1, particle.life * 2);
    ctx.fillStyle = particle.color;
    const particlePosition = project3d(particle.x, particle.y, 10);
    ctx.beginPath();
    ctx.arc(particlePosition.x, particlePosition.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function frame(time: number) {
  const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
  lastTime = time;
  update(dt);
  updateProjection();
  draw(gameContext);
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key))
    event.preventDefault();
  keys.add(key);
  if (key === " ") fireRocket();
  if (key === "p" || key === "escape") togglePause();
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("pointerup", () => {
  shooting = false;
});
window.addEventListener("blur", clearInputs);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearInputs();
});
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== gameCanvas) clearInputs();
});
gameCanvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (event.button !== 0 || state !== "playing") return;
  shooting = true;
  if (document.pointerLockElement !== gameCanvas) {
    void gameCanvas.requestPointerLock();
  }
  fireRocket();
});
document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement === gameCanvas) {
    cameraAngle += event.movementX * 0.003;
    cameraPitch = Math.max(
      minimumCameraPitch,
      Math.min(Math.PI / 2, cameraPitch + event.movementY * 0.002),
    );
    player.angle = cameraAngle;
  }
});

function togglePause() {
  if (gameMode === "multiplayer") return;
  if (state === "playing") {
    clearInputs();
    state = "paused";
    unlockPointer();
    pauseButton.textContent = "▶";
    messageKicker.textContent = "MATCH PAUSED";
    messageTitle.textContent = "HOLD POSITION";
    messageText.textContent = "Press resume when you're ready.";
    startButton.textContent = "RESUME";
    message.classList.add("visible");
  } else if (state === "paused") {
    startGame();
    lockPointer();
  }
}

function lockPointer() {
  if (document.pointerLockElement !== gameCanvas) {
    void gameCanvas.requestPointerLock();
  }
}

function unlockPointer() {
  if (document.pointerLockElement === gameCanvas) {
    document.exitPointerLock();
  }
}

startButton.addEventListener("click", () => {
  if (state === "won" && gameMode === "multiplayer") {
    showMenu();
  } else if (state === "won" && gameMode === "tutorial" && level === 5) {
    level = 1;
    carType = "standard";
    showMenu();
  } else if (state === "paused") {
    state = "playing";
    message.classList.remove("visible");
    pauseButton.textContent = "Ⅱ";
    lockPointer();
  } else if (state === "tutorialReady") {
    state = "playing";
    startButton.hidden = true;
    message.classList.remove("visible");
    lockPointer();
  } else if (state === "won") {
    if (level >= 5) {
      level = 1;
      carType = "standard";
    } else {
      level += 1;
    }
    startGame();
    lockPointer();
  } else if (state === "lost") {
    if (gameMode === "multiplayer") showMenu();
    else {
      startGame();
      lockPointer();
    }
  } else {
    startGame();
    lockPointer();
  }
});

document.querySelector("#tutorialModeButton")!.addEventListener("click", () => {
  gameMode = "tutorial";
  level = 1;
  carType = "standard";
  startGame();
});
document.querySelector("#campaignModeButton")!.addEventListener("click", () => {
  gameMode = "campaign";
  level = 1;
  carType = "standard";
  startGame();
  lockPointer();
});
document.querySelector("#multiplayerModeButton")!.addEventListener("click", () => {
  gameMode = "multiplayer";
  showOnlinePanel();
});
hostRoomButton.addEventListener("click", () => {
  void createRoom();
});
joinRoomButton.addEventListener("click", () => {
  void joinRoom();
});
document.querySelector("#backToModesButton")!.addEventListener("click", showMenu);
async function copyInviteLink() {
  try {
    await navigator.clipboard.writeText(inviteLinkInput.value);
    setNetworkStatus("Invite link copied. Send it to your friend.");
  } catch {
    inviteLinkInput.select();
    setNetworkStatus("Copy was blocked. Select and copy the invite link above.");
  }
}
document.querySelector("#copyInviteButton")!.addEventListener("click", () => {
  void copyInviteLink();
});

carChoices.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>("button[data-car]");
  const selected = button?.dataset.car;
  if (
    selected === "double" ||
    selected === "boom" ||
    selected === "circle" ||
    selected === "quadruple" ||
    selected === "double-triple" ||
    selected === "eight-way" ||
    selected === "double-four-way" ||
    selected === "double-boom" ||
    selected === "sniper"
  ) {
    carType = selected;
    level = level === 2 ? 3 : 5;
    carChoices.classList.remove("visible");
    startGame();
    lockPointer();
  }
});
pauseButton.addEventListener("click", togglePause);
showMenu();
const roomFromUrl = new URLSearchParams(window.location.search).get("room");
if (roomFromUrl) {
  gameMode = "multiplayer";
  showOnlinePanel();
  roomCodeInput.value = roomFromUrl;
  void joinRoom();
}
requestAnimationFrame(frame);
