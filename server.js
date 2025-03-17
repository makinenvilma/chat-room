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

const RoomSchema = new mongoose.Schema({
  name: String,
  password: String,
  messages: [{ user: String, text: String, timestamp: Date }],
});

const Room = mongoose.model("Room", RoomSchema);

const activeRooms = {};

app.get("/rooms", async (req, res) => {
  const rooms = await Room.find({}, "name password");
  res.json(rooms);
});

app.post("/rooms", async (req, res) => {
  const { name, password } = req.body;
  if (!name) return res.status(400).json({ error: "Huoneen nimi on pakollinen" });

  const newRoom = new Room({ name, password, messages: [] });
  await newRoom.save();
  res.json(newRoom);
});

app.get("/messages", async (req, res) => {
  try {
    const rooms = await Room.find({}, "name messages");
    const allMessages = rooms.map(room => ({
      room: room.name,
      messages: room.messages
    }));

    res.json(allMessages);
  } catch (error) {
    console.error("❌ Viestien hakeminen epäonnistui:", error);
    res.status(500).json({ error: "Palvelinvirhe" });
  }
});

io.on("connection", (socket) => {
  console.log("🔗 Käyttäjä liittyi");

  socket.on("joinRoom", async ({ roomName, password, username }) => {
    const room = await Room.findOne({ name: roomName });
    if (!room) return socket.emit("error", "Huonetta ei löydy!");

    if (room.password && room.password !== password) {
      return socket.emit("error", "Väärä salasana!");
    }

    socket.join(roomName);

    if (activeRooms[roomName]?.timeout) {
      clearTimeout(activeRooms[roomName].timeout);
      delete activeRooms[roomName].timeout;
    }

    activeRooms[roomName] = activeRooms[roomName] || { users: 0 };
    activeRooms[roomName].users++;

    socket.emit("roomJoined", room.messages);
  });

  socket.on("sendMessage", async ({ roomName, message, username }) => {
    const room = await Room.findOne({ name: roomName });
    if (!room) return socket.emit("error", "Huonetta ei löydy!");

    const newMessage = { user: username, text: message, timestamp: new Date() };
    await Room.updateOne({ name: roomName }, { $push: { messages: newMessage } });
    io.to(roomName).emit("newMessage", newMessage);
  });

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

  socket.on("disconnect", () => {
    console.log("❌ Käyttäjä poistui", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Serveri käynnissä portissa ${PORT}`));
