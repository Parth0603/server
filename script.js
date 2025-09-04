const socket = io({
  transports: ['websocket', 'polling'],
  timeout: 20000,
  forceNew: true
});

const playerName = localStorage.getItem("playerName");
const playerColor = localStorage.getItem("playerColor");
const playerStyle = localStorage.getItem("playerStyle") || "casual";
const playerHair = localStorage.getItem("playerHair") || "short";

if (!playerName) {
    window.location.href = "home.html";
}

const ROWS = 15, COLS = 20, TILE = 32;
let zoneColors = ["#495057", "#f8f9fa", "#4285f4", "#34a853", "#fbbc04", "#ea4335", "#9c27b0"];

let editingMap = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
let currentZone = 1;
let painting = false;

const editorCanvas = document.getElementById("editorCanvas");
const edCtx = editorCanvas.getContext("2d");
const zonePicker = document.getElementById("zonePicker");
const startBtn = document.getElementById("startBtn");
const mapEditor = document.getElementById("mapEditor");
const gameArea = document.getElementById("gameArea");
const popupLayer = document.getElementById("popup-layer");
const presenceList = document.getElementById("presence-list");
const cameraLockBtn = document.getElementById("cameraLockBtn");
const meetingEndedModal = document.getElementById("meetingEndedModal");

function buildZonePicker() {
	zonePicker.innerHTML = "";
	zoneColors.forEach((clr, idx) => {
		let btn = document.createElement("div");
		btn.className = "tool-btn" + (currentZone === idx ? " selected" : "");
		btn.style.background = clr;
		btn.title = idx === 0 ? "Wall" : idx === 1 ? "Common" : `Zone ${idx}`;
		btn.onclick = () => { currentZone = idx; buildZonePicker(); };
		zonePicker.appendChild(btn);
	});
}

function paintTile(e) {
	const rect = editorCanvas.getBoundingClientRect();
	let x = Math.floor((e.clientX - rect.left) / TILE);
	let y = Math.floor((e.clientY - rect.top) / TILE);
	if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
		editingMap[y][x] = currentZone;
		drawEditorMap();
	}
}

function drawEditorMap() {
	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLS; x++) {
			edCtx.fillStyle = zoneColors[editingMap[y][x]] || "#888";
			edCtx.fillRect(x * TILE, y * TILE, TILE, TILE);
			edCtx.strokeStyle = "#fff";
			edCtx.strokeRect(x * TILE, y * TILE, TILE, TILE);
		}
	}
}

editorCanvas.addEventListener("mousedown", (e) => { painting = true; paintTile(e); });
editorCanvas.addEventListener("mouseup", () => (painting = false));
editorCanvas.addEventListener("mouseleave", () => (painting = false));
editorCanvas.addEventListener("mousemove", (e) => { if (painting) paintTile(e); });

buildZonePicker();
drawEditorMap();

let playerMap = null;
let myId = null;
let players = {};
let myRole = "user";
let hostId = null;
let zoneRoster = {};
let zoneRequests = {};
let speed = 2.3;
let keysPressed = {};
let running = false;

const main3d = document.getElementById("main3d");
let renderer, scene, camera;
let tileMeshes = [];
let avatarMeshes = [];
const avatarRadius = 12;

function createPersonAvatar(color, style, hair, isHost = false) {
    const group = new THREE.Group();
    const colorHex = typeof color === 'string' ? parseInt(color.replace('#', '0x')) : color;
    
    // Professional suit jacket
    const jacketGeo = new THREE.BoxGeometry(5, 8, 2.5);
    let jacketColor;
    if (style === 'business') jacketColor = 0x1a1a1a;
    else if (style === 'creative') jacketColor = colorHex;
    else jacketColor = 0x2c3e50;
    
    const jacketMat = new THREE.MeshPhongMaterial({ 
        color: jacketColor,
        emissive: isHost ? 0x4285f4 : 0x000000,
        emissiveIntensity: isHost ? 0.2 : 0,
        shininess: 50
    });
    const jacket = new THREE.Mesh(jacketGeo, jacketMat);
    jacket.position.y = 18;
    group.add(jacket);
    
    // White shirt
    const shirtGeo = new THREE.BoxGeometry(4.5, 7, 2);
    const shirtMat = new THREE.MeshPhongMaterial({ 
        color: 0xffffff,
        emissive: isHost ? 0x4285f4 : 0x000000,
        emissiveIntensity: isHost ? 0.1 : 0,
        shininess: 30
    });
    const shirt = new THREE.Mesh(shirtGeo, shirtMat);
    shirt.position.set(0, 18, 1.3);
    group.add(shirt);
    
    // Professional tie - only for business and casual
    if (style !== 'creative') {
        const tieGeo = new THREE.BoxGeometry(1, 6, 0.2);
        const tieMat = new THREE.MeshPhongMaterial({ 
            color: style === 'business' ? 0x8b0000 : colorHex,
            emissive: isHost ? 0x4285f4 : 0x000000,
            emissiveIntensity: isHost ? 0.15 : 0
        });
        const tie = new THREE.Mesh(tieGeo, tieMat);
        tie.position.set(0, 18, 2.4);
        group.add(tie);
    }
    
    // Professional head
    const headGeo = new THREE.SphereGeometry(2.8, 20, 20);
    const headMat = new THREE.MeshPhongMaterial({ 
        color: 0xfdbcb4,
        emissive: isHost ? 0x4285f4 : 0x000000,
        emissiveIntensity: isHost ? 0.15 : 0,
        shininess: 20
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 25;
    group.add(head);
    
    // Professional hair with different styles
    if (hair !== 'bald') {
        let hairGeo;
        if (hair === 'long') {
            hairGeo = new THREE.SphereGeometry(3.2, 16, 16);
        } else if (hair === 'curly') {
            hairGeo = new THREE.SphereGeometry(3.1, 8, 8);
        } else {
            hairGeo = new THREE.SphereGeometry(2.9, 16, 16);
        }
        
        const hairMat = new THREE.MeshPhongMaterial({ 
            color: 0x4a4a4a,
            emissive: isHost ? 0x4285f4 : 0x000000,
            emissiveIntensity: isHost ? 0.1 : 0
        });
        const hairMesh = new THREE.Mesh(hairGeo, hairMat);
        hairMesh.position.y = hair === 'long' ? 26 : 25.5;
        hairMesh.scale.y = hair === 'long' ? 1.1 : hair === 'curly' ? 0.8 : 0.7;
        group.add(hairMesh);
    }
    
    // Arms in suit sleeves
    const armGeo = new THREE.CylinderGeometry(0.8, 1, 10, 16);
    const armMat = new THREE.MeshPhongMaterial({ 
        color: style === 'business' ? 0x1a1a1a : 0x2c3e50,
        emissive: isHost ? 0x4285f4 : 0x000000,
        emissiveIntensity: isHost ? 0.2 : 0
    });
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-3.5, 18, 0);
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(3.5, 18, 0);
    group.add(leftArm, rightArm);
    
    // Hands
    const handGeo = new THREE.SphereGeometry(0.7, 12, 12);
    const handMat = new THREE.MeshPhongMaterial({ 
        color: 0xfdbcb4,
        emissive: isHost ? 0x4285f4 : 0x000000,
        emissiveIntensity: isHost ? 0.1 : 0
    });
    const leftHand = new THREE.Mesh(handGeo, handMat);
    leftHand.position.set(-3.5, 12, 0);
    const rightHand = new THREE.Mesh(handGeo, handMat);
    rightHand.position.set(3.5, 12, 0);
    group.add(leftHand, rightHand);
    
    // Professional pants
    const legGeo = new THREE.CylinderGeometry(1.2, 1.4, 12, 16);
    const legMat = new THREE.MeshPhongMaterial({ 
        color: style === 'business' ? 0x1a1a1a : 0x2c3e50,
        emissive: isHost ? 0x4285f4 : 0x000000,
        emissiveIntensity: isHost ? 0.2 : 0,
        shininess: 40
    });
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-1.2, 8, 0);
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(1.2, 8, 0);
    group.add(leftLeg, rightLeg);
    
    // Professional shoes
    const shoeGeo = new THREE.BoxGeometry(2, 1.2, 3);
    const shoeMat = new THREE.MeshPhongMaterial({ 
        color: 0x000000,
        emissive: isHost ? 0x4285f4 : 0x000000,
        emissiveIntensity: isHost ? 0.1 : 0,
        shininess: 80
    });
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(-1.2, 1.5, 0.3);
    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(1.2, 1.5, 0.3);
    group.add(leftShoe, rightShoe);
    
    // Store references for animation
    group.userData = {
        leftArm, rightArm, leftLeg, rightLeg,
        jacket, head, leftShoe, rightShoe,
        lastX: 0, lastZ: 0, walkCycle: 0
    };
    
    // Enable shadows for all parts
    group.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    
    return group;
}

let isCameraLocked = true;
let cameraTarget = new THREE.Vector3();
let freeLookCameraDistance = 800;
let freeLookCameraRotX = 0.5, freeLookCameraRotY = 0.5;
let dragging = false;
let lastX, lastY;

startBtn.onclick = () => {
	socket.emit("submitMap", { map: editingMap, zoneColors });
};

socket.on("mapData", (data) => {
	playerMap = data.map;
	zoneColors = data.zoneColors.map((c) => parseInt(c.replace("#", "0x")));
	setup3D();
	buildTiles();
	mapEditor.style.display = "none";
	gameArea.style.display = "flex";
	setTimeout(() => socket.emit("joinAfterMap", { name: playerName, color: playerColor, style: playerStyle, hair: playerHair }), 100);
});

socket.on("updateState", (data) => {
	players = data.players;
	zoneRoster = data.zoneRoster;
	hostId = data.hostId;
	myRole = players[myId] ? players[myId].role : "user";
	zoneRequests = data.zoneRequests || {};
	renderPresenceList();
});

socket.on("connect", () => { myId = socket.id; });

socket.on("meetingEnded", (data) => {
	document.getElementById("meetingEndedModal").style.display = "flex";
});

document.addEventListener("keydown", (e) => {
	const key = e.key.toLowerCase();
	if (["w", "a", "s", "d"].includes(key)) keysPressed[key] = true;
	if (key === "shift") running = true;
});

document.addEventListener("keyup", (e) => {
	const key = e.key.toLowerCase();
	if (["w", "a", "s", "d"].includes(key)) keysPressed[key] = false;
	if (key === "shift") running = false;
});

cameraLockBtn.addEventListener("click", () => {
    isCameraLocked = !isCameraLocked;
    cameraLockBtn.classList.toggle("locked", isCameraLocked);
    cameraLockBtn.innerText = isCameraLocked ? "Unlock Camera" : "Lock Camera";
});

document.addEventListener('mousedown', (e) => {
    const button = e.target.closest('#popup-layer .avatar-popup-btn');
    if (!button) return;
    const { action, userId, zoneId } = button.dataset;
    if (action === 'approve') hostApprove(userId, zoneId, true);
    else if (action === 'deny') hostApprove(userId, zoneId, false);
});

function setup3D() {
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	main3d.appendChild(renderer.domElement);
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0xf5f5f5);
	camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 4000);
	scene.add(new THREE.AmbientLight(0xffffff, 0.6));
	const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
	dirLight.position.set(200, 300, 200);
	dirLight.castShadow = true;
	dirLight.shadow.mapSize.width = 1024;
	dirLight.shadow.mapSize.height = 1024;
	dirLight.shadow.camera.near = 0.5;
	dirLight.shadow.camera.far = 1000;
	dirLight.shadow.camera.left = -500;
	dirLight.shadow.camera.right = 500;
	dirLight.shadow.camera.top = 500;
	dirLight.shadow.camera.bottom = -500;
	scene.add(dirLight);
	addCameraControls();
}

function addCameraControls() {
	renderer.domElement.addEventListener("mousedown", (e) => {
		if (!isCameraLocked) {
            dragging = true;
		    lastX = e.clientX;
		    lastY = e.clientY;
        }
	});
	window.addEventListener("mouseup", () => (dragging = false));
	window.addEventListener("mousemove", (e) => {
		if (!dragging || isCameraLocked) return;
		const dx = e.clientX - lastX;
		const dy = e.clientY - lastY;
		lastX = e.clientX;
		lastY = e.clientY;
		freeLookCameraRotY -= dx * 0.005;
		freeLookCameraRotX -= dy * 0.005;
		freeLookCameraRotX = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, freeLookCameraRotX));
	});
	renderer.domElement.addEventListener("wheel", (e) => {
        if (!isCameraLocked) {
			freeLookCameraDistance += e.deltaY * 0.3;
			freeLookCameraDistance = Math.min(Math.max(freeLookCameraDistance, 200), 1500);
        }
	}, { passive: true });
}

function updateCameraLogic() {
    const me = players[myId];
    if (!me) return;
    if (isCameraLocked) {
        const targetPosition = new THREE.Vector3(me.x, 20, me.y);
        cameraTarget.lerp(targetPosition, 0.1);
        const idealOffset = new THREE.Vector3(0, 150, 250);
        const idealPosition = new THREE.Vector3().addVectors(cameraTarget, idealOffset);
        camera.position.lerp(idealPosition, 0.08);
        camera.lookAt(cameraTarget);
    } else {
        const x = cameraTarget.x + freeLookCameraDistance * Math.sin(freeLookCameraRotY) * Math.cos(freeLookCameraRotX);
        const y = cameraTarget.y + freeLookCameraDistance * Math.sin(freeLookCameraRotX);
        const z = cameraTarget.z + freeLookCameraDistance * Math.cos(freeLookCameraRotY) * Math.cos(freeLookCameraRotX);
        const targetPos = new THREE.Vector3(x, y, z);
        camera.position.lerp(targetPos, 0.1);
        camera.lookAt(cameraTarget);
    }
}

function buildTiles() {
	tileMeshes.forEach((m) => scene.remove(m));
	tileMeshes = [];
	for (let y = 0; y < playerMap.length; y++) {
		for (let x = 0; x < playerMap[y].length; x++) {
			const zoneId = playerMap[y][x];
			const colorNum = zoneColors[zoneId] || 0x999999;
			const height = zoneId === 0 ? 100 : 3;
			const mat = new THREE.MeshLambertMaterial({ 
				color: colorNum,
				transparent: zoneId !== 0,
				opacity: zoneId === 0 ? 1 : 0.9
			});
			const geo = new THREE.BoxGeometry(TILE, height, TILE);
			const mesh = new THREE.Mesh(geo, mat);
			mesh.position.set(x * TILE + TILE / 2, height / 2, y * TILE + TILE / 2);
			mesh.receiveShadow = true;
			if (zoneId === 0) mesh.castShadow = true;
			scene.add(mesh);
			tileMeshes.push(mesh);
		}
	}
}

function animate() {
	requestAnimationFrame(animate);
	if (!playerMap) return;
	let me = players[myId];
	if (me) {
		const movementSpeed = running ? speed * 2.5 : speed;
		let nx = me.x, nz = me.y;
		if (keysPressed.w) nz -= movementSpeed;
		if (keysPressed.s) nz += movementSpeed;
		if (keysPressed.a) nx -= movementSpeed;
		if (keysPressed.d) nx += movementSpeed;
		if (canMove(nx, nz) && (nx !== me.x || nz !== me.y)) {
			sendMove(nx, nz);
		}
	}
    updateCameraLogic();
	avatarMeshes.forEach((a) => scene.remove(a));
	avatarMeshes = [];
	for (const id in players) {
		const p = players[id];
		const avatar = createPersonAvatar(
			p.color || '#3182ce',
			p.style || 'casual',
			p.hair || 'short',
			p.role === 'host'
		);
		
		// Realistic walking animation
		const userData = avatar.userData;
		const deltaX = p.x - userData.lastX;
		const deltaZ = p.y - userData.lastZ;
		const isMoving = Math.abs(deltaX) > 0.1 || Math.abs(deltaZ) > 0.1;
		
		if (isMoving) {
			userData.walkCycle += 0.25;
			const armSwing = Math.sin(userData.walkCycle) * 0.4;
			const legSwing = Math.sin(userData.walkCycle) * 0.3;
			const bodyBob = Math.sin(userData.walkCycle * 2) * 0.5;
			
			// Professional walking animation
			userData.leftArm.rotation.x = armSwing * 0.3;
			userData.rightArm.rotation.x = -armSwing * 0.3;
			userData.leftLeg.rotation.x = -legSwing * 0.4;
			userData.rightLeg.rotation.x = legSwing * 0.4;
			
			// Body movement
			userData.jacket.position.y = 18 + bodyBob;
			userData.head.position.y = 25 + bodyBob;
			userData.leftShoe.position.y = 1.5 + Math.max(0, Math.sin(userData.walkCycle + Math.PI) * 0.3);
			userData.rightShoe.position.y = 1.5 + Math.max(0, Math.sin(userData.walkCycle) * 0.3);
		} else {
			// Reset to professional idle pose
			userData.leftArm.rotation.x = 0;
			userData.rightArm.rotation.x = 0;
			userData.leftLeg.rotation.x = 0;
			userData.rightLeg.rotation.x = 0;
			userData.jacket.position.y = 18;
			userData.head.position.y = 25;
			userData.leftShoe.position.y = 1.5;
			userData.rightShoe.position.y = 1.5;
		}
		
		userData.lastX = p.x;
		userData.lastZ = p.y;
		
		avatar.position.set(p.x, 3, p.y);
		avatar.rotation.y = Math.PI; // Face forward in game world
		scene.add(avatar);
		avatarMeshes.push(avatar);
	}
	renderer.render(scene, camera);
	renderPopups();
}

function canMove(newX, newZ, radius = 12) {
	if (!playerMap) return false;
	const left = Math.floor((newX - radius) / TILE), right = Math.floor((newX + radius) / TILE);
	const top = Math.floor((newZ - radius) / TILE), bottom = Math.floor((newZ + radius) / TILE);
	if (top < 0 || left < 0 || bottom >= playerMap.length || right >= playerMap[0].length) return false;
	for (let ty = top; ty <= bottom; ty++) {
		for (let tx = left; tx <= right; tx++) {
			if (playerMap[ty][tx] === 0) {
				let tileX = tx * TILE + TILE / 2, tileZ = ty * TILE + TILE / 2;
				if (Math.abs(newX - tileX) <= TILE / 2 + radius - 2 && Math.abs(newZ - tileZ) <= TILE / 2 + radius - 2) return false;
			}
        }
    }
	return true;
}

function sendMove(x, y) {
	socket.emit("playerMove", { x, y });
}

function renderPresenceList() {
	if (!zoneRoster || !myId || !players[myId]) {
		presenceList.innerHTML = "";
		return;
	}
	const myZone = players[myId].zoneId;
	if (!zoneRoster[myZone]) {
		presenceList.innerHTML = "";
		return;
	}
    const myInfo = { name: players[myId].name, color: players[myId].color, role: players[myId].role };
	const others = zoneRoster[myZone].filter((p) => p.id !== myId);
	let html = `<div class="font-semibold">People here (${others.length + 1}):</div>`;
    html += `<span class="inline-flex items-center gap-1 mr-3"><span class="presence-dot" style="background:${myInfo.color};"></span><span>${myInfo.name} (You)</span></span>`;
	html += others.map(p => `<span class="inline-flex items-center gap-1 mr-3"><span class="presence-dot" style="background:${p.color};"></span><span>${p.name}${p.role === "host" ? " 👑" : ""}</span></span>`).join("");
	presenceList.innerHTML = html;
}

function renderPopups() {
	popupLayer.innerHTML = "";
	
	// Show name labels for all players
	for (const id in players) {
		const p = players[id];
		let screenPos = toScreenPosition(new THREE.Vector3(p.x, 35, p.y));
		const nameDiv = document.createElement("div");
		nameDiv.className = "avatar-name-label";
		nameDiv.style.left = screenPos.x + "px";
		nameDiv.style.top = screenPos.y + "px";
		nameDiv.style.transform = "translate(-50%, -100%)";
		nameDiv.innerText = p.name + (p.role === "host" ? " 👑" : "");
		popupLayer.appendChild(nameDiv);
	}
	
	if (myRole === "host" && zoneRequests) {
		for (const userId in zoneRequests) {
			const req = zoneRequests[userId];
			if (req.status === "pending" && players[userId]) {
				const p = players[userId];
				let screenPos = toScreenPosition(new THREE.Vector3(p.x, 45, p.y));
				const div = document.createElement("div");
				div.className = "avatar-popup-host";
				div.style.left = screenPos.x + "px";
				div.style.top = screenPos.y + "px";
				div.style.transform = "translate(-50%, -100%)";
                div.innerHTML = `<button class="avatar-popup-btn" data-action="approve" data-user-id="${userId}" data-zone-id="${req.zoneId}">Y</button><button class="avatar-popup-btn avatar-popup-btn-deny" data-action="deny" data-user-id="${userId}" data-zone-id="${req.zoneId}">N</button>`;
                popupLayer.appendChild(div);
			}
		}
	}
	if (zoneRequests[myId] && players[myId]) {
		const p = players[myId];
		let screenPos = toScreenPosition(new THREE.Vector3(p.x, 50, p.y));
		const div = document.createElement("div");
		div.className = "avatar-popup-user";
		div.style.left = screenPos.x + "px";
		div.style.top = screenPos.y + "px";
		div.style.transform = "translate(-50%, -100%)";
		if (zoneRequests[myId].status === "pending") div.innerText = "Waiting for host...";
		else if (zoneRequests[myId].status === "denied") {
			div.className += " denied";
			div.innerText = "Entry Denied";
		}
		popupLayer.appendChild(div);
	}
}

function toScreenPosition(pos) {
	const widthHalf = 0.5 * renderer.domElement.clientWidth;
	const heightHalf = 0.5 * renderer.domElement.clientHeight;
	const vector = pos.clone().project(camera);
	return { x: vector.x * widthHalf + widthHalf, y: -vector.y * heightHalf + heightHalf };
}

function hostApprove(userId, zoneId, approved) {
  socket.emit("zonePermissionResponse", { userId, zoneId, approved });
}

animate();