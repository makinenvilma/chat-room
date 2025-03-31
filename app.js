const socket = io("http://localhost:5000");

let username = generateRandomUsername();
let currentRoom = null;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("display-username").textContent = username;
  loadRooms();
  registerUser(username);
});

function generateRandomUsername() {
  return "Käyttäjä" + Math.floor(Math.random() * 1000);
}

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

async function createRoom() {
  const roomName = document.getElementById("room-name").value;
  const roomPassword = document.getElementById("room-password").value;

  if (!roomName.trim()) {
    alert("Huoneen nimi on pakollinen!");
    return;
  }

  try {
    const response = await fetch("http://localhost:5000/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: roomName, password: roomPassword }),
    });

    if (response.status === 409) {
      const data = await response.json();
      alert(data.error || "Tämän niminen huone on jo olemassa.");
      return;
    }

    if (!response.ok) {
      throw new Error("Huoneen luonti epäonnistui.");
    }

    loadRooms();
  registerUser(username);
  } catch (error) {
    console.error("Huoneen luonti epäonnistui:", error);
    alert("Virhe luodessa huonetta. Yritä myöhemmin uudelleen.");
  }
}

function joinRoom(room) {
  currentRoom = room.name;
  socket.emit("joinRoom", { roomName: room.name, password: room.password, username });

  document.getElementById("room-title").textContent = `Huone: ${room.name}`;
  document.getElementById("room-list").style.display = "none";
  document.getElementById("create-room").style.display = "none";
  document.getElementById("chat-room").style.display = "block";

  socket.off("roomJoined");
  socket.on("roomJoined", (messages) => {
    loadMessages(messages);
  });

  socket.off("newMessage");  
  socket.on("newMessage", (message) => {
    displayMessage(message);
  });
}

function leaveRoom() {
  if (currentRoom) {
    socket.emit("leaveRoom", { roomName: currentRoom, username });
    currentRoom = null;
    returnToLobby();
  }
}

function returnToLobby() {
  document.getElementById("room-list").style.display = "block";
  document.getElementById("create-room").style.display = "block";
  document.getElementById("chat-room").style.display = "none";
  document.getElementById("room-title").textContent = "";
  setTimeout(loadRooms, 1000);
}

socket.on("roomDeleted", (roomName) => {
  if (currentRoom === roomName) {
    alert("Huone on poistettu. Sinut palautetaan aulaan.");
    currentRoom = null;
    returnToLobby();
  }
});

socket.on("newMessage", (message) => {
  displayMessage(message);
});

function sendMessage() {
  const messageInput = document.getElementById("message-input");
  const messageText = messageInput.value.trim();

  if (!messageText || !currentRoom) return;

  socket.emit("sendMessage", { roomName: currentRoom, message: messageText, username });
  messageInput.value = "";
}


function setUsername() {
  const usernameInput = document.getElementById("username-input").value.trim();
  if (usernameInput) {
    const oldUsername = username;
    const newUsername = usernameInput;
    username = newUsername;
    document.getElementById("display-username").textContent = username;

    // Lähetetään muutos backendille
    updateUsername(oldUsername, newUsername);
  }
}

async function updateUsername(oldUsername, newUsername) {
  try {
    await fetch("http://localhost:5000/users", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ oldUsername, newUsername }),
    });
  } catch (error) {
    console.error("Käyttäjänimen päivitys epäonnistui:", error);
  }
}

function loadMessages(messages) {
  const messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = "";
  messages.forEach(displayMessage);
}

function displayMessage(message) {
  const messagesDiv = document.getElementById("messages");
  const msgDiv = document.createElement("div");
  msgDiv.textContent = `${message.user}: ${message.text}`;
  messagesDiv.appendChild(msgDiv);
}


async function registerUser(username) {
  try {
    await fetch("http://localhost:5000/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
    });
  } catch (error) {
    console.error("Käyttäjän rekisteröinti epäonnistui:", error);
  }
}
