const socket = io("http://localhost:5000");

let username = generateRandomUsername();
let currentRoom = null;

// ✅ Kun sivu latautuu, asetetaan käyttäjänimi ja haetaan huoneet
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("display-username").textContent = username;
  loadRooms();
});

// ✅ Luo satunnainen käyttäjänimi
function generateRandomUsername() {
  return "Käyttäjä" + Math.floor(Math.random() * 1000);
}

// ✅ Lataa huonelista palvelimelta
async function loadRooms() {
  try {
    const response = await fetch("http://localhost:5000/rooms");
    const rooms = await response.json();

    const roomList = document.getElementById("available-rooms");
    roomList.innerHTML = "";

    rooms.forEach((room) => {
      const li = document.createElement("li");
      li.textContent = room.name;

      if (room.password) {
        const lockIcon = document.createElement("span");
        lockIcon.textContent = "🔒";
        li.appendChild(lockIcon);
      }

      const joinButton = document.createElement("button");
      joinButton.textContent = "Liity";
      joinButton.onclick = () => joinRoom(room);
      li.appendChild(joinButton);

      roomList.appendChild(li);
    });
  } catch (error) {
    console.error("Huoneiden lataus epäonnistui:", error);
  }
}

// ✅ Luo uusi huone
async function createRoom() {
  const roomName = document.getElementById("room-name").value;
  const roomPassword = document.getElementById("room-password").value;

  if (!roomName.trim()) {
    alert("Huoneen nimi on pakollinen!");
    return;
  }

  try {
    await fetch("http://localhost:5000/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: roomName, password: roomPassword }),
    });

    loadRooms();
  } catch (error) {
    console.error("Huoneen luonti epäonnistui:", error);
  }
}

// ✅ Liity huoneeseen
function joinRoom(room) {
  currentRoom = room.name;
  socket.emit("joinRoom", { roomName: room.name, password: room.password, username });

  document.getElementById("room-title").textContent = `Huone: ${room.name}`;
  document.getElementById("room-list").style.display = "none";
  document.getElementById("create-room").style.display = "none";
  document.getElementById("chat-room").style.display = "block";

  socket.on("roomJoined", (messages) => {
    loadMessages(messages);
  });


    // Ensure we remove previous listeners before adding a new one
    socket.off("newMessage");  
    socket.on("newMessage", (message) => {
    
    displayMessage(message);
  });
}

// ✅ Poistu huoneesta
function leaveRoom() {
  currentRoom = null;
  document.getElementById("room-list").style.display = "block";
  document.getElementById("create-room").style.display = "block";
  document.getElementById("chat-room").style.display = "none";
  document.getElementById("room-title").textContent = "";
}

// ✅ Lähetä viesti
function sendMessage() {
  const messageInput = document.getElementById("message-input");
  const messageText = messageInput.value.trim();

  if (!messageText || !currentRoom) return;

  socket.emit("sendMessage", { roomName: currentRoom, message: messageText, username });

  messageInput.value = ""; // Tyhjennä viestikenttä
}

// ✅ Aseta uusi käyttäjänimi
function setUsername() {
  const usernameInput = document.getElementById("username-input").value.trim();
  if (usernameInput) {
    username = usernameInput;
    document.getElementById("display-username").textContent = username;
  }
}

// ✅ Lataa huoneen viestit
function loadMessages(messages) {
  const messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = "";
  messages.forEach(displayMessage);
}

// ✅ Näytä yksittäinen viesti
function displayMessage(message) {
  const messagesDiv = document.getElementById("messages");
  const msgDiv = document.createElement("div");
  msgDiv.textContent = `${message.user}: ${message.text}`;
  messagesDiv.appendChild(msgDiv);
}
