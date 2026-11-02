const socket = io();

// Room elements
const roomContainer = document.getElementById("room-container");
const gameContainer = document.getElementById("game-container");
const createRoomButton = document.getElementById("createRoomButton");
const joinRoomButton = document.getElementById("joinRoomButton");
const roomCodeInput = document.getElementById("roomCodeInput");
const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const startButton = document.getElementById("startButton");

// Game state
let players = {};
let raceStarted = false;
let roomCode = null;
let playerModels = {};
let myPlayerId = null;

// Input state
const keys = {
  w: false,
  s: false,
  a: false,
  d: false,
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
};

// 3D Scene setup
const canvas = document.getElementById("gameCanvas");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue

const camera = new THREE.PerspectiveCamera(
  75,
  canvas.width / canvas.height,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(canvas.width, canvas.height);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(50, 50, 50);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.left = -100;
directionalLight.shadow.camera.right = 100;
directionalLight.shadow.camera.top = 100;
directionalLight.shadow.camera.bottom = -100;
scene.add(directionalLight);

// Create track
function createTrack() {
  // Ground
  const groundGeometry = new THREE.PlaneGeometry(200, 40);
  const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x4a5d23 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  // Race track
  const trackGeometry = new THREE.PlaneGeometry(200, 20);
  const trackMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const track = new THREE.Mesh(trackGeometry, trackMaterial);
  track.rotation.x = -Math.PI / 2;
  track.position.y = -0.4;
  scene.add(track);

  // Track lines
  for (let i = -90; i <= 90; i += 20) {
    const lineGeometry = new THREE.PlaneGeometry(2, 0.5);
    const lineMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const line = new THREE.Mesh(lineGeometry, lineMaterial);
    line.rotation.x = -Math.PI / 2;
    line.position.set(i, -0.35, 0);
    scene.add(line);
  }

  // Start line
  const startLineGeometry = new THREE.PlaneGeometry(2, 20);
  const startLineMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const startLine = new THREE.Mesh(startLineGeometry, startLineMaterial);
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(-80, -0.35, 0);
  scene.add(startLine);

  // Finish line
  const finishLineGeometry = new THREE.PlaneGeometry(2, 20);
  const finishLineMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  const finishLine = new THREE.Mesh(finishLineGeometry, finishLineMaterial);
  finishLine.rotation.x = -Math.PI / 2;
  finishLine.position.set(100, -0.35, 0);
  scene.add(finishLine);

  // Barriers
  for (let side of [-12, 12]) {
    const barrierGeometry = new THREE.BoxGeometry(200, 2, 1);
    const barrierMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const barrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
    barrier.position.set(0, 1, side);
    barrier.castShadow = true;
    scene.add(barrier);
  }
}

createTrack();

// Camera setup
let cameraTarget = null;
camera.position.set(0, 10, 15);

// GLTF Loader
const loader = new THREE.GLTFLoader();
let carModel = null;

loader.load(
  "/models/Car.gltf",
  function (gltf) {
    carModel = gltf.scene;
    carModel.scale.set(2, 2, 2);
    carModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    console.log("Car model loaded successfully");
  },
  function (progress) {
    console.log("Loading progress:", progress);
  },
  function (error) {
    console.error("Error loading car model:", error);
  }
);

// Socket event handlers
socket.on("roomCreated", (newRoomCode) => {
  roomCode = newRoomCode;
  roomCodeDisplay.innerText = `Room Code: ${roomCode}`;
  showGame();
});

socket.on("joinSuccess", (joinedRoomCode) => {
  roomCode = joinedRoomCode;
  showGame();
});

socket.on("players", (serverPlayers) => {
  players = serverPlayers;
  // Get my player ID
  if (!myPlayerId) {
    myPlayerId = socket.id;
  }
  updatePlayerModels();
});

socket.on("start", () => {
  raceStarted = true;
  startButton.disabled = true;
});

socket.on("winner", (winnerName) => {
  alert(`${winnerName} wins the race!`);
  raceStarted = false;
  startButton.disabled = false;
});

socket.on("error", (message) => {
  alert(message);
});

function showGame() {
  roomContainer.style.display = "none";
  gameContainer.style.display = "block";
}

function updatePlayerModels() {
  if (!carModel) return;

  const currentIds = Object.keys(players);
  const modeledIds = Object.keys(playerModels);

  // Remove disconnected players
  modeledIds.forEach((id) => {
    if (!currentIds.includes(id)) {
      scene.remove(playerModels[id]);
      delete playerModels[id];
    }
  });

  // Add new players
  currentIds.forEach((id) => {
    if (!playerModels[id]) {
      const playerCar = carModel.clone();

      // Apply player color to car body
      playerCar.traverse((child) => {
        if (child.isMesh && child.material) {
          if (
            child.material.name === "paintRed" ||
            child.material.name === "paintYellow"
          ) {
            child.material = child.material.clone();
            child.material.color.setHex(players[id].color.replace("#", "0x"));
          }
        }
      });

      scene.add(playerCar);
      playerModels[id] = playerCar;
    }

    // Update positions and rotations
    const player = players[id];
    const model = playerModels[id];

    model.position.set(player.x, player.y, player.z);
    model.rotation.y = player.rotation;

    // Update camera to follow player
    if (id === myPlayerId) {
      cameraTarget = model;
    }
  });
}

function updateCamera() {
  if (cameraTarget && raceStarted) {
    const targetPos = cameraTarget.position;
    const offset = new THREE.Vector3(
      -15 * Math.sin(cameraTarget.rotation.y),
      8,
      -15 * Math.cos(cameraTarget.rotation.y)
    );

    camera.position.lerp(targetPos.clone().add(offset), 0.1);
    camera.lookAt(targetPos.x, targetPos.y + 2, targetPos.z);
  }
}

function sendInput() {
  if (!roomCode || !raceStarted) return;

  const accelerate = keys.w || keys.ArrowUp;
  const brake = keys.s || keys.ArrowDown;
  const turnLeft = keys.a || keys.ArrowLeft;
  const turnRight = keys.d || keys.ArrowRight;

  socket.emit("carInput", {
    roomCode,
    accelerate,
    brake,
    turnLeft,
    turnRight,
  });
}

// Input handling
window.addEventListener("keydown", (e) => {
  if (e.code in keys || e.key in keys) {
    keys[e.code] = true;
    keys[e.key] = true;
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code in keys || e.key in keys) {
    keys[e.code] = false;
    keys[e.key] = false;
    e.preventDefault();
  }
});

// Button event listeners
createRoomButton.addEventListener("click", () => {
  socket.emit("createRoom");
});

joinRoomButton.addEventListener("click", () => {
  const code = roomCodeInput.value.toUpperCase();
  if (code) {
    socket.emit("joinRoom", code);
  }
});

startButton.addEventListener("click", () => {
  if (roomCode) {
    socket.emit("start", roomCode);
  }
});

// Game loop
function animate() {
  requestAnimationFrame(animate);

  sendInput();
  updateCamera();

  renderer.render(scene, camera);
}

animate();
