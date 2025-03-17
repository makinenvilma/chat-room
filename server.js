require("dotenv").config();
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/chatroom", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("✅ MongoDB-yhteys onnistui"))
  .catch((err) => console.error("❌ MongoDB-virhe:", err));

// ✅ Määritellään MongoDB:n skeemat
const RoomSchema = new mongoose.Schema({
  name: String,
  password: String,
});
const Room = mongoose.model("Room", RoomSchema);

const MessageSchema = new mongoose.Schema({
  roomName: String,
  user: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model("Message", MessageSchema);

const activeRooms = {};

// ✅ API-reitit huoneille ja viesteille
app.get("/rooms", async (req, res) => {
  const rooms = await Room.find({}, "name password");
  res.json(rooms);
});

app.post("/rooms", async (req, res) => {
  const { name, password } = req.body;
  if (!name) return res.status(400).json({ error: "Huoneen nimi on pakollinen" });

  const newRoom = new Room({ name, password });
  await newRoom.save();
  res.json(newRoom);
});

app.get("/messages", async (req, res) => {
  try {
    const messages = await Message.find({}, "roomName user text timestamp");
    res.json(messages);
  } catch (error) {
    console.error("❌ Viestien hakeminen epäonnistui:", error);
    res.status(500).json({ error: "Palvelinvirhe" });
  }
});

// ✅ Socket.IO-yhteydet
io.on("connection", (socket) => {
  console.log("🔗 Käyttäjä liittyi:", socket.id);

  // ✅ Poistetaan aiempi "sendMessage"-tapahtumankäsittelijä ennen uuden rekisteröintiä
  socket.removeAllListeners("sendMessage");

  // ✅ Viestin lähettäminen (rekisteröidään vain kerran per socket)
  socket.on("sendMessage", async ({ roomName, message, username }) => {
    if (!roomName) return socket.emit("error", "Huonetta ei määritelty!");

    const room = await Room.findOne({ name: roomName });
    if (!room) return socket.emit("error", "Huonetta ei löydy!");

    const newMessage = new Message({ roomName, user: username, text: message });
    await newMessage.save();

    console.log(`📨 Viesti lähetetty huoneeseen ${roomName}:`, newMessage);

    // ✅ Lähetetään viesti vain kerran huoneeseen
    io.to(roomName).emit("newMessage", newMessage);
  });

  // ✅ Käyttäjä liittyy huoneeseen
  socket.on("joinRoom", async ({ roomName, password, username }) => {
    const room = await Room.findOne({ name: roomName });
    if (!room) return socket.emit("error", "Huonetta ei löydy!");

    if (room.password && room.password !== password) {
      return socket.emit("error", "Väärä salasana!");
    }

    // ✅ Poistetaan käyttäjä kaikista vanhoista huoneista
    const oldRooms = Array.from(socket.rooms);
    oldRooms.forEach((r) => {
      if (r !== socket.id) { // socket.id on käyttäjän oma huone, sitä ei poisteta
        socket.leave(r);
        console.log(`🚪 ${username} poistui huoneesta: ${r}`);
      }
    });

    // ✅ Liitetään käyttäjä uuteen huoneeseen
    socket.join(roomName);
    console.log(`✅ ${username} liittyi huoneeseen: ${roomName}`);

    if (activeRooms[roomName]?.timeout) {
      clearTimeout(activeRooms[roomName].timeout);
      delete activeRooms[roomName].timeout;
    }

    activeRooms[roomName] = activeRooms[roomName] || { users: 0 };
    activeRooms[roomName].users++;

    const messages = await Message.find({ roomName });
    socket.emit("roomJoined", messages);
  });

  // ✅ Käyttäjä poistuu huoneesta
  socket.on("leaveRoom", async ({ roomName, username }) => {
    console.log(`🚪 ${username} poistui huoneesta ${roomName}`);
    socket.leave(roomName);

    if (activeRooms[roomName]) {
      activeRooms[roomName].users--;

      if (activeRooms[roomName].users === 0) {
        console.log(`🕒 Käynnistetään ajastin huoneen "${roomName}" poistamiseksi 1 minuutin kuluttua...`);

        activeRooms[roomName].timeout = setTimeout(async () => {
          const roomExists = await Room.findOne({ name: roomName });

          if (roomExists) {
            await Room.deleteOne({ name: roomName });
            console.log(`❌ Huone "${roomName}" poistettu.`);
          }

          delete activeRooms[roomName];
        }, 60000);
      }
    }
  });

  // ✅ Käyttäjä katkaisee yhteyden
  socket.on("disconnect", () => {
    console.log("❌ Käyttäjä poistui", socket.id);
  });
});

// ✅ Käynnistetään palvelin
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Serveri käynnissä portissa ${PORT}`));
